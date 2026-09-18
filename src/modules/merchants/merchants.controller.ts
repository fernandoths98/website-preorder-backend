import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { MerchantsService } from './merchants.service';

@Public()
@Controller('merchants')
export class MerchantsController {
  constructor(private readonly merchants:MerchantsService){}
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto:CreateMerchantDto){ return this.merchants.register(dto); }
}
