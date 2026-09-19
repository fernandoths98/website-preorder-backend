import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
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
