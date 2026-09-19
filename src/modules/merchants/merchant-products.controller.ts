import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { MerchantProductsService } from './merchant-products.service';
import { SubmitMerchantProductDto } from './dto/submit-merchant-product.dto';

@Controller('merchant/products')
export class MerchantProductsController {
  constructor(private readonly service: MerchantProductsService) {}

  @Get()
  list(@Req() req: any) {
    return this.service.list(req.user.merchantId);
  }

  @Post('media')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 3 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = file.mimetype === 'image/webp';
        cb(
          ok ? null : new BadRequestException('Foto produk harus berformat WebP'),
          ok,
        );
      },
    }),
  )
  uploadMedia(@Req() req: any, @UploadedFile() file: any) {
    return this.service.uploadProductImage(req.user.merchantId, file);
  }

  @Post()
  submit(@Req() req: any, @Body() dto: SubmitMerchantProductDto) {
    return this.service.submit(req.user.merchantId, dto);
  }
}
