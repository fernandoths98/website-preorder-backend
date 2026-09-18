import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import slugify from 'slugify';
import { Merchant, MerchantStatus } from './entities/merchant.entity';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { ReviewMerchantDto } from './dto/review-merchant.dto';

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

  findAll(){ return this.repo.find({order:{createdAt:'DESC'}}); }

  async review(id:string,dto:ReviewMerchantDto){
    const row=await this.repo.findOne({where:{id}});
    if(!row) throw new NotFoundException('Pengajuan mitra tidak ditemukan');
    row.status=dto.status;
    row.reviewNote=dto.reviewNote?.trim() || null;
    return this.repo.save(row);
  }
}
