import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AdminUser } from '../entities/admin-user.entity';
import {
  Merchant,
  MerchantStatus,
} from '../../merchants/entities/merchant.entity';
import { AdminRole } from '../../../common/enums/admin-role.enum';
import { SessionStampService } from '../session-stamp.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    @InjectRepository(AdminUser) private readonly admins: Repository<AdminUser>,
    @InjectRepository(Merchant)
    private readonly merchants: Repository<Merchant>,
    private readonly sessions: SessionStampService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['HS256'],
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const invalid = () =>
      new UnauthorizedException('Sesi tidak valid. Silakan masuk kembali.');
    if (
      !payload ||
      typeof payload.sub !== 'string' ||
      !/^[1-9]\d*$/.test(payload.sub)
    )
      throw invalid();
    if (payload.role === 'merchant') {
      if (payload.merchantId !== payload.sub) throw invalid();
      const m = await this.merchants
        .createQueryBuilder('m')
        .addSelect('m.passwordHash')
        .where('m.id = :id', { id: payload.sub })
        .getOne();
      if (
        !m ||
        m.status !== MerchantStatus.APPROVED ||
        !m.passwordHash ||
        !this.sessions.matches(m.passwordHash, payload.sessionStamp)
      )
        throw invalid();
      return {
        sub: m.id,
        merchantId: m.id,
        email: m.email ?? '',
        role: 'merchant',
      };
    }
    if (![AdminRole.OWNER, AdminRole.ADMIN].includes(payload.role))
      throw invalid();
    const a = await this.admins
      .createQueryBuilder('a')
      .addSelect('a.passwordHash')
      .where('a.id = :id', { id: payload.sub })
      .getOne();
    if (
      !a?.isActive ||
      a.role !== payload.role ||
      !this.sessions.matches(a.passwordHash, payload.sessionStamp)
    )
      throw invalid();
    return { sub: a.id, email: a.email, role: a.role };
  }
}
