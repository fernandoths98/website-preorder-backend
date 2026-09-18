import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums/admin-role.enum';
import { SupplierSyncDto } from './dto/supplier-sync.dto';
import { SupplierSyncService } from './supplier-sync.service';

@Roles(AdminRole.OWNER, AdminRole.ADMIN)
@Controller('admin/supplier-sync')
export class SupplierSyncController {
  constructor(private readonly service: SupplierSyncService) {}
  @Post('preview') preview(@Body() dto: SupplierSyncDto){ return this.service.preview(dto); }
  @Post('reconcile') reconcile(@Body() dto: SupplierSyncDto){ return this.service.reconcile(dto); }
  @Get('runs') runs(@Query('limit') limit?: string){ return this.service.latest(limit ? Number(limit) : 20); }
}
