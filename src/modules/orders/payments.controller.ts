import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Public } from '../../common/decorators/public.decorator';
import { NusapayCallbackDto } from './dto/nusapay-callback.dto';
import { PaymentsService } from './payments.service';

@Public()
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Post('nusapay/callback')
  @HttpCode(HttpStatus.OK)
  callback(
    @Headers('x-wpo-gateway-key') gatewayKey: string | undefined,
    @Body() dto: NusapayCallbackDto,
  ) {
    const expected = this.config.get<string>('WPO_PAYMENT_CALLBACK_KEY');
    if (!expected || !gatewayKey || gatewayKey !== expected) {
      throw new UnauthorizedException('Callback key tidak valid');
    }

    return this.payments.handleNusapayCallback(dto);
  }
}
