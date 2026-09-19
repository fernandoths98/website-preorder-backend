import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';

import { Order, OrderStatus } from './entities/order.entity';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { NusapayCallbackDto } from './dto/nusapay-callback.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';

export interface PaymentView {
  provider: 'nusapay';
  status: PaymentStatus;
  qrContent: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  providerStatus: string | null;
  lastProviderCheckAt: string | null;
}

interface ProviderQuery {
  responseCode?: string;
  responseMessage?: string;
  originalReferenceNo?: string;
  originalPartnerReferenceNo?: string;
  latestTransactionStatus?: string;
  transactionStatusDesc?: string;
  paidTime?: string;
  amount?: { value?: string; currency?: string };
  [key: string]: unknown;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

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

    const gatewayUrl = this.gatewayUrl();
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
    payment.providerStatus = null;
    payment.qrContent = null;
    payment.expiresAt = new Date(now + 10 * 60 * 1000);
    payment.paidAt = null;
    payment.lastProviderCheckAt = null;
    payment.reconciledAt = null;
    payment.reconciliationSource = null;
    payment.rawCallback = null;
    await this.payments.save(payment);

    const generatePath =
      this.config.get<string>('NUSAPAY_QR_GENERATE_PATH') ?? '/api/v1/qr/qr-mpm-generate';

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
        signal: AbortSignal.timeout(this.timeoutMs()),
      });

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(String(body.responseMessage ?? `Gateway HTTP ${response.status}`));
      }

      const qrContent = String(body.qrContent ?? body.qrString ?? '').trim();
      if (!qrContent) throw new Error('Gateway tidak mengembalikan qrContent');

      payment.qrContent = qrContent;
      payment.providerReferenceNo = body.referenceNo ? String(body.referenceNo) : null;
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

  async recheckOrder(orderId: string): Promise<PaymentView | null> {
    const payment = await this.payments.findOne({ where: { orderId } });
    if (!payment) return null;
    if (payment.status !== PaymentStatus.PAID) {
      await this.reconcilePayment(payment, 'customer_recheck');
    }
    const refreshed = await this.payments.findOneOrFail({ where: { id: payment.id } });
    return this.toView(refreshed);
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

    await this.markPaid(
      payment,
      paidAt,
      providerReferenceNo,
      dto.payload,
      'webhook',
      '00',
    );

    return { ok: true, duplicate: false };
  }

  async adminList(query: QueryPaymentsDto) {
    const qb = this.payments
      .createQueryBuilder('p')
      .innerJoin(Order, 'o', 'o.id = p.order_id')
      .leftJoin('customers', 'c', 'c.id = o.customer_id')
      .select([
        'p.id AS id',
        'p.status AS status',
        'p.provider AS provider',
        'p.partner_reference_no AS partnerReferenceNo',
        'p.provider_reference_no AS providerReferenceNo',
        'p.provider_status AS providerStatus',
        'p.amount AS amount',
        'p.expires_at AS expiresAt',
        'p.paid_at AS paidAt',
        'p.last_provider_check_at AS lastProviderCheckAt',
        'p.reconciled_at AS reconciledAt',
        'p.reconciliation_source AS reconciliationSource',
        'p.created_at AS createdAt',
        'o.order_no AS orderNo',
        'o.status AS orderStatus',
        'c.name AS customerName',
        'c.phone AS customerPhone',
      ])
      .orderBy('p.created_at', 'DESC');

    if (query.status) qb.andWhere('p.status = :status', { status: query.status });
    if (query.q) {
      const term = `%${query.q}%`;
      qb.andWhere(
        '(o.order_no LIKE :term OR c.name LIKE :term OR c.phone LIKE :term OR p.partner_reference_no LIKE :term OR p.provider_reference_no LIKE :term)',
        { term },
      );
    }

    const totalRow = await qb.clone().select('COUNT(*)', 'total').orderBy().getRawOne<{ total: string }>();
    const data = await qb
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<Record<string, unknown>>();

    return {
      data: data.map((row) => ({
        ...row,
        amount: Number(row.amount),
      })),
      meta: {
        page: query.page,
        limit: query.limit,
        total: Number(totalRow?.total ?? 0),
        totalPages: Math.ceil(Number(totalRow?.total ?? 0) / query.limit),
      },
    };
  }

  async adminSummary() {
    const rows = await this.dataSource.query(`
      SELECT
        SUM(p.status = 'pending') AS pending,
        SUM(p.status = 'paid') AS paid,
        SUM(p.status = 'expired') AS expired,
        SUM(p.status = 'failed') AS failed,
        SUM(p.provider_status = '00' AND p.status <> 'paid') AS provider_paid_local_not_paid,
        SUM(p.status = 'paid' AND o.status = 'pending') AS paid_order_not_confirmed
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
    `);

    const row = rows?.[0] ?? {};
    return {
      windowDays: 7,
      pending: Number(row.pending ?? 0),
      paid: Number(row.paid ?? 0),
      expired: Number(row.expired ?? 0),
      failed: Number(row.failed ?? 0),
      alerts: {
        providerPaidLocalNotPaid: Number(row.provider_paid_local_not_paid ?? 0),
        paidOrderNotConfirmed: Number(row.paid_order_not_confirmed ?? 0),
      },
    };
  }

  async adminRecheck(id: string) {
    const payment = await this.payments.findOne({ where: { id } });
    if (!payment) throw new NotFoundException('Payment tidak ditemukan');
    const result = await this.reconcilePayment(payment, 'admin_recheck');
    const refreshed = await this.payments.findOneOrFail({ where: { id } });
    return { changed: result.changed, payment: this.toAdminPayment(refreshed) };
  }

  @Interval(60_000)
  async reconcileRecentPayments() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleCheck = new Date(Date.now() - 60_000);

    const candidates = await this.payments
      .createQueryBuilder('p')
      .where('p.status IN (:...statuses)', {
        statuses: [PaymentStatus.PENDING, PaymentStatus.EXPIRED],
      })
      .andWhere('p.created_at >= :cutoff', { cutoff })
      .andWhere('(p.last_provider_check_at IS NULL OR p.last_provider_check_at < :staleCheck)', {
        staleCheck,
      })
      .orderBy('p.created_at', 'ASC')
      .limit(25)
      .getMany();

    for (const payment of candidates) {
      try {
        const result = await this.reconcilePayment(payment, 'scheduler');
        if (result.changed) {
          this.logger.warn(
            `Recovered payment ${payment.partnerReferenceNo} via provider reconciliation`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Payment reconciliation failed for ${payment.partnerReferenceNo}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    const anomalies = await this.dataSource.query(`
      SELECT COUNT(*) AS total
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE (p.provider_status = '00' AND p.status <> 'paid')
         OR (p.status = 'paid' AND o.status = 'pending')
    `);
    const total = Number(anomalies?.[0]?.total ?? 0);
    if (total > 0) {
      this.logger.error(`PAYMENT ALERT: ${total} provider/local payment inconsistencies require attention`);
    }
  }

  private async reconcilePayment(
    payment: Payment,
    source: 'scheduler' | 'customer_recheck' | 'admin_recheck',
  ): Promise<{ changed: boolean }> {
    const provider = await this.queryProvider(payment.partnerReferenceNo);
    payment.providerStatus = provider.latestTransactionStatus
      ? String(provider.latestTransactionStatus)
      : null;
    payment.lastProviderCheckAt = new Date();

    if (provider.originalReferenceNo) {
      payment.providerReferenceNo = String(provider.originalReferenceNo);
    }

    if (payment.providerStatus !== '00') {
      await this.payments.save(payment);
      return { changed: false };
    }

    const providerAmount = this.extractAmount(provider as Record<string, unknown>);
    if (providerAmount === null || providerAmount !== Number(payment.amount)) {
      await this.payments.save(payment);
      this.logger.error(
        `PAYMENT ALERT: amount mismatch for ${payment.partnerReferenceNo}; local=${payment.amount}, provider=${providerAmount}`,
      );
      return { changed: false };
    }

    if (
      provider.originalPartnerReferenceNo &&
      String(provider.originalPartnerReferenceNo) !== payment.partnerReferenceNo
    ) {
      await this.payments.save(payment);
      this.logger.error(`PAYMENT ALERT: reference mismatch for ${payment.partnerReferenceNo}`);
      return { changed: false };
    }

    const paidAt = provider.paidTime ? new Date(provider.paidTime) : new Date();
    await this.markPaid(
      payment,
      Number.isNaN(paidAt.getTime()) ? new Date() : paidAt,
      provider.originalReferenceNo ? String(provider.originalReferenceNo) : payment.providerReferenceNo,
      provider as Record<string, unknown>,
      source,
      '00',
    );
    return { changed: true };
  }

  private async queryProvider(partnerReferenceNo: string): Promise<ProviderQuery> {
    const gatewayUrl = this.gatewayUrl();
    if (!gatewayUrl) throw new ServiceUnavailableException('Payment gateway belum dikonfigurasi');

    const queryPath =
      this.config.get<string>('NUSAPAY_QR_QUERY_PATH') ?? '/api/v1/qr/qr-mpm-query';

    const response = await fetch(`${gatewayUrl}${queryPath}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({
        originalPartnerReferenceNo: partnerReferenceNo,
        serviceCode: '47',
      }),
      signal: AbortSignal.timeout(this.timeoutMs()),
    });

    const body = (await response.json().catch(() => ({}))) as ProviderQuery;
    if (!response.ok) {
      throw new BadGatewayException(
        String(body.responseMessage ?? `Gateway HTTP ${response.status}`),
      );
    }
    return body;
  }

  private async markPaid(
    payment: Payment,
    paidAt: Date,
    providerReferenceNo: string | null,
    payload: Record<string, unknown>,
    source: 'webhook' | 'scheduler' | 'customer_recheck' | 'admin_recheck',
    providerStatus: string,
  ) {
    await this.dataSource.transaction(async (manager) => {
      payment.status = PaymentStatus.PAID;
      payment.providerStatus = providerStatus;
      payment.paidAt = paidAt;
      payment.providerReferenceNo = providerReferenceNo;
      payment.rawCallback = payload;
      payment.lastProviderCheckAt = new Date();
      payment.reconciledAt = new Date();
      payment.reconciliationSource = source;
      await manager.getRepository(Payment).save(payment);

      await manager
        .getRepository(Order)
        .createQueryBuilder()
        .update(Order)
        .set({ status: OrderStatus.CONFIRMED })
        .where('id = :id', { id: payment.orderId })
        .andWhere('status = :pending', { pending: OrderStatus.PENDING })
        .execute();
    });
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

  private gatewayUrl() {
    return this.config.get<string>('NUSAPAY_GATEWAY_URL')?.replace(/\/$/, '');
  }

  private timeoutMs() {
    return this.config.get<number>('NUSAPAY_TIMEOUT_MS') ?? 20_000;
  }

  private toView(payment: Payment): PaymentView {
    return {
      provider: 'nusapay',
      status: payment.status,
      qrContent: payment.qrContent,
      expiresAt: payment.expiresAt?.toISOString() ?? null,
      paidAt: payment.paidAt?.toISOString() ?? null,
      providerStatus: payment.providerStatus,
      lastProviderCheckAt: payment.lastProviderCheckAt?.toISOString() ?? null,
    };
  }

  private toAdminPayment(payment: Payment) {
    return {
      id: payment.id,
      status: payment.status,
      provider: payment.provider,
      partnerReferenceNo: payment.partnerReferenceNo,
      providerReferenceNo: payment.providerReferenceNo,
      providerStatus: payment.providerStatus,
      amount: Number(payment.amount),
      expiresAt: payment.expiresAt?.toISOString() ?? null,
      paidAt: payment.paidAt?.toISOString() ?? null,
      lastProviderCheckAt: payment.lastProviderCheckAt?.toISOString() ?? null,
      reconciledAt: payment.reconciledAt?.toISOString() ?? null,
      reconciliationSource: payment.reconciliationSource,
      createdAt: payment.createdAt?.toISOString() ?? null,
    };
  }
}
