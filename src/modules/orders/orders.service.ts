import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { createHash } from 'node:crypto';

import { Order, OrderStatus, DeliveryType } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Customer } from '../customers/entities/customer.entity';
import {
  PoStatus,
  ProductBatchPrice,
} from '../products/entities/product-batch-price.entity';
import { BatchStatus } from '../batches/entities/po-batch.entity';
import { BatchesService } from '../batches/batches.service';
import { BundlesService } from '../bundles/bundles.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { PaymentStatus } from './entities/payment.entity';
import { PaymentsService, type PaymentView } from './payments.service';

export interface CreateOrderResult {
  orderNo: string;
  grandTotal: number;
  itemsCount: number;
  payment: PaymentView;
  /** Only available after the payment is verified as paid. */
  waUrl: string | null;
}

/** A resolved line before it becomes an OrderItem row. */
interface ResolvedLine {
  productId: string;
  productName: string;
  unit: string;
  qty: number;
  basePrice: number;
  margin: number;
  bundleId: string | null;
  bundleName: string | null;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(ProductBatchPrice)
    private readonly priceRepo: Repository<ProductBatchPrice>,
    private readonly batchesService: BatchesService,
    private readonly bundlesService: BundlesService,
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * The whole checkout. Prices are re-read from product_batch_prices inside
   * the transaction — the client's numbers are used for nothing but the
   * quantities, so a tampered cart cannot move the price.
   */
  async create(dto: CreateOrderDto): Promise<CreateOrderResult> {
    const batch = await this.batchesService.findOne(dto.batchId);
    if (batch.status !== BatchStatus.OPEN) {
      throw new ConflictException('PO minggu ini sudah ditutup');
    }
    const now = new Date();
    if (now < new Date(batch.opensAt) || now > new Date(batch.closesAt)) {
      throw new ConflictException('PO minggu ini sudah ditutup');
    }

    const lines = await this.resolveLines(dto, batch.id);
    if (!lines.length) throw new BadRequestException('Keranjang kosong');

    const totals = lines.reduce(
      (acc, l) => ({
        itemsCount: acc.itemsCount + l.qty,
        subtotalBase: acc.subtotalBase + l.basePrice * l.qty,
        subtotalMargin: acc.subtotalMargin + l.margin * l.qty,
      }),
      { itemsCount: 0, subtotalBase: 0, subtotalMargin: 0 },
    );
    const grandTotal = totals.subtotalBase + totals.subtotalMargin;

    // Idempotency: the same cart resubmitted (double tap, WA redirect back)
    // returns the original order instead of creating a twin.
    const hash = this.fingerprint(dto, lines, grandTotal);
    const existing = await this.orderRepo.findOne({
      where: { waMessageHash: hash, batchId: batch.id },
    });
    if (existing) {
      const payment = await this.paymentsService.createOrReuse(existing);
      return this.toResult(existing, lines, payment);
    }

    const order = await this.dataSource.transaction(async (manager) => {
      const customerRepo = manager.getRepository(Customer);
      let customer = await customerRepo.findOne({
        where: { phone: dto.customer.phone },
      });
      if (!customer) {
        customer = await customerRepo.save(
          customerRepo.create({
            name: dto.customer.name,
            phone: dto.customer.phone,
            deliveryNote: dto.customer.deliveryNote ?? null,
          }),
        );
      } else {
        // Keep the latest name/desk — people move floors.
        customer.name = dto.customer.name;
        if (dto.customer.deliveryNote) customer.deliveryNote = dto.customer.deliveryNote;
        await customerRepo.save(customer);
      }

      const orderRepo = manager.getRepository(Order);
      const orderNo = await this.nextOrderNo(manager.getRepository(Order));

      const outside = dto.deliveryType === DeliveryType.OUTSIDE;

      const saved = await orderRepo.save(
        orderRepo.create({
          orderNo,
          batchId: batch.id,
          customerId: customer.id,
          status: OrderStatus.PENDING,
          itemsCount: totals.itemsCount,
          subtotalBase: totals.subtotalBase,
          subtotalMargin: totals.subtotalMargin,
          grandTotal,
          customerNote: dto.note ?? null,
          deliveryType: dto.deliveryType,
          addressLine1: outside ? dto.address.line1 : null,
          addressDistrict: outside ? dto.address.district ?? null : null,
          addressCity: outside ? dto.address.city : null,
          addressPostal: outside ? dto.address.postalCode ?? null : null,
          addressLandmark: outside ? dto.address.landmark ?? null : null,
          waMessageHash: hash,
        }),
      );

      await manager.getRepository(OrderItem).insert(
        lines.map((l) => ({
          orderId: saved.id,
          bundleId: l.bundleId,
          bundleName: l.bundleName,
          productId: l.productId,
          productName: l.productName,
          unit: l.unit,
          qty: l.qty,
          basePrice: l.basePrice,
          margin: l.margin,
        })),
      );

      // save() returns the row without the eager relation resolved, and the
      // WhatsApp recap needs the name.
      saved.customer = customer;
      return saved;
    });

    this.logger.log(
      `Order ${order.orderNo}: ${totals.itemsCount} item, Rp${grandTotal}`,
    );
    const payment = await this.paymentsService.createOrReuse(order);
    return this.toResult(order, lines, payment);
  }

