import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { mkdir, writeFile } from 'fs/promises';
import { extname, join } from 'path';
import { Repository } from 'typeorm';

import { Product, MerchantProductStatus } from '../products/entities/product.entity';
import { PromotionsService } from '../promotions/promotions.service';
import {
  MerchantBannerStatus,
  MerchantBannerSubmission,
} from './entities/merchant-banner-submission.entity';

const BANNER_WIDTH = 1600;
const BANNER_HEIGHT = 600;
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

@Injectable()
export class MerchantBannersService {
  constructor(
    @InjectRepository(MerchantBannerSubmission)
    private readonly banners: Repository<MerchantBannerSubmission>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    private readonly promotions: PromotionsService,
  ) {}

  async listForMerchant(merchantId: string) {
    return this.banners.find({
      where: { merchantId },
      order: { createdAt: 'DESC' },
    });
  }

  async submit(
    merchantId: string,
    productId: string,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
    width: number,
    height: number,
  ) {
    const product = await this.products.findOne({
      where: { id: productId, merchantId },
    });

    if (!product) throw new NotFoundException('Produk mitra tidak ditemukan');
    if (product.merchantStatus !== MerchantProductStatus.APPROVED || !product.isActive) {
      throw new BadRequestException(
        'Banner baru bisa diajukan setelah produk disetujui admin',
      );
    }

    if (!file?.buffer?.length) throw new BadRequestException('File banner wajib diunggah');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Banner harus JPG, PNG, atau WebP');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Ukuran file banner maksimal 4 MB');
    }
    if (width !== BANNER_WIDTH || height !== BANNER_HEIGHT) {
      throw new BadRequestException(
        `Ukuran banner wajib ${BANNER_WIDTH}×${BANNER_HEIGHT} px`,
      );
    }

    const ext =
      file.mimetype === 'image/png'
        ? '.png'
        : file.mimetype === 'image/webp'
          ? '.webp'
          : '.jpg';

    const dir = '/app/uploads/banners';
    await mkdir(dir, { recursive: true });

    const safeName = `merchant-${merchantId}-product-${productId}-${Date.now()}${ext}`;
    await writeFile(join(dir, safeName), file.buffer);

    const row = this.banners.create({
      merchantId,
      productId,
      imageUrl: `/api/v1/uploads/banners/${safeName}`,
      width,
      height,
      status: MerchantBannerStatus.PENDING,
      reviewNote: null,
      finalImageUrl: null,
      promotionId: null,
    });

    return this.banners.save(row);
  }

  async uploadFinal(
    id: string,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
    width: number,
    height: number,
  ) {
    const row = await this.banners.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Pengajuan banner tidak ditemukan');
    if (!file?.buffer?.length) throw new BadRequestException('File banner final wajib diunggah');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Banner harus JPG, PNG, atau WebP');
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Ukuran file banner maksimal 4 MB');
    }
    if (width !== BANNER_WIDTH || height !== BANNER_HEIGHT) {
      throw new BadRequestException(
        `Ukuran banner wajib ${BANNER_WIDTH}×${BANNER_HEIGHT} px`,
      );
    }

    const ext =
      file.mimetype === 'image/png'
        ? '.png'
        : file.mimetype === 'image/webp'
          ? '.webp'
          : '.jpg';
    const dir = '/app/uploads/banners';
    await mkdir(dir, { recursive: true });
    const safeName = `final-banner-${id}-${Date.now()}${ext}`;
    await writeFile(join(dir, safeName), file.buffer);
    row.finalImageUrl = `/api/v1/uploads/banners/${safeName}`;
    await this.banners.save(row);
    return row;
  }

  async adminList() {
    return this.banners
      .createQueryBuilder('b')
      .innerJoin(Product, 'p', 'p.id = b.product_id')
      .leftJoin('merchants', 'm', 'm.id = b.merchant_id')
      .select([
        'b.id AS id',
        'b.merchant_id AS merchantId',
        'b.product_id AS productId',
        'b.image_url AS imageUrl',
        'b.width AS width',
        'b.height AS height',
        'b.status AS status',
        'b.review_note AS reviewNote',
        'b.final_image_url AS finalImageUrl',
        'b.promotion_id AS promotionId',
        'b.created_at AS createdAt',
        'p.name AS productName',
        'p.slug AS productSlug',
        'm.business_name AS merchantName',
      ])
      .orderBy('b.created_at', 'DESC')
      .getRawMany();
  }

  async review(id: string, status: 'approved' | 'rejected', note?: string) {
    const row = await this.banners.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Pengajuan banner tidak ditemukan');
    if (row.status === MerchantBannerStatus.PUBLISHED) {
      throw new BadRequestException('Banner yang sudah tayang tidak bisa direview ulang');
    }

    row.status =
      status === 'approved'
        ? MerchantBannerStatus.APPROVED
        : MerchantBannerStatus.REJECTED;
    row.reviewNote = note?.trim() || null;
    return this.banners.save(row);
  }

  async publish(
    id: string,
    input: {
      finalImageUrl?: string;
      title?: string;
      subtitle?: string;
      eyebrow?: string;
      ctaLabel?: string;
      ctaUrl?: string;
      sortOrder?: number;
    },
  ) {
    const row = await this.banners.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Pengajuan banner tidak ditemukan');
    if (row.status !== MerchantBannerStatus.APPROVED) {
      throw new BadRequestException('Banner harus disetujui sebelum dipublikasikan');
    }

    const product = await this.products.findOne({ where: { id: row.productId } });
    if (!product) throw new NotFoundException('Produk tidak ditemukan');

    const imageUrl = input.finalImageUrl?.trim() || row.imageUrl;
    const promotion = await this.promotions.create({
      title: input.title?.trim() || product.name,
      eyebrow: input.eyebrow?.trim() || 'UMKM pilihan',
      subtitle:
        input.subtitle?.trim() ||
        'Produk lokal baru yang sudah lolos review Website Preorder.',
      imageUrl,
      ctaLabel: input.ctaLabel?.trim() || 'Lihat produk',
      ctaUrl: input.ctaUrl?.trim() || `/product/${product.slug}`,
      isActive: true,
      sortOrder: Number(input.sortOrder ?? 0),
    });

    row.finalImageUrl = imageUrl;
    row.promotionId = promotion.id;
    row.status = MerchantBannerStatus.PUBLISHED;
    await this.banners.save(row);

    return { banner: row, promotion };
  }
}
