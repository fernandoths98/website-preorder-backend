import { OrdersService } from './orders.service';
import { Order, DeliveryType } from './entities/order.entity';
import { Customer } from '../customers/entities/customer.entity';
import { CreateOrderDto } from './dto/create-order.dto';

function setup(
  options: {
    merchant?: boolean;
    status?: string;
    qty?: number;
    supplierAvailable?: boolean;
    active?: boolean;
  } = {},
) {
  const product = {
    id: '1',
    name: 'Beras',
    unit: 'pack',
    isActive: options.active ?? true,
    supplierAvailable: options.supplierAvailable ?? true,
    deletedAt: null,
    merchantId: options.merchant ? '9' : null,
    merchantStatus: 'approved',
    basePrice: 60000,
    margin: 3000,
  };
  const customer = { id: '10', name: 'Pembeli', phone: '628123456789' };
  const customerRepo = {
    findOne: jest.fn().mockResolvedValue(customer),
    save: jest.fn().mockImplementation(async (v) => v),
  };
  const orderRepo = {
    findOne: jest.fn().mockResolvedValue(null),
    create: (v: any) => v,
    save: jest.fn().mockImplementation(async (v) => ({ ...v, id: '20' })),
  };
  const itemRepo = { insert: jest.fn() };
  const schedule = {
    id: '6',
    status: 'open',
    opensAt: new Date('2026-10-25T17:00:00Z'),
    closesAt: new Date('2026-10-28T16:59:59Z'),
    deliveryDate: '2026-10-31',
  };
  const batches = { forCheckout: jest.fn().mockResolvedValue(schedule) };
  const payment = { status: 'pending', provider: 'nusapay' };
  const payments = { createOrReuse: jest.fn().mockResolvedValue(payment) };
  const db = {
    transaction: async (fn: any) =>
      fn({
        getRepository: (entity: any) =>
          entity === Customer
            ? customerRepo
            : entity === Order
              ? orderRepo
              : itemRepo,
      }),
  };
  const prices = {
    find: jest
      .fn()
      .mockResolvedValue([
        {
          productId: '1',
          product,
          basePrice: 60000,
          margin: 3000,
          poStatus: options.status ?? 'available',
          maxQty: 2,
        },
      ]),
  };
  const service = new OrdersService(
    orderRepo as any,
    prices as any,
    { find: async () => [product] } as any,
    batches as any,
    {} as any,
    payments as any,
    {} as any,
    db as any,
    { issue: () => 'test-access', assert: () => undefined } as any,
  );
  jest
    .spyOn(service as any, 'nextOrderNo')
    .mockResolvedValue('WPO-20261023-0001');
  const dto = Object.assign(new CreateOrderDto(), {
    customer: { name: 'Pembeli', phone: '628123456789' },
    deliveryType: DeliveryType.OFFICE,
    expectedDeliveryDate: options.merchant ? undefined : '2026-10-31',
    items: [{ productId: '1', qty: options.qty ?? 1 }],
  });
  return { service, dto, batches, orderRepo, payments, customer, customerRepo };
}

describe('continuous preorder checkout', () => {
  it('accepts regular products without a client batch ID before the schedule opensAt', async () => {
    const h = setup();
    const result = await h.service.create(h.dto);
    expect(result.grandTotal).toBe(63000);
    expect(h.batches.forCheckout).toHaveBeenCalledWith('2026-10-31', undefined);
    expect(h.orderRepo.save.mock.calls[0][0].batchId).toBe('6');
    expect(h.payments.createOrReuse).toHaveBeenCalledTimes(1);
  });
  it('snapshots checkout details without overwriting older orders sharing a phone', async () => {
    const h = setup();
    h.dto.customer.name = 'Nama baru';
    h.dto.customer.deliveryNote = 'Lantai baru';
    await h.service.create(h.dto);
    expect(h.customer.name).toBe('Pembeli');
    expect(h.customerRepo.save).not.toHaveBeenCalled();
    expect(h.orderRepo.save.mock.calls[0][0]).toMatchObject({
      customerNameSnapshot: 'Nama baru',
      customerDeliveryNoteSnapshot: 'Lantai baru',
    });
  });
  it.each(['sold_out', 'hidden'])(
    'still rejects %s products before creating a payment',
    async (status) => {
      const h = setup({ status });
      await expect(h.service.create(h.dto)).rejects.toThrow('habis');
      expect(h.payments.createOrReuse).not.toHaveBeenCalled();
    },
  );
  it('still checks supplier availability and active status', async () => {
    for (const flags of [{ supplierAvailable: false }, { active: false }]) {
      const h = setup(flags);
      await expect(h.service.create(h.dto)).rejects.toThrow('habis');
      expect(h.payments.createOrReuse).not.toHaveBeenCalled();
    }
  });
  it('retains per-order quantity limits', async () => {
    const h = setup({ qty: 3 });
    await expect(h.service.create(h.dto)).rejects.toThrow('dibatasi');
    expect(h.payments.createOrReuse).not.toHaveBeenCalled();
  });
  it('keeps merchant-only checkout independent of the regular delivery schedule', async () => {
    const h = setup({ merchant: true });
    await h.service.create(h.dto);
    expect(h.batches.forCheckout).not.toHaveBeenCalled();
    expect(h.orderRepo.save.mock.calls[0][0].batchId).toBeNull();
  });
});
