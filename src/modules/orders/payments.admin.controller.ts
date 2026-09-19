import { Controller, Get, Param, Post, Query } from '@nestjs/common';

import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums/admin-role.enum';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { PaymentsService } from './payments.service';

@Roles(AdminRole.OWNER, AdminRole.ADMIN)
@Controller('admin/payments')
export class PaymentsAdminController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  list(@Query() query: QueryPaymentsDto) {
    return this.payments.adminList(query);
  }

  @Get('summary')
  summary() {
    return this.payments.adminSummary();
  }

  @Post(':id/recheck')
  recheck(@Param('id') id: string) {
    return this.payments.adminRecheck(id);
  }
}
