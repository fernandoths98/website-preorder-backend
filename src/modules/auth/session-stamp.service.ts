import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

@Injectable()
export class SessionStampService {
  constructor(private readonly config: ConfigService) {}
  stamp(hash: string): string {
    return createHmac('sha256', this.config.getOrThrow<string>('JWT_SECRET'))
      .update('wpo-session-v1:')
      .update(hash)
      .digest('hex');
  }
  matches(hash: string, stamp: unknown): boolean {
    return (
      typeof stamp === 'string' &&
      /^[a-f0-9]{64}$/.test(stamp) &&
      timingSafeEqual(
        Buffer.from(this.stamp(hash), 'hex'),
        Buffer.from(stamp, 'hex'),
      )
    );
  }
}
