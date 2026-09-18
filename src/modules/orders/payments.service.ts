import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { Order, OrderStatus } from './entities/order.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { NusapayCallbackDto } from './dto/nusapay-callback.dto';

export interface PaymentView {
  provider: 'nusapay';
  status: PaymentStatus;
  qrContent: string | null;
  expiresAt: string | null;
  paidAt: string | null;
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async createOrReuse(order: Order): Promise<PaymentView> {
    const existing = await this.payments.findOne({ where: { orderId: order.id } });
    const now = Date.now();

    if (
      existing?.status === PaymentStatus.PENDING &&
      existing.qrContent &&
      existing.expiresAt &&
      existing.expiresAt.getTime() > now
    ) {
      return this.toView(existing);
    }

    if (existing?.status === PaymentStatus.PAID) {
      return this.toView(existing);
    }

    const gatewayUrl = this.config.get<string>('NUSAPAY_GATEWAY_URL')?.replace(/\/$/, '');
    if (!gatewayUrl) {
      throw new ServiceUnavailableException('Payment gateway belum dikonfigurasi');
    }

    const partnerReferenceNo = this.makePartnerReference(order.orderNo);
    const payment = existing ?? this.payments.create({ orderId: order.id });

    payment.provider = 'nusapay';
    payment.partnerReferenceNo = partnerReferenceNo;
    payment.providerReferenceNo = null;
    payment.amount = Number(order.grandTotal);
    payment.status = PaymentStatus.PENDING;
    payment.qrContent = null;
    payment.expiresAt = new Date(now + 10 * 60 * 1000);
    payment.paidAt = null;
    payment.rawCallback = null;
    await this.payments.save(payment);

    const generatePath =
      this.config.get<string>('NUSAPAY_QR_GENERATE_PATH') ?? '/api/qr/qr-mpm-generate';

    try {
      const response = await fetch(`${gatewayUrl}${generatePath}`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          partnerReferenceNo,
          amount: {
            value: Number(order.grandTotal).toFixed(2),
            currency: 'IDR',
          },
          additionalInfo: {
            source: 'website-preorder',
            orderNo: order.orderNo,
          },
        }),
        signal: AbortSignal.timeout(
          this.config.get<number>('NUSAPAY_TIMEOUT_MS') ?? 20_000,
        ),
      });

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          String(body.responseMessage ?? `Gateway HTTP ${response.status}`),
        );
      }

      const qrContent = String(body.qrContent ?? body.qrString ?? '').trim();
      if (!qrContent) {
        throw new Error('Gateway tidak mengembalikan qrContent');
      }

      payment.qrContent = qrContent;
      payment.providerReferenceNo = body.referenceNo
        ? String(body.referenceNo)
        : null;
      await this.payments.save(payment);
      return this.toView(payment);
    } catch (error) {
      payment.status = PaymentStatus.FAILED;
      await this.payments.save(payment);
      throw new BadGatewayException(
        error instanceof Error
          ? `Gagal membuat pembayaran NusaPay: ${error.message}`
          : 'Gagal membuat pembayaran NusaPay',
      );
    }
  }

  async viewForOrder(orderId: string): Promise<PaymentView | null> {
    const payment = await this.payments.findOne({ where: { orderId } });
    if (!payment) return null;

    if (
      payment.status === PaymentStatus.PENDING &&
      payment.expiresAt &&
      payment.expiresAt.getTime() <= Date.now()
    ) {
      payment.status = PaymentStatus.EXPIRED;
      await this.payments.save(payment);
    }

    return this.toView(payment);
  }

  async handleNusapayCallback(dto: NusapayCallbackDto) {
    const payment = await this.payments.findOne({
      where: { partnerReferenceNo: dto.partnerReferenceNo },
    });
    if (!payment) throw new BadRequestException('Payment reference tidak dikenal');

    if (payment.status === PaymentStatus.PAID) {
      return { ok: true, duplicate: true };
    }

    const payloadAmount = this.extractAmount(dto.payload);
    if (payloadAmount === null || payloadAmount !== Number(payment.amount)) {
      throw new BadRequestException('Nominal callback tidak cocok');
    }

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      throw new BadRequestException('paidAt tidak valid');
    }

    const providerReferenceNo = dto.payload.originalReferenceNo
      ? String(dto.payload.originalReferenceNo)
      : null;

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Payment).update(
        { id: payment.id },
        {
          status: PaymentStatus.PAID,
          paidAt,
          providerReferenceNo,
          rawCallback: dto.payload,
        },
      );
      await manager.getRepository(Order).update(
        { id: payment.orderId },
        { status: OrderStatus.CONFIRMED },
      );
    });

    return { ok: true, duplicate: false };
  }

  private makePartnerReference(orderNo: string): string {
    const suffix = Date.now().toString(36).toUpperCase();
    return `${orderNo}-${suffix}`.slice(0, 64);
  }

  private extractAmount(payload: Record<string, unknown>): number | null {
    const amount = payload.amount;
    if (!amount || typeof amount !== 'object') return null;
    const value = (amount as Record<string, unknown>).value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private toView(payment: Payment): PaymentView {
    return {
      provider: 'nusapay',
      status: payment.status,
      qrContent: payment.qrContent,
      expiresAt: payment.expiresAt?.toISOString() ?? null,
      paidAt: payment.paidAt?.toISOString() ?? null,
    };
  }
}
