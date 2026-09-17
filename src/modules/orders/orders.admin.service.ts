import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';

import { Order, OrderStatus } from './entities/order.entity';
import { QueryOrdersDto } from './dto/query-orders.dto';
import { BatchesService } from '../batches/batches.service';

/** Legal status transitions — the dashboard cannot skip steps or resurrect. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.SOURCED, OrderStatus.CANCELLED],
  [OrderStatus.SOURCED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

@Injectable()
export class OrdersAdminService {
  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly batchesService: BatchesService,
  ) {}

  async findAll(query: QueryOrdersDto) {
    const batchId =
      query.batchId ?? Number(await this.batchesService.resolveOpenBatchId());

    const qb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.customer', 'c')
      .where('o.batch_id = :batchId', { batchId })
      .orderBy('o.created_at', 'DESC');

    if (query.status) qb.andWhere('o.status = :status', { status: query.status });

    if (query.q) {
      const term = `%${query.q}%`;
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('o.order_no LIKE :term', { term })
            .orWhere('c.name LIKE :term', { term })
            .orWhere('c.phone LIKE :term', { term }),
        ),
      );
    }

    const [data, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return {
      data,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  async findOne(orderNo: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { orderNo },
      relations: { items: true, customer: true },
    });
    if (!order) throw new NotFoundException(`Order ${orderNo} not found`);
    return order;
  }

  async updateStatus(orderNo: string, next: OrderStatus): Promise<Order> {
    const order = await this.findOne(orderNo);
    if (order.status === next) return order;

    if (!TRANSITIONS[order.status].includes(next)) {
      throw new BadRequestException(
        `Cannot move order from ${order.status} to ${next}`,
      );
    }
    order.status = next;
    return this.orderRepo.save(order);
  }

  /** Weekend delivery: flip the whole sourced batch in one statement. */
  async bulkAdvance(batchId: number, from: OrderStatus, to: OrderStatus) {
    if (!TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(`Cannot move orders from ${from} to ${to}`);
    }
    const res = await this.orderRepo
      .createQueryBuilder()
      .update(Order)
      .set({ status: to })
      .where('batch_id = :batchId', { batchId })
      .andWhere('status = :from', { from })
      .execute();

    return { affected: res.affected ?? 0 };
  }
}
