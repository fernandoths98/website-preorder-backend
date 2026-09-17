import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../../modules/auth/interfaces/jwt-payload.interface';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload =>
    ctx.switchToHttp().getRequest().user,
);
