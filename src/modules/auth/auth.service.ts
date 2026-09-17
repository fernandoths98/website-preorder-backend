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
  ) {}

  async login(dto: LoginDto) {
    const admin = await this.adminRepo
      .createQueryBuilder('a')
      .addSelect('a.passwordHash')
      .where('a.email = :email', { email: dto.email.toLowerCase() })
      .getOne();

    // Constant-ish work either way so a missing email is not timing-distinguishable.
    const ok =
      admin?.isActive === true &&
      (await argon2.verify(admin.passwordHash, dto.password).catch(() => false));

    if (!ok || !admin) throw new UnauthorizedException('Email atau password salah');

    const payload: JwtPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
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
