import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { SupplierSyncTokenGuard } from '../../common/guards/supplier-sync-token.guard';
import { SupplierSyncDto } from './dto/supplier-sync.dto';
import { SupplierSyncService } from './supplier-sync.service';

@Public()
@UseGuards(SupplierSyncTokenGuard)
@Controller('internal/supplier-sync')
export class SupplierSyncInternalController {
  constructor(private readonly service: SupplierSyncService) {}

  @Post('reconcile')
  reconcile(@Body() dto: SupplierSyncDto) {
    return this.service.reconcile(dto);
  }
}
