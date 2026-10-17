import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { TrackViewDto } from './traffic.dto';

export function jakartaDay(date = new Date()): string {
  return new Date(date.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

@Injectable()
export class TrafficService {
  constructor(private readonly db: DataSource) {}

  async track(dto: TrackViewDto): Promise<void> {
    await this.db.query(
      `INSERT INTO site_page_views
       (event_id, visitor_id, session_id, path, source, device, viewed_at)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE event_id = VALUES(event_id)`,
      [dto.eventId, dto.visitorId, dto.sessionId, dto.path, dto.source, dto.device],
    );
  }

  async summary(days: number) {
    const today = jakartaDay();
    const start = new Date(`${today}T00:00:00+07:00`);
    start.setUTCDate(start.getUTCDate() - days + 1);
    const params = [start.toISOString().slice(0, 19).replace('T', ' ')];
    const [totals] = await this.db.query(
      `SELECT COUNT(*) AS pageViews, COUNT(DISTINCT visitor_id) AS visitors,
              COUNT(DISTINCT session_id) AS sessions,
              COUNT(DISTINCT CASE WHEN viewed_at >= DATE_SUB(?, INTERVAL 7 HOUR)
                    THEN visitor_id END) AS todayVisitors
       FROM site_page_views WHERE viewed_at >= ?`,
      [`${today} 00:00:00`, ...params],
    );
    const daily = await this.db.query(
      `SELECT DATE_FORMAT(DATE_ADD(viewed_at, INTERVAL 7 HOUR), '%Y-%m-%d') AS day,
              COUNT(*) AS pageViews, COUNT(DISTINCT visitor_id) AS visitors
       FROM site_page_views WHERE viewed_at >= ? GROUP BY day ORDER BY day`, params,
    );
    const pages = await this.db.query(
      `SELECT path, COUNT(*) AS pageViews, COUNT(DISTINCT visitor_id) AS visitors
       FROM site_page_views WHERE viewed_at >= ?
       GROUP BY path ORDER BY pageViews DESC, path ASC LIMIT 10`, params,
    );
    const sources = await this.db.query(
      `SELECT source, COUNT(DISTINCT session_id) AS sessions
       FROM site_page_views WHERE viewed_at >= ?
       GROUP BY source ORDER BY sessions DESC, source ASC`, params,
    );
    const byDay = new Map<string, { visitors: number; pageViews: number }>(
      daily.map((r: any) => [r.day, { visitors: Number(r.visitors), pageViews: Number(r.pageViews) }]),
    );
    const series = Array.from({ length: days }, (_, i) => {
      const d = new Date(start.getTime() + i * 86400_000);
      const day = jakartaDay(d);
      return { day, ...(byDay.get(day) ?? { visitors: 0, pageViews: 0 }) };
    });
    return {
      days, timezone: 'Asia/Jakarta', from: series[0].day, to: today,
      totals: { visitors: Number(totals.visitors), pageViews: Number(totals.pageViews),
        sessions: Number(totals.sessions), todayVisitors: Number(totals.todayVisitors) },
      daily: series,
      pages: pages.map((r: any) => ({ path: r.path, pageViews: Number(r.pageViews), visitors: Number(r.visitors) })),
      sources: sources.map((r: any) => ({ source: r.source, sessions: Number(r.sessions) })),
    };
  }

  @Cron('15 * * * *')
  async prune(): Promise<void> {
    await this.db.query('DELETE FROM site_page_views WHERE viewed_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY) LIMIT 10000');
  }
}
