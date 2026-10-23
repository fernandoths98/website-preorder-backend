import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
/** A separate capability scoped to one order, never accepted as a login JWT. */
@Injectable()
export class OrderAccessService {
  constructor(private readonly config: ConfigService) {}
  issue(orderNo: string): string {
    const expires = Math.floor(Date.now() / 1000) + 30 * 86400;
    return `${expires}.${this.signature(orderNo, expires)}`;
  }
  assert(orderNo: string, token?: string): void {
    const m =
      typeof token === 'string' && /^(\d{10})\.([a-f0-9]{64})$/.exec(token);
    if (
      !m ||
      Number(m[1]) <= Date.now() / 1000 ||
      !timingSafeEqual(
        Buffer.from(m[2], 'hex'),
        Buffer.from(this.signature(orderNo, Number(m[1])), 'hex'),
      )
    ) {
      throw new UnauthorizedException(
        'Akses pesanan tidak valid. Buka dari browser saat checkout atau hubungi admin.',
      );
    }
  }
  private signature(orderNo: string, expires: number): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update(`wpo-order-access-v1:${orderNo}:${expires}`)
      .digest('hex');
  }
}
