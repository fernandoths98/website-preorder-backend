import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'node:crypto';
interface Rule {
  limit: number;
  seconds: number;
  by?: 'ip' | 'email';
}
const KEY = 'wpo-rate-limits';
export const RateLimits = (...rules: Rule[]) => SetMetadata(KEY, rules);
/** Per API process. Add an edge/shared limiter before scaling replicas. */
@Injectable()
export class RequestRateGuard implements CanActivate {
  private readonly buckets = new Map<
    string,
    { count: number; until: number }
  >();
  private requests = 0;
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext): boolean {
    const rules = this.reflector.getAllAndOverride<Rule[]>(KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rules?.length) return true;
    const req = context.switchToHttp().getRequest();
    const now = Date.now();
    if (++this.requests % 64 === 0 || this.buckets.size >= 20_000) {
      for (const [key, b] of this.buckets)
        if (b.until <= now) this.buckets.delete(key);
    }
    const scope = `${context.getClass().name}:${context.getHandler().name}`;
    for (const rule of rules) {
      const identity =
        rule.by === 'email'
          ? String(req.body?.email ?? '')
              .trim()
              .toLowerCase()
              .slice(0, 160)
          : String(req.ip ?? req.socket?.remoteAddress ?? 'unknown');
      const key = `${scope}:${rule.by ?? 'ip'}:${createHash('sha256').update(identity).digest('hex')}`;
      let b = this.buckets.get(key);
      if (!b || b.until <= now) {
        if (!b && this.buckets.size >= 20_000) this.reject(60);
        b = { count: 0, until: now + rule.seconds * 1000 };
        this.buckets.set(key, b);
      }
      if (++b.count > rule.limit)
        this.reject(Math.ceil((b.until - now) / 1000));
    }
    return true;
  }
  private reject(retryAfter: number): never {
    throw new HttpException(
      {
        statusCode: 429,
        message: 'Terlalu banyak percobaan. Coba lagi beberapa saat.',
        retryAfter,
      },
      429,
    );
  }
}
