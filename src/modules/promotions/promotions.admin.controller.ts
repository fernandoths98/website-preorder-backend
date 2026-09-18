import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums/admin-role.enum';
import { CreatePromotionDto, UpdatePromotionDto } from './dto/upsert-promotion.dto';
import { PromotionsService } from './promotions.service';

@Roles(AdminRole.OWNER, AdminRole.ADMIN)
@Controller('admin/promotions')
export class PromotionsAdminController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  findAll() { return this.promotions.findAll(); }

  @Post()
  create(@Body() dto: CreatePromotionDto) { return this.promotions.create(dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotions.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) { return this.promotions.remove(id); }
}
