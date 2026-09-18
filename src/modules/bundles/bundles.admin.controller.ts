import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { BundlesAdminService } from './bundles.admin.service';
import { CreateBundleDto, UpdateBundleDto } from './dto/upsert-bundle.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums/admin-role.enum';

/** → /api/v1/admin/bundles/** — JwtAuthGuard + RolesGuard are global. */
@Roles(AdminRole.OWNER, AdminRole.ADMIN)
@Controller('admin/bundles')
export class BundlesAdminController {
  constructor(private readonly bundlesAdmin: BundlesAdminService) {}

  @Get()
  findAll(@Query('batchId') batchId?: string) {
    return this.bundlesAdmin.findAll(batchId);
  }

  @Post()
  create(@Body() dto: CreateBundleDto) {
    return this.bundlesAdmin.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBundleDto) {
    return this.bundlesAdmin.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.bundlesAdmin.softRemove(id);
  }
}
