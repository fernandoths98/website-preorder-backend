import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../../common/decorators/public.decorator';
import { MerchantsService } from './merchants.service';
import { MerchantLoginDto } from './dto/merchant-login.dto';
import { ActivateMerchantDto } from './dto/merchant-activation.dto';

@Controller('merchant')
export class MerchantPortalController {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly jwt: JwtService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: MerchantLoginDto) {
    const m = await this.merchants.authenticate(dto);
    return {
      accessToken: await this.jwt.signAsync({
        sub: m.id,
        email: m.email,
        role: 'merchant',
        merchantId: m.id,
      }),
      merchant: {
        id: m.id,
        businessName: m.businessName,
        slug: m.slug,
      },
    };
  }

  @Public()
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  activate(@Body() dto: ActivateMerchantDto) {
    return this.merchants.activate(dto.token, dto.password);
  }
}
