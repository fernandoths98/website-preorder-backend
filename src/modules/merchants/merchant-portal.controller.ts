import { SessionStampService } from '../auth/session-stamp.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RateLimits } from '../../common/guards/request-rate.guard';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
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
    private readonly sessions: SessionStampService,
  ) {}

  @Public()
  @Post('login')
  @RateLimits(
    { limit: 30, seconds: 900 },
    { limit: 10, seconds: 900, by: 'email' },
  )
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: MerchantLoginDto) {
    const m = await this.merchants.authenticate(dto);
    return {
      accessToken: await this.jwt.signAsync({
        sub: m.id,
        email: m.email,
        role: 'merchant',
        merchantId: m.id,
        sessionStamp: this.sessions.stamp(m.passwordHash!),
      }),
      merchant: {
        id: m.id,
        businessName: m.businessName,
        slug: m.slug,
      },
    };
  }

  @Get('me')
  @Roles('merchant')
  me(@Req() req: any) {
    return this.merchants.getPortalProfile(req.user.merchantId);
  }

  @Public()
  @Post('activate')
  @RateLimits({ limit: 15, seconds: 900 })
  @HttpCode(HttpStatus.OK)
  activate(@Body() dto: ActivateMerchantDto) {
    return this.merchants.activate(dto.token, dto.password);
  }
}
