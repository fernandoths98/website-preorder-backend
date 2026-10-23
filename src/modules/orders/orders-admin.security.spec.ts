import { OrdersAdminService } from './orders.admin.service';
import { OrderStatus } from './entities/order.entity';
describe('admin order status controls', () => {
  function setup(affected = 1) {
    const conditions: string[] = [];
    const qb: any = {
      update: () => qb,
      set: () => qb,
      where: (s: string) => {
        conditions.push(s);
        return qb;
      },
      andWhere: (s: string) => {
        conditions.push(s);
        return qb;
      },
      execute: async () => ({ affected }),
    };
    const repo = {
      findOne: async () => ({ id: '1', status: OrderStatus.PENDING }),
      createQueryBuilder: () => qb,
    };
    return {
      service: new OrdersAdminService(repo as any, {} as any),
      conditions,
    };
  }
  it('conditions manual confirmation on paid status and the previously read order status', async () => {
    const h = setup();
    await h.service.updateStatus('ORDER', OrderStatus.CONFIRMED);
    expect(h.conditions).toContain('id = :id AND status = :previous');
    expect(h.conditions.join(' ')).toContain("p.status = 'paid'");
  });
  it('rejects an unpaid/stale update instead of reporting a successful confirmation', async () => {
    const h = setup(0);
    await expect(
      h.service.updateStatus('ORDER', OrderStatus.CONFIRMED),
    ).rejects.toThrow('belum lunas');
  });
  it('rejects invalid bulk transitions without crashing and applies payment gating to bulk confirmation', async () => {
    const h = setup();
    await expect(
      h.service.bulkAdvance(1, 'invalid' as any, OrderStatus.CONFIRMED),
    ).rejects.toThrow();
    await h.service.bulkAdvance(1, OrderStatus.PENDING, OrderStatus.CONFIRMED);
    expect(h.conditions.join(' ')).toContain("p.status = 'paid'");
  });
});
