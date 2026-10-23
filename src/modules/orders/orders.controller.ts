import { Headers, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RateLimits } from '../../common/guards/request-rate.guard';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';

import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { Public } from '../../common/decorators/public.decorator';

/** → /api/v1/orders/** — storefront checkout, no auth. */
@Public()
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post()
  @RateLimits({ limit: 30, seconds: 60 })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Post(':orderNo/payment/recheck')
  @RateLimits({ limit: 10, seconds: 60 })
  @HttpCode(HttpStatus.OK)
  async recheckPayment(
    @Param('orderNo') orderNo: string,
    @Headers('x-order-access-token') token?: string,
  ) {
    const order = await this.ordersService.findByOrderNo(orderNo, token);
    return this.paymentsService.recheckOrder(order.id);
  }

  /** The order number is an identifier; a separate checkout token authorizes access. */
  @Get(':orderNo')
  @RateLimits({ limit: 90, seconds: 60 })
  async findOne(
    @Param('orderNo') orderNo: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('x-order-access-token') token?: string,
  ) {
    const order = await this.ordersService.findByOrderNo(orderNo, token);
    res.setHeader('Cache-Control', 'no-store');
    const checkout = await this.ordersService.checkoutState(order);
    return {
      orderNo: order.orderNo,
      status: order.status,
      createdAt: order.createdAt,
      itemsCount: order.itemsCount,
      grandTotal: Number(order.grandTotal),
      deliveryType: order.deliveryType,
      customerNote: order.customerNote,
      payment: checkout.payment,
      waUrl: checkout.waUrl,
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
