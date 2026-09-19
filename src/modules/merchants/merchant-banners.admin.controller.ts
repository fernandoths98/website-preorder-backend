import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums/admin-role.enum';
import { MerchantBannersService } from './merchant-banners.service';

@Controller('admin/merchant-banners')
@Roles(AdminRole.OWNER, AdminRole.ADMIN)
export class MerchantBannersAdminController {
  constructor(private readonly service: MerchantBannersService) {}

  @Get()
  list() {
    return this.service.adminList();
  }

  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Body() body: { status: 'approved' | 'rejected'; reviewNote?: string },
  ) {
    return this.service.review(id, body.status, body.reviewNote);
  }

  @Post(':id/final-image')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 4 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype);
        cb(ok ? null : new BadRequestException('Banner harus JPG, PNG, atau WebP'), ok);
      },
    }),
  )
  uploadFinal(
    @Param('id') id: string,
    @Req() req: any,
    @UploadedFile() file: any,
  ) {
    return this.service.uploadFinal(
      id,
      file,
      Number(req.body?.width),
      Number(req.body?.height),
    );
  }

  @Post(':id/publish')
  publish(
    @Param('id') id: string,
    @Body()
    body: {
      finalImageUrl?: string;
      title?: string;
      subtitle?: string;
      eyebrow?: string;
      ctaLabel?: string;
      ctaUrl?: string;
      sortOrder?: number;
    },
  ) {
    return this.service.publish(id, body);
  }
}
