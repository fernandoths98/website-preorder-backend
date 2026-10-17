import 'reflect-metadata';
import { validate } from 'class-validator';
import type { DataSource } from 'typeorm';
import type { Request } from 'express';
import { TrafficController } from './traffic.controller';
import { TrafficService, jakartaDay } from './traffic.service';
import { TrackViewDto } from './traffic.dto';

const event = () => Object.assign(new TrackViewDto(), {
  eventId: 'b89ec755-596d-4ee9-87a1-81d31b7ec163',
  visitorId: 'ebdb644f-9d6d-4084-93db-eb7d91722721',
  sessionId: '66bf6a70-350c-45b5-94b0-7b8eacfd483d',
  path: '/', source: 'facebook', device: 'mobile',
});

describe('traffic analytics', () => {
  afterEach(() => jest.useRealTimers());

  it('uses Jakarta midnight instead of UTC midnight', () => {
    expect(jakartaDay(new Date('2026-10-17T16:59:59Z'))).toBe('2026-10-17');
    expect(jakartaDay(new Date('2026-10-17T17:00:00Z'))).toBe('2026-10-18');
  });
  it('accepts anonymous storefront events', async () => {
    expect(await validate(event())).toHaveLength(0);
  });
  it.each(['/admin', '/mitra/dashboard', '/order/private-order-number', '/checkout?phone=123', '/?token=secret'])('does not collect sensitive path %s', async path => {
    expect((await validate(Object.assign(event(), { path }))).length).toBeGreaterThan(0);
  });
  it('does not accept raw referring URLs as source', async () => {
    expect((await validate(Object.assign(event(), { source: 'https://example.com/private' }))).length).toBeGreaterThan(0);
  });
  it('fills missing days with zero and returns numeric totals', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-17T18:00:00Z'));
    const query = jest.fn().mockResolvedValueOnce([{visitors:'4',pageViews:'12',sessions:'5',todayVisitors:'1'}])
      .mockResolvedValueOnce([{day:'2026-10-18',visitors:'1',pageViews:'2'}])
      .mockResolvedValueOnce([{path:'/',pageViews:'12',visitors:'4'}])
      .mockResolvedValueOnce([{source:'facebook',sessions:'5'}]);
    const service = new TrafficService({query} as unknown as DataSource);
    const report = await service.summary(7);
    expect(report.from).toBe('2026-10-12');expect(report.to).toBe('2026-10-18');
    expect(report.daily).toHaveLength(7);expect(report.daily[0].visitors).toBe(0);
    expect(report.daily[6]).toEqual({day:'2026-10-18',visitors:1,pageViews:2});
    expect(report.totals.visitors).toBe(4); // Period distinct, not sum of daily values.
    expect(query.mock.calls[0][1]).toEqual(['2026-10-18 00:00:00','2026-10-11 17:00:00']);
  });
  it('protects summary while allowing only the collector anonymously', () => {
    expect(Reflect.getMetadata('isPublic', TrafficController.prototype.track)).toBe(true);
    expect(Reflect.getMetadata('isPublic', TrafficController.prototype.summary)).toBeUndefined();
    expect(Reflect.getMetadata('roles', TrafficController.prototype.summary)).toEqual(['owner','admin']);
  });
  it('rejects unsupported report windows', () => {
    const controller = new TrafficController({} as TrafficService);
    expect(() => controller.summary('365')).toThrow();
    expect(() => controller.summary('7 OR 1=1')).toThrow();
  });
  it('ignores preview bots and bounds public collection per IP', async () => {
    const track = jest.fn().mockResolvedValue(undefined);
    const controller = new TrafficController({track} as unknown as TrafficService);
    const req = (ua: string) => ({ip:'127.0.0.1',get:()=>ua}) as unknown as Request;
    await controller.track(event(),req('facebookexternalhit'));
    expect(track).not.toHaveBeenCalled();
    for(let i=0;i<65;i++) await controller.track(event(),req('Mozilla'));
    expect(track).toHaveBeenCalledTimes(60);
  });
});
