import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { MerchantBannersService } from './merchant-banners.service';

@Controller('merchant/banners')
export class MerchantBannersController {
  constructor(private readonly service: MerchantBannersService) {}

  @Get()
  list(@Req() req: any) {
    return this.service.listForMerchant(req.user.merchantId);
  }

  @Get(':productId')
  getForProduct(@Req() req: any, @Param('productId') productId: string) {
    return this.service.getForProduct(req.user.merchantId, productId);
  }

  @Post(':productId')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 4 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
        cb(ok ? null : new BadRequestException('Banner harus JPG, PNG, atau WebP'), ok);
      },
    }),
  )
  submit(
    @Req() req: any,
    @Param('productId') productId: string,
    @UploadedFile() file: any,
  ) {
    const width = Number(req.body?.width);
    const height = Number(req.body?.height);
    return this.service.submit(
      req.user.merchantId,
      productId,
      file,
      width,
      height,
    );
  }
}
