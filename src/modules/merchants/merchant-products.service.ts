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
    const product = await this.products.findOne({
      where: { id, merchantId },
      relations: { images: true },
    });

    if (!product) {
      throw new NotFoundException('Produk mitra tidak ditemukan');
    }

    const requested = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description.trim() || null }
        : {}),
      ...(dto.category !== undefined ? { category: dto.category.trim() } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit.trim() } : {}),
      ...(dto.basePrice !== undefined ? { basePrice: Number(dto.basePrice) } : {}),
      ...(dto.preorderDays !== undefined
        ? { preorderDays: Number(dto.preorderDays) }
        : {}),
    };

    // Approved products stay live with the last approved data while the edit
    // waits for review. This avoids storefront downtime for routine edits.
    if (
      product.merchantStatus === MerchantProductStatus.APPROVED &&
      product.isActive
    ) {
      product.merchantPendingUpdateJson = requested;
      product.merchantPendingUpdateAt = new Date();
      product.merchantReviewNote = null;
      await this.products.save(product);

      return this.products.findOneOrFail({
        where: { id: product.id, merchantId },
        relations: { images: true },
      });
    }

    // Products that are not live yet can keep using the normal pending flow.
    if ('name' in requested) product.name = requested.name as string;
    if ('description' in requested) {
      product.description = requested.description as string | null;
    }
    if ('category' in requested) product.category = requested.category as string;
    if ('unit' in requested) product.unit = requested.unit as string;
    if ('basePrice' in requested) {
      product.basePrice = Number(requested.basePrice);
      product.margin = suggestPricing(Number(requested.basePrice)).margin;
    }
    if ('preorderDays' in requested) {
      product.merchantPreorderDays = Number(requested.preorderDays);
    }

    product.merchantStatus = MerchantProductStatus.PENDING;
    product.merchantReviewNote = null;
    product.isActive = false;

    await this.products.save(product);

    return this.products.findOneOrFail({
      where: { id: product.id, merchantId },
      relations: { images: true },
    });
  }

  async review(id: string, status: 'approved' | 'rejected', note?: string) {
    const p = await this.products.findOne({ where: { id } });
    if (!p || !p.merchantId) {
      throw new NotFoundException('Produk mitra tidak ditemukan');
    }

    // Existing approved product with a staged merchant edit:
    // keep current live data on reject, atomically promote staged data on approve.
    if (p.merchantPendingUpdateJson) {
      const pending = p.merchantPendingUpdateJson as {
        name?: string;
        description?: string | null;
        category?: string;
        unit?: string;
        basePrice?: number;
        preorderDays?: number;
      };

      if (status === 'approved') {
        if (pending.name !== undefined) p.name = pending.name;
        if (pending.description !== undefined) p.description = pending.description;
        if (pending.category !== undefined) p.category = pending.category;
        if (pending.unit !== undefined) p.unit = pending.unit;
        if (pending.basePrice !== undefined) {
          p.basePrice = Number(pending.basePrice);
          p.margin = suggestPricing(Number(pending.basePrice)).margin;
        }
        if (pending.preorderDays !== undefined) {
          p.merchantPreorderDays = Number(pending.preorderDays);
        }
        p.merchantReviewNote = null;
      } else {
        p.merchantReviewNote = note?.trim() || 'Perubahan produk ditolak';
      }

      p.merchantPendingUpdateJson = null;
      p.merchantPendingUpdateAt = null;
      p.merchantStatus = MerchantProductStatus.APPROVED;
      p.isActive = true;
      return this.products.save(p);
    }

    p.merchantStatus =
      status === 'approved'
        ? MerchantProductStatus.APPROVED
        : MerchantProductStatus.REJECTED;
    p.merchantReviewNote = note?.trim() || null;
    p.isActive = status === 'approved';
    return this.products.save(p);
  }
}
