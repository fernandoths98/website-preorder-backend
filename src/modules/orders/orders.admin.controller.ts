import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';

import { OrdersAdminService } from './orders.admin.service';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus } from './entities/order.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminRole } from '../../common/enums/admin-role.enum';

/** → /api/v1/admin/orders/** */
@Roles(AdminRole.OWNER, AdminRole.ADMIN)
@Controller('admin/orders')
export class OrdersAdminController {
  constructor(private readonly ordersAdminService: OrdersAdminService) {}

  @Get()
  findAll(@Query() query: QueryOrdersDto) {
    return this.ordersAdminService.findAll(query);
  }

  @Get(':orderNo')
  findOne(@Param('orderNo') orderNo: string) {
    return this.ordersAdminService.findOne(orderNo);
  }

  @Patch(':orderNo/status')
  updateStatus(
    @Param('orderNo') orderNo: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersAdminService.updateStatus(orderNo, dto.status);
  }

  @Post('bulk-advance')
  bulkAdvance(
    @Body() body: { batchId: number; from: OrderStatus; to: OrderStatus },
  ) {
    return this.ordersAdminService.bulkAdvance(body.batchId, body.from, body.to);
  }
}
