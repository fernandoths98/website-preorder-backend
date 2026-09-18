import { Body, Controller, Param, Patch } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums/admin-role.enum';
import { MerchantProductsService } from './merchant-products.service';

@Controller('admin/merchant-products')
@Roles(AdminRole.OWNER, AdminRole.ADMIN)
export class MerchantProductsAdminController {
  constructor(private readonly service: MerchantProductsService) {}

  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Body() body: { status: 'approved' | 'rejected'; reviewNote?: string },
  ) {
    return this.service.review(id, body.status, body.reviewNote);
  }
}
