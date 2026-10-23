import { defaultDeliverySchedule, jakartaDate, nextDeliverySchedule } from './delivery-schedule';
import { BatchesService } from './batches.service';
import { BatchStatus, PoBatch } from './entities/po-batch.entity';
import type { Repository } from 'typeorm';

const previous = {
  opensAt: new Date('2026-10-18T17:05:00Z'),
  closesAt: new Date('2026-10-20T23:59:59Z'),
  deliveryDate: '2026-10-22',
};
const next = () => ({...nextDeliverySchedule(previous,new Date('2026-10-23T05:00:00Z')),id:'6',code:'PO-2026-W44',status:BatchStatus.OPEN}) as PoBatch;

describe('continuous preorder delivery scheduling', () => {
  afterEach(() => jest.useRealTimers());
  it('accepts Friday orders for the next delivery without waiting for Monday', () => {
    const now = new Date('2026-10-23T05:00:00Z');
    const schedule = nextDeliverySchedule(previous, now);
    expect(schedule.deliveryDate).toBe('2026-10-29');
    expect(schedule.opensAt > now).toBe(true);
    expect(schedule.closesAt > now).toBe(true);
    expect(previous.deliveryDate).toBe('2026-10-22');
  });
  it('rolls at the exact processing cutoff', () => {
    expect(nextDeliverySchedule(previous,new Date('2026-10-20T23:59:58Z')).deliveryDate).toBe('2026-10-22');
    expect(nextDeliverySchedule(previous,new Date('2026-10-20T23:59:59Z')).deliveryDate).toBe('2026-10-29');
  });
  it('skips all elapsed weeks and keeps the configured weekday', () => {
    const schedule = nextDeliverySchedule(previous,new Date('2027-01-02T05:00:00Z'));
    expect(schedule.deliveryDate).toBe('2027-01-07');
  });
  it('uses Jakarta dates at midnight', () => {
    expect(jakartaDate(new Date('2026-10-23T16:59:59Z'))).toBe('2026-10-23');
    expect(jakartaDate(new Date('2026-10-23T17:00:00Z'))).toBe('2026-10-24');
  });
  it('uses a future Saturday only when no dated schedule exists', () => {
    const schedule=defaultDeliverySchedule(new Date('2026-10-23T05:00:00Z'));
    expect(schedule.deliveryDate).toBe('2026-10-31');
    expect(schedule.closesAt.toISOString()).toBe('2026-10-28T16:59:59.000Z');
  });
  it('resolves an existing future-start schedule without a sales-window check', async () => {
    const repo = {findOne:jest.fn().mockResolvedValue(next())};
    const service = new BatchesService(repo as unknown as Repository<PoBatch>);
    const seed = jest.spyOn(service as any,'ensureCatalog').mockResolvedValue(undefined);
    expect((await service.current()).id).toBe('6');
    expect(repo.findOne.mock.calls[0][0].where.opensAt).toBeUndefined();
    expect(seed).toHaveBeenCalled();
  });
  it('creates and seeds the next delivery after the previous one closes', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T05:00:00Z'));
    const save=jest.fn().mockImplementation(async value=>({...value,id:'6'}));
    const repo={findOne:jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({...previous,id:'5',status:'closed'}).mockResolvedValueOnce(null),create:(value:any)=>value,save};
    const service = new BatchesService(repo as unknown as Repository<PoBatch>);
    jest.spyOn(service as any,'ensureCatalog').mockResolvedValue(undefined);
    const result=await service.current();
    expect(result.deliveryDate).toBe('2026-10-29');expect(result.status).toBe('open');
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('reuses a schedule created by a concurrent request', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T05:00:00Z'));
    const repo={findOne:jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({...previous,id:'5',status:'closed'}).mockResolvedValueOnce(null).mockResolvedValueOnce(next()),create:(v:any)=>v,save:jest.fn().mockRejectedValue({driverError:{code:'ER_DUP_ENTRY'}})};
    const service=new BatchesService(repo as unknown as Repository<PoBatch>);
    jest.spyOn(service as any,'ensureCatalog').mockResolvedValue(undefined);
    expect((await service.current()).id).toBe('6');
  });
  it('skips cancelled schedules without reopening them', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T05:00:00Z'));
    const save=jest.fn().mockImplementation(async value=>({...value,id:'7'}));
    const repo={findOne:jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({...previous,id:'5',status:'closed'}).mockResolvedValueOnce({...next(),status:BatchStatus.CANCELLED}).mockResolvedValueOnce(null),create:(v:any)=>v,save};
    const service=new BatchesService(repo as unknown as Repository<PoBatch>);
    jest.spyOn(service as any,'ensureCatalog').mockResolvedValue(undefined);
    expect((await service.current()).deliveryDate).toBe('2026-11-05');
    expect(save.mock.calls[0][0].deliveryDate).toBe('2026-11-05');
  });
  it('checks the customer-confirmed date rather than requiring a batch ID', async () => {
    const service=new BatchesService({} as Repository<PoBatch>);
    jest.spyOn(service,'current').mockResolvedValue(next());
    await expect(service.forCheckout('2026-10-29')).resolves.toMatchObject({id:'6'});
    await expect(service.forCheckout('2026-10-22')).rejects.toThrow('Jadwal pengiriman diperbarui');
    await expect(service.forCheckout(undefined,'5')).rejects.toThrow('Jadwal pengiriman diperbarui');
  });
});