  /** Public order lookup for the success page. No auth — the order number is
   *  the secret, and it is only ever handed to the person who created it. */
  async findByOrderNo(orderNo: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { orderNo },
      relations: { items: true, batch: true },
    });
    if (!order) throw new NotFoundException(`Order ${orderNo} tidak ditemukan`);
    return order;
  }

  // ---------- internals ----------

  /**
   * Turns the cart into per-product lines. Loose items and paket members stay
   * separate rows even for the same product, so the paket's price remains
   * auditable long after the fact.
   */
  private async resolveLines(
    dto: CreateOrderDto,
    batchId: string,
  ): Promise<ResolvedLine[]> {
    const lines: ResolvedLine[] = [];

    // --- loose items ---
    if (dto.items.length) {
      const rows = await this.priceRepo.find({
        where: {
          batchId,
          productId: In(dto.items.map((i) => i.productId)),
        },
        relations: { product: true },
      });
      const byProduct = new Map(rows.map((r) => [String(r.productId), r]));

      for (const item of dto.items) {
        const row = byProduct.get(String(item.productId));
        if (!row?.product) {
          throw new BadRequestException(
            `Produk ${item.productId} tidak tersedia di batch ini`,
          );
        }
        if (row.poStatus === PoStatus.SOLD_OUT || row.poStatus === PoStatus.HIDDEN) {
          throw new ConflictException(`${row.product.name} sudah habis`);
        }
        if (row.maxQty && item.qty > row.maxQty) {
          throw new BadRequestException(
            `${row.product.name} dibatasi ${row.maxQty} per order`,
          );
        }
        lines.push({
          productId: String(row.productId),
          productName: row.product.name,
          unit: row.product.unit,
          qty: item.qty,
          basePrice: row.basePrice,
          margin: row.margin,
          bundleId: null,
          bundleName: null,
        });
      }
    }

    // --- pakets ---
    for (const wanted of dto.bundles ?? []) {
      const priced = (
        await this.bundlesService.priceByIds([wanted.bundleId], batchId)
      ).get(String(wanted.bundleId));

      if (!priced) {
        throw new BadRequestException(`Paket ${wanted.bundleId} tidak tersedia`);
      }
      if (priced.poStatus === PoStatus.SOLD_OUT || priced.poStatus === PoStatus.HIDDEN) {
        throw new ConflictException(`${priced.name} sedang tidak tersedia`);
      }
      if (priced.maxQty && wanted.qty > priced.maxQty) {
        throw new BadRequestException(
          `${priced.name} dibatasi ${priced.maxQty} per order`,
        );
      }

      const members = await this.bundlesService.resolveOrderLines(
        String(wanted.bundleId),
        batchId,
      );
      const meta = new Map(priced.members.map((m) => [m.productId, m]));

      for (const m of members) {
        const info = meta.get(m.productId);
        lines.push({
          productId: m.productId,
          productName: info?.name ?? m.productId,
          unit: info?.unit ?? 'pcs',
          // One paket's worth of this product, times how many pakets.
          qty: m.qty * wanted.qty,
          basePrice: m.basePrice,
          margin: m.margin,
          bundleId: String(wanted.bundleId),
          bundleName: priced.name,
        });
      }
    }

    return lines;
  }

  /**
   * WPO-YYYYMMDD-NNNN, sequential per day. Generated inside the checkout
   * transaction; the UNIQUE index on order_no is the real guard against a
   * race, and a retry is cheap because nothing else has been written yet.
   */
  private async nextOrderNo(repo: Repository<Order>): Promise<string> {
    const d = new Date();
    const jakarta = new Date(d.getTime() + 7 * 60 * 60 * 1000);
    const day = jakarta.toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `WPO-${day}-`;

    const last = await repo
      .createQueryBuilder('o')
      .select('o.order_no', 'orderNo')
      .where('o.order_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('o.order_no', 'DESC')
      .limit(1)
      .getRawOne<{ orderNo: string }>();

    const seq = last ? Number(last.orderNo.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  }

  private fingerprint(
    dto: CreateOrderDto,
    lines: ResolvedLine[],
    grandTotal: number,
  ): string {
    const payload = JSON.stringify({
      phone: dto.customer.phone,
      deliveryType: dto.deliveryType,
      grandTotal,
      lines: lines
        .map((l) => `${l.bundleId ?? '-'}:${l.productId}:${l.qty}`)
        .sort(),
    });
    return createHash('sha1').update(payload).digest('hex');
  }

  private toResult(
    order: Order,
    lines: ResolvedLine[],
    payment: PaymentView,
  ): CreateOrderResult {
    return {
      orderNo: order.orderNo,
      grandTotal: Number(order.grandTotal),
      itemsCount: order.itemsCount,
      payment,
      waUrl:
        payment.status === PaymentStatus.PAID
          ? this.buildWaUrl(order, lines)
          : null,
    };
  }

  async checkoutState(order: Order) {
    const payment = await this.paymentsService.viewForOrder(order.id);
    const lines: ResolvedLine[] = order.items.map((item) => ({
      productId: String(item.productId),
      productName: item.productName,
      unit: item.unit,
      qty: item.qty,
      basePrice: Number(item.basePrice),
      margin: Number(item.margin),
      bundleId: item.bundleId ? String(item.bundleId) : null,
      bundleName: item.bundleName,
    }));

    return {
      payment,
      waUrl:
        payment?.status === PaymentStatus.PAID
          ? this.buildWaUrl(order, lines)
          : null,
    };
  }

  /**
   * wa.me link with the recap. Kept on the server so the message format is
   * one thing to change, and so the totals in the message are the stored
   * ones rather than whatever the browser thinks.
   */
  private buildWaUrl(order: Order, lines: ResolvedLine[]): string {
    const admin = this.config.get<string>('WA_ADMIN_PHONE') ?? '';
    const rupiah = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;

    const loose = lines.filter((l) => !l.bundleId);
    const bundles = new Map<string, ResolvedLine[]>();
    for (const l of lines.filter((x) => x.bundleId)) {
      const key = l.bundleName ?? l.bundleId!;
      bundles.set(key, [...(bundles.get(key) ?? []), l]);
    }

    const parts = [
      `*PRE-ORDER ${order.orderNo}*`,
      `Nama: ${order.customer?.name ?? '-'}`,
      '',
    ];

    for (const [name, members] of bundles) {
      parts.push(`*${name}*`);
      parts.push(...members.map((m) => `  • ${m.productName} x${m.qty}`));
    }
    if (loose.length) {
      if (bundles.size) parts.push('');
      parts.push(
        ...loose.map(
          (l) =>
            `• ${l.productName} x${l.qty} — ${rupiah((l.basePrice + l.margin) * l.qty)}`,
        ),
      );
    }

    parts.push('', `*Total: ${rupiah(Number(order.grandTotal))}*`);
    parts.push('*Pembayaran: LUNAS via QRIS NusaPay*');
    parts.push(
      order.deliveryType === DeliveryType.OFFICE
        ? `Antar: kantor${order.customer?.deliveryNote ? ` (${order.customer.deliveryNote})` : ''}`
        : `Antar: ${[order.addressLine1, order.addressDistrict, order.addressCity, order.addressPostal]
            .filter(Boolean)
            .join(', ')}${order.addressLandmark ? ` — ${order.addressLandmark}` : ''}`,
    );
    if (order.customerNote) parts.push(`Catatan: ${order.customerNote}`);

    return `https://wa.me/${admin}?text=${encodeURIComponent(parts.join('\n'))}`;
  }
}
