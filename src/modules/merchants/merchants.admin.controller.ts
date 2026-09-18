import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums/admin-role.enum';
import { ReviewMerchantDto } from './dto/review-merchant.dto';
import { MerchantsService } from './merchants.service';

@Roles(AdminRole.OWNER, AdminRole.ADMIN)
@Controller('admin/merchants')
export class MerchantsAdminController {
  constructor(private readonly merchants:MerchantsService){}
  @Get() findAll(){ return this.merchants.findAll(); }
  @Patch(':id/review') review(@Param('id') id:string,@Body() dto:ReviewMerchantDto){ return this.merchants.review(id,dto); }
  @Post(':id/password')
  setPassword(@Param('id') id:string,@Body() body:{password:string}){ return this.service.setPassword(id,body.password); }
}
