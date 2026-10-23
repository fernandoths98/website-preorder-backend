import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { Payment, PaymentStatus } from './entities/payment.entity';
import { Order, OrderStatus } from './entities/order.entity';
import { OrderAccessService } from './order-access.service';
import { PaymentsController } from './payments.controller';

const config = (values: Record<string, unknown>) =>
  ({
    get: (k: string) => values[k],
    getOrThrow: (k: string) => values[k],
  }) as ConfigService;
const pending = () =>
  ({
    id: '2',
    orderId: '1',
    partnerReferenceNo: 'REF',
    providerReferenceNo: 'PROVIDER',
    amount: 63000,
    status: PaymentStatus.PENDING,
    qrContent: 'QR',
    expiresAt: new Date(Date.now() + 60000),
  }) as Payment;
function harness() {
  const current = pending();
  const order = {
    id: '1',
    orderNo: 'WPO-20261023-0001',
    status: OrderStatus.PENDING,
    grandTotal: 63000,
  } as Order;
  const writes: any[] = [];
  const qb: any = {};
  for (const k of ['update', 'set', 'where', 'andWhere'])
    qb[k] = jest.fn((...args: any[]) => {
      writes.push([k, ...args]);
      return qb;
    });
  qb.execute = jest.fn().mockResolvedValue({ affected: 1 });
  const repo = {
    findOne: jest.fn().mockResolvedValue(current),
    create: (v: any) => v,
    save: jest.fn(async (v) => v),
    createQueryBuilder: () => qb,
    findOneOrFail: jest.fn().mockResolvedValue(current),
  };
  const orders = {
    findOne: jest.fn().mockResolvedValue(order),
    createQueryBuilder: () => qb,
  };
  const db = {
    transaction: async (fn: any) =>
      fn({ getRepository: (e: any) => (e === Order ? orders : repo) }),
  };
  const service = new PaymentsService(
    repo as any,
    config({ NUSAPAY_GATEWAY_URL: 'http://gateway.invalid' }),
    db as any,
  );
  return { service, repo, orders, current, order, qb, writes };
}

describe('order access capability', () => {
  const access = new OrderAccessService(
    config({ JWT_SECRET: 'test-secret-only' }),
  );
  it('requires the secret token even when the public order number is known', () => {
    const token = access.issue('WPO-20261023-0001');
    expect(() => access.assert('WPO-20261023-0001', token)).not.toThrow();
    for (const invalid of [
      undefined,
      '',
      token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'),
    ]) {
      expect(() => access.assert('WPO-20261023-0001', invalid)).toThrow();
    }
    expect(() => access.assert('WPO-20261023-0002', token)).toThrow();
  });
  it('expires and cannot be renewed by editing its timestamp', () => {
    jest.useFakeTimers();
    const token = access.issue('WPO-1');
    expect(() =>
      access.assert('WPO-1', token.replace(/^\d+/, '9999999999')),
    ).toThrow();
    jest.advanceTimersByTime(31 * 86400 * 1000);
    expect(() => access.assert('WPO-1', token)).toThrow();
    jest.useRealTimers();
  });
});

