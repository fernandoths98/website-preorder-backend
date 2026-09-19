import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import slugify from 'slugify';
import { Product, MerchantProductStatus } from '../products/entities/product.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { SubmitMerchantProductDto } from './dto/submit-merchant-product.dto';
import { UpdateMerchantProductDto } from './dto/update-merchant-product.dto';
import { suggestPricing } from '../products/pricing-policy';

@Injectable()
export class MerchantProductsService {
  constructor(
    @InjectRepository(Product) private products: Repository<Product>,
    @InjectRepository(ProductImage) private images: Repository<ProductImage>,
    private ds: DataSource,
  ) {}

  list(merchantId: string) {
    return this.products.find({
      where: { merchantId },
      relations: { images: true },
      order: { createdAt: 'DESC' },
    });
  }

  async uploadProductImage(
    merchantId: string,
    file: { buffer: Buffer; mimetype: string; size: number; originalname: string },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File foto produk wajib diunggah');
    }

    if (file.mimetype !== 'image/webp') {
      throw new BadRequestException('Foto produk harus dikirim dalam format WebP');
    }

    if (file.size > 3 * 1024 * 1024) {
      throw new BadRequestException('Ukuran foto produk maksimal 3 MB setelah dikompresi');
    }

    const dir = '/app/uploads/products';

    const safeName = `merchant-${merchantId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.webp`;

    try {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, safeName), file.buffer);
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: unknown }).code ?? '')
          : '';
      if (code === 'EACCES' || code === 'EPERM') {
        throw new ServiceUnavailableException(
          'Storage upload tidak writable. Perbaiki ownership folder uploads untuk user container (UID 1000).',
        );
      }
      throw error;
    }

    return {
      url: `/api/v1/uploads/products/${safeName}`,
      mimeType: 'image/webp',
      size: file.size,
    };
  }

  adminList() {
    return this.products
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.images', 'images')
      .leftJoinAndSelect('p.merchant', 'merchant')
      .where('p.merchant_id IS NOT NULL')
      .orderBy('p.created_at', 'DESC')
      .getMany();
  }

  async submit(merchantId: string, dto: SubmitMerchantProductDto) {
    return this.ds.transaction(async (em) => {
      const slugBase = slugify(dto.name, { lower: true, strict: true }) || 'produk';
      let slug = `${slugBase}-m${merchantId}`, n = 1;
      while (await em.findOne(Product, { where: { slug }, withDeleted: true })) {
        slug = `${slugBase}-m${merchantId}-${++n}`;
      }

      const sku = `M${merchantId}-${Date.now().toString(36).toUpperCase()}`;
      const margin = dto.margin ?? suggestPricing(dto.basePrice).margin;

      const p = await em.save(
        Product,
        em.create(Product, {
          merchantId,
          merchantStatus: MerchantProductStatus.PENDING,
          merchantPreorderDays: dto.preorderDays,
          sku,
          slug,
          name: dto.name,
          description: dto.description ?? null,
          category: dto.category,
          unit: dto.unit,
          basePrice: dto.basePrice,
          margin,
          isActive: false,
          imageUrl: dto.imageUrls[0],
        }),
      );

      await em.save(
        ProductImage,
        dto.imageUrls.map((url, i) =>
          em.create(ProductImage, {
            productId: p.id,
            imageUrl: url,
            sortOrder: i,
            isPrimary: i === 0,
          }),
        ),
      );

      return em.findOneOrFail(Product, {
        where: { id: p.id },
        relations: { images: true },
      });
    });
  }

  async update(
    merchantId: string,
    id: string,
    dto: UpdateMerchantProductDto,
  ) {
    const current = await this.products.findOne({
      where: { id, merchantId },
      relations: { images: true },
    });
    if (!current) throw new NotFoundException('Produk mitra tidak ditemukan');

    return this.ds.transaction(async (em) => {
      if (dto.name !== undefined) current.name = dto.name.trim();
      if (dto.description !== undefined) current.description = dto.description.trim() || null;
      if (dto.category !== undefined) current.category = dto.category.trim();
      if (dto.unit !== undefined) current.unit = dto.unit.trim();
      if (dto.basePrice !== undefined) {
        current.basePrice = Number(dto.basePrice);
        current.margin = suggestPricing(Number(dto.basePrice)).margin;
      }
      if (dto.preorderDays !== undefined) {
        current.merchantPreorderDays = Number(dto.preorderDays);
      }

      // Any merchant edit goes back through review before storefront publication.
      current.merchantStatus = MerchantProductStatus.PENDING;
      current.merchantReviewNote = null;
      current.isActive = false;

      const newImageUrls = dto.imageUrls?.length ? dto.imageUrls : null;
      if (newImageUrls) {
        current.imageUrl = newImageUrls[0];
        // Avoid re-cascading the old loaded relation after it is deleted below.
        current.images = undefined;
      }

      await em.save(Product, current);

      if (newImageUrls) {
        await em.delete(ProductImage, { productId: current.id });
        await em.save(
          ProductImage,
          newImageUrls.map((url, i) =>
            em.create(ProductImage, {
              productId: current.id,
              imageUrl: url,
              sortOrder: i,
              isPrimary: i === 0,
            }),
          ),
        );
      }

      return em.findOneOrFail(Product, {
        where: { id: current.id },
        relations: { images: true },
      });
    });
  }

  async review(id: string, status: 'approved' | 'rejected', note?: string) {
    const p = await this.products.findOne({ where: { id } });
    if (!p || !p.merchantId) throw new NotFoundException('Produk mitra tidak ditemukan');
    p.merchantStatus =
      status === 'approved'
        ? MerchantProductStatus.APPROVED
        : MerchantProductStatus.REJECTED;
    p.merchantReviewNote = note?.trim() || null;
    p.isActive = status === 'approved';
    return this.products.save(p);
  }
}
