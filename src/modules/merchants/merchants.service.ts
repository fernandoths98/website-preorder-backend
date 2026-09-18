import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import slugify from 'slugify';
import { Merchant, MerchantStatus } from './entities/merchant.entity';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { ReviewMerchantDto } from './dto/review-merchant.dto';
import { MerchantLoginDto } from './dto/merchant-login.dto';
import * as argon2 from 'argon2';

@Injectable()
export class MerchantsService {
  constructor(@InjectRepository(Merchant) private readonly repo:Repository<Merchant>){}

  async register(dto:CreateMerchantDto){
    const phone = dto.phone.replace(/[^0-9+]/g,'');
    const existing = await this.repo.findOne({ where:{ phone } });
    if(existing) throw new ConflictException('Nomor WhatsApp ini sudah pernah mendaftar');
    const base=slugify(dto.businessName,{lower:true,strict:true}) || 'mitra';
    let slug=base, i=1;
    while(await this.repo.findOne({where:{slug}})) slug=`${base}-${++i}`;
    return this.repo.save(this.repo.create({...dto,phone,slug,status:MerchantStatus.PENDING}));
  }

  async setPassword(id:string,password:string){ const row=await this.repo.findOne({where:{id}}); if(!row||row.status!==MerchantStatus.APPROVED) throw new BadRequestException('Mitra belum disetujui'); const passwordHash=await argon2.hash(password,{type:argon2.argon2id}); await this.repo.createQueryBuilder().update(Merchant).set({passwordHash}).where('id = :id',{id}).execute(); return {ok:true}; }
  async authenticate(dto:MerchantLoginDto){ const row=await this.repo.createQueryBuilder('m').addSelect('m.passwordHash').where('m.email = :email',{email:dto.email.toLowerCase()}).getOne(); if(!row||row.status!==MerchantStatus.APPROVED||!row.passwordHash||!(await argon2.verify(row.passwordHash,dto.password).catch(()=>false))) throw new UnauthorizedException('Email atau password salah'); return row; }

  findAll(){ return this.repo.find({order:{createdAt:'DESC'}}); }

  async review(id:string,dto:ReviewMerchantDto){
    const row=await this.repo.findOne({where:{id}});
    if(!row) throw new NotFoundException('Pengajuan mitra tidak ditemukan');
    row.status=dto.status;
    row.reviewNote=dto.reviewNote?.trim() || null;
    return this.repo.save(row);
  }
}