describe('payment trust boundaries', () => {
  const callback = (amount: any = { value: '63000.00', currency: 'IDR' }) => ({
    partnerReferenceNo: 'REF',
    transactionStatus: '00',
    payload: {
      originalPartnerReferenceNo: 'REF',
      originalReferenceNo: 'PROVIDER',
      latestTransactionStatus: '00',
      amount,
    },
  });
  it('rejects absent or incorrect callback credentials before calling the payment service', () => {
    const payments = { handleNusapayCallback: jest.fn() };
    const controller = new PaymentsController(
      payments as any,
      config({ WPO_PAYMENT_CALLBACK_KEY: 'private-key' }),
    );
    for (const key of [undefined, '', 'wrong'])
      expect(() => controller.callback(key, callback())).toThrow();
    expect(payments.handleNusapayCallback).not.toHaveBeenCalled();
    controller.callback('private-key', callback());
    expect(payments.handleNusapayCallback).toHaveBeenCalledTimes(1);
  });
  it.each([
    {},
    { value: '', currency: 'IDR' },
    { value: '63000', currency: 'USD' },
    { value: '63001', currency: 'IDR' },
    { value: '6.3e4', currency: 'IDR' },
    { value: '63000.001', currency: 'IDR' },
  ])('rejects invalid payment amount %j', async (amount) => {
    const h = harness();
    await expect(
      h.service.handleNusapayCallback(callback(amount)),
    ).rejects.toThrow();
    expect(h.repo.save).not.toHaveBeenCalled();
  });
  it('rejects mismatched provider references and unpaid statuses', async () => {
    for (const patch of [
      { originalPartnerReferenceNo: 'OTHER' },
      { originalReferenceNo: 'OTHER' },
      { latestTransactionStatus: '03' },
    ]) {
      const h = harness(),
        dto = callback();
      Object.assign(dto.payload, patch);
      await expect(h.service.handleNusapayCallback(dto)).rejects.toThrow();
      expect(h.repo.save).not.toHaveBeenCalled();
    }
  });
  it('locks the order and current payment, records paid once, and treats repeat callbacks as duplicates', async () => {
    const h = harness();
    expect(await h.service.handleNusapayCallback(callback())).toEqual({
      ok: true,
      duplicate: false,
    });
    expect(h.orders.findOne.mock.calls[0][0].lock.mode).toBe(
      'pessimistic_write',
    );
    expect(h.current.status).toBe(PaymentStatus.PAID);
    expect(await h.service.handleNusapayCallback(callback())).toEqual({
      ok: true,
      duplicate: true,
    });
    expect(h.repo.save).toHaveBeenCalledTimes(1);
    await expect(
      h.service.handleNusapayCallback(
        callback({ value: '1', currency: 'IDR' }),
      ),
    ).rejects.toThrow();
  });
  it('does not mark a replacement QR paid using an observation for an old QR', async () => {
    const h = harness(),
      stale = { ...h.current };
    h.current.partnerReferenceNo = 'NEW';
    const changed = await (h.service as any).markPaid(
      stale,
      new Date(),
      'PROVIDER',
      {},
      'scheduler',
      '00',
    );
    expect(changed).toBe(false);
    expect(h.repo.save).not.toHaveBeenCalled();
  });
  it('does not overwrite a webhook-paid row when an older provider query says pending', async () => {
    const h = harness(),
      stale = { ...h.current };
    h.current.status = PaymentStatus.PAID;
    jest
      .spyOn(h.service as any, 'queryProvider')
      .mockResolvedValue({ latestTransactionStatus: '03' });
    await (h.service as any).reconcilePayment(stale, 'scheduler');
    expect(h.repo.save).not.toHaveBeenCalled();
    expect(h.writes).toContainEqual([
      'andWhere',
      'status <> :paid',
      { paid: PaymentStatus.PAID },
    ]);
    expect(h.writes.find((w) => w[0] === 'set')[1]).not.toHaveProperty(
      'status',
    );
  });
  it('keeps expired QR references available for late successful callbacks', async () => {
    const h = harness();
    h.current.expiresAt = new Date(Date.now() - 1000);
    expect((await h.service.createOrReuse(h.order)).status).toBe(
      PaymentStatus.EXPIRED,
    );
    expect(h.current.partnerReferenceNo).toBe('REF');
    expect(await h.service.handleNusapayCallback(callback())).toEqual({
      ok: true,
      duplicate: false,
    });
  });
  it('persists the failed generation reference before surfacing gateway errors', async () => {
    const h = harness();
    h.repo.findOne.mockResolvedValue(null as any);
    const original = global.fetch;
    global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));
    try {
      await expect(h.service.createOrReuse(h.order)).rejects.toThrow(
        'Gagal membuat pembayaran',
      );
      expect(h.repo.save.mock.calls.at(-1)?.[0].status).toBe(
        PaymentStatus.FAILED,
      );
    } finally {
      global.fetch = original;
    }
  });
});
