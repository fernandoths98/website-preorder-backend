import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';

@Injectable()
export class SupplierSyncTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('SUPPLIER_SYNC_TOKEN');
    const received = context.switchToHttp().getRequest().header('x-supplier-sync-token') as string | undefined;

    if (!expected || !received) throw new UnauthorizedException('Invalid supplier sync token');

    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid supplier sync token');
    }
    return true;
  }
}
