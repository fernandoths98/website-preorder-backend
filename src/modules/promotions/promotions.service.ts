import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import { Promotion } from './entities/promotion.entity';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/upsert-promotion.dto';

@Injectable()
export class PromotionsService {
  constructor(@InjectRepository(Promotion) private readonly repo: Repository<Promotion>) {}

  findPublic() {
    const now = new Date();
    return this.repo.find({
      where: [
        { isActive: true, startsAt: IsNull(), endsAt: IsNull() },
        { isActive: true, startsAt: LessThanOrEqual(now), endsAt: IsNull() },
        { isActive: true, startsAt: IsNull(), endsAt: MoreThanOrEqual(now) },
        { isActive: true, startsAt: LessThanOrEqual(now), endsAt: MoreThanOrEqual(now) },
      ],
      order: { sortOrder: 'ASC', id: 'DESC' },
    });
  }

  findAll() {
    return this.repo.find({ order: { sortOrder: 'ASC', id: 'DESC' } });
  }

  async create(dto: CreatePromotionDto) {
    this.assertSchedule(dto.startsAt, dto.endsAt);
    return this.repo.save(this.repo.create(this.clean(dto)));
  }

  async update(id: string, dto: UpdatePromotionDto) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Promo ${id} tidak ditemukan`);
    const startsAt = dto.startsAt !== undefined ? dto.startsAt : row.startsAt;
    const endsAt = dto.endsAt !== undefined ? dto.endsAt : row.endsAt;
    this.assertSchedule(startsAt, endsAt);
    Object.assign(row, this.clean(dto));
    return this.repo.save(row);
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo.delete(id);
    if (!res.affected) throw new NotFoundException(`Promo ${id} tidak ditemukan`);
  }

  private assertSchedule(startsAt?: Date | null, endsAt?: Date | null) {
    if (startsAt && endsAt && startsAt >= endsAt) {
      throw new BadRequestException('Waktu selesai promo harus setelah waktu mulai');
    }
  }

  private clean<T extends CreatePromotionDto | UpdatePromotionDto>(dto: T): T {
    return Object.fromEntries(
      Object.entries(dto).map(([key, value]) => [
        key,
        typeof value === 'string' && value.trim() === '' ? null : value,
      ]),
    ) as T;
  }
}
