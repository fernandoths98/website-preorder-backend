import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Public } from '../../common/decorators/public.decorator';

/** → /api/v1/orders/** — storefront checkout, no auth. */
@Public()
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  /** Success page. The order number is the only credential. */
  @Get(':orderNo')
  async findOne(@Param('orderNo') orderNo: string) {
    const order = await this.ordersService.findByOrderNo(orderNo);
    return {
      orderNo: order.orderNo,
      status: order.status,
      createdAt: order.createdAt,
      itemsCount: order.itemsCount,
      grandTotal: Number(order.grandTotal),
      deliveryType: order.deliveryType,
      customerNote: order.customerNote,
      customer: {
        name: order.customer?.name ?? '',
        deliveryNote: order.customer?.deliveryNote ?? null,
      },
      batch: order.batch
        ? { code: order.batch.code, deliveryDate: order.batch.deliveryDate }
        : null,
      items: order.items.map((i) => ({
        productId: i.productId,
        /** Non-null when the line came from a paket. */
        bundleName: i.bundleName,
        productName: i.productName,
        unit: i.unit,
        qty: i.qty,
        unitPrice: Number(i.unitPrice),
        lineTotal: Number(i.lineTotal),
      })),
    };
  }
}
