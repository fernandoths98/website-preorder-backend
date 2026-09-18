import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PromotionsService } from './promotions.service';

@Public()
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  findAll() {
    return this.promotions.findPublic();
  }
}
