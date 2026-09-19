import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import slugify from 'slugify';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';

import { Merchant, MerchantStatus } from './entities/merchant.entity';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { ReviewMerchantDto } from './dto/review-merchant.dto';
import { MerchantLoginDto } from './dto/merchant-login.dto';

@Injectable()
export class MerchantsService {
  constructor(
    @InjectRepository(Merchant)
    private readonly repo: Repository<Merchant>,
  ) {}

  async register(dto: CreateMerchantDto) {
    const phone = dto.phone.replace(/[^0-9+]/g, '');
    const email = dto.email.trim().toLowerCase();

    const existingPhone = await this.repo.findOne({ where: { phone } });
    if (existingPhone) {
      throw new ConflictException('Nomor WhatsApp ini sudah pernah mendaftar');
    }

    const existingEmail = await this.repo.findOne({ where: { email } });
    if (existingEmail) {
      throw new ConflictException('Email ini sudah pernah dipakai akun mitra');
    }

    const base = slugify(dto.businessName, { lower: true, strict: true }) || 'mitra';
    let slug = base;
    let i = 1;
    while (await this.repo.findOne({ where: { slug } })) {
      slug = `${base}-${++i}`;
    }

    return this.repo.save(
      this.repo.create({
        ...dto,
        email,
        phone,
        slug,
        status: MerchantStatus.PENDING,
      }),
    );
  }

  async createActivation(id: string, emailOverride?: string) {
    const row = await this.repo
      .createQueryBuilder('m')
      .addSelect('m.activationTokenHash')
      .addSelect('m.activationExpiresAt')
      .where('m.id = :id', { id })
      .getOne();

    if (!row) throw new NotFoundException('Mitra tidak ditemukan');
    if (row.status !== MerchantStatus.APPROVED) {
      throw new BadRequestException('Mitra harus disetujui dulu');
    }

    const email = (emailOverride ?? row.email ?? '').trim().toLowerCase();
    if (!email) {
      throw new BadRequestException('Email mitra belum tersedia');
    }

    const emailOwner = await this.repo.findOne({ where: { email } });
    if (emailOwner && emailOwner.id !== row.id) {
      throw new ConflictException('Email ini sudah dipakai akun mitra lain');
    }

    const token = randomBytes(32).toString('hex');
    row.email = email;
    row.activationTokenHash = this.hashToken(token);
    row.activationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.repo.save(row);

    return {
      token,
      email,
      expiresAt: row.activationExpiresAt.toISOString(),
    };
  }

  async activate(token: string, password: string) {
    const tokenHash = this.hashToken(token);

    const row = await this.repo
      .createQueryBuilder('m')
      .addSelect('m.activationTokenHash')
      .addSelect('m.activationExpiresAt')
      .where('m.activation_token_hash = :tokenHash', { tokenHash })
      .getOne();

    if (!row) throw new BadRequestException('Link aktivasi tidak valid');
    if (row.status !== MerchantStatus.APPROVED) {
      throw new BadRequestException('Akun mitra belum disetujui');
    }
    if (!row.activationExpiresAt || row.activationExpiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Link aktivasi sudah kedaluwarsa');
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    await this.repo
      .createQueryBuilder()
      .update(Merchant)
      .set({
        passwordHash,
        activationTokenHash: null,
        activationExpiresAt: null,
      })
      .where('id = :id', { id: row.id })
      .execute();

    return {
      ok: true,
      email: row.email,
      businessName: row.businessName,
    };
  }

  async setPassword(id: string, password: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row || row.status !== MerchantStatus.APPROVED) {
      throw new BadRequestException('Mitra belum disetujui');
    }

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await this.repo
      .createQueryBuilder()
      .update(Merchant)
      .set({
        passwordHash,
        activationTokenHash: null,
        activationExpiresAt: null,
      })
      .where('id = :id', { id })
      .execute();

    return { ok: true };
  }

  async authenticate(dto: MerchantLoginDto) {
    const row = await this.repo
      .createQueryBuilder('m')
      .addSelect('m.passwordHash')
      .where('LOWER(m.email) = :email', { email: dto.email.trim().toLowerCase() })
      .getOne();

    if (
      !row ||
      row.status !== MerchantStatus.APPROVED ||
      !row.passwordHash ||
      !(await argon2.verify(row.passwordHash, dto.password).catch(() => false))
    ) {
      throw new UnauthorizedException('Email atau password salah');
    }

    return row;
  }

  findAll() {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async review(id: string, dto: ReviewMerchantDto) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Pengajuan mitra tidak ditemukan');

    row.status = dto.status;
    row.reviewNote = dto.reviewNote?.trim() || null;
    return this.repo.save(row);
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
}
