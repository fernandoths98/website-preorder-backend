import { checkPassword } from '../../common/password-check';
import { SessionStampService } from './session-stamp.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';

import { AdminUser } from './entities/admin-user.entity';
import { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(AdminUser)
    private readonly adminRepo: Repository<AdminUser>,
    private readonly jwtService: JwtService,
    private readonly sessions: SessionStampService,
  ) {}

  async login(dto: LoginDto) {
    const admin = await this.adminRepo
      .createQueryBuilder('a')
      .addSelect('a.passwordHash')
      .where('a.email = :email', { email: dto.email.trim().toLowerCase() })
      .getOne();

    const passwordValid = await checkPassword(
      admin?.passwordHash,
      dto.password,
    );
    const ok = admin?.isActive === true && passwordValid;

    if (!ok || !admin)
      throw new UnauthorizedException('Email atau password salah');

    const payload: JwtPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      sessionStamp: this.sessions.stamp(admin.passwordHash),
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      admin: { id: admin.id, email: admin.email, role: admin.role },
    };
  }

  static hash(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  }
}
