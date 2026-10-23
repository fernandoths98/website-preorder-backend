import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { SessionStampService } from './session-stamp.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AdminRole } from '../../common/enums/admin-role.enum';
import { MerchantStatus } from '../merchants/entities/merchant.entity';
import { RolesGuard } from '../../common/guards/roles.guard';
import { MerchantProductsController } from '../merchants/merchant-products.controller';
import { ProductsAdminController } from '../products/products.admin.controller';
import {
  RequestRateGuard,
  RateLimits,
} from '../../common/guards/request-rate.guard';
const config = { getOrThrow: () => 'test-secret' } as unknown as ConfigService;
function repo(row: any) {
  const qb: any = {
    addSelect: () => qb,
    where: () => qb,
    getOne: async () => row,
  };
  return { createQueryBuilder: () => qb };
}
describe('admin and merchant sessions', () => {
  const sessions = new SessionStampService(config);
  it('rejects changed passwords, disabled admins, and legacy tokens', async () => {
    const row = {
      id: '1',
      email: 'a@example.test',
      role: AdminRole.OWNER,
      isActive: true,
      passwordHash: 'hash',
    };
    const strategy = new JwtStrategy(
      config,
      repo(row) as any,
      repo(null) as any,
      sessions,
    );
    const payload = {
      sub: '1',
      email: row.email,
      role: AdminRole.OWNER,
      sessionStamp: sessions.stamp('hash'),
    };
    expect((await strategy.validate(payload)).role).toBe(AdminRole.OWNER);
    await expect(
      strategy.validate({ ...payload, sessionStamp: undefined }),
    ).rejects.toThrow();
    row.passwordHash = 'new';
    await expect(strategy.validate(payload)).rejects.toThrow();
    row.passwordHash = 'hash';
    row.isActive = false;
    await expect(strategy.validate(payload)).rejects.toThrow();
  });
  it('rejects suspended merchants and mismatched merchant IDs', async () => {
    const row = {
      id: '2',
      email: 'm@example.test',
      status: MerchantStatus.APPROVED,
      passwordHash: 'hash',
    };
    const strategy = new JwtStrategy(
      config,
      repo(null) as any,
      repo(row) as any,
      sessions,
    );
    const payload = {
      sub: '2',
      merchantId: '2',
      email: row.email,
      role: 'merchant' as const,
      sessionStamp: sessions.stamp('hash'),
    };
    expect((await strategy.validate(payload)).merchantId).toBe('2');
    await expect(
      strategy.validate({ ...payload, merchantId: '3' }),
    ).rejects.toThrow();
    row.status = MerchantStatus.REJECTED;
    await expect(strategy.validate(payload)).rejects.toThrow();
  });
  it('forbids admin tokens on merchant endpoints and merchant tokens on admin endpoints', () => {
    const guard = new RolesGuard(new Reflector());
    const ctx = (cls: any, role: string) =>
      ({
        getClass: () => cls,
        getHandler: () => () => {},
        switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
      }) as any;
    expect(() =>
      guard.canActivate(ctx(MerchantProductsController, AdminRole.OWNER)),
    ).toThrow();
    expect(() =>
      guard.canActivate(ctx(ProductsAdminController, 'merchant')),
    ).toThrow();
    expect(guard.canActivate(ctx(MerchantProductsController, 'merchant'))).toBe(
      true,
    );
    expect(
      guard.canActivate(ctx(ProductsAdminController, AdminRole.ADMIN)),
    ).toBe(true);
  });
  it('limits repeated login attempts across IPs for the same normalized email, then resets after the window', () => {
    class Login {
      login() {}
    }
    const handler = Login.prototype.login;
    RateLimits({ limit: 2, seconds: 60, by: 'email' })(
      Login.prototype,
      'login',
      Object.getOwnPropertyDescriptor(Login.prototype, 'login')!,
    );
    const req = { ip: '1', body: { email: 'A@example.test' } };
    const context = {
      getClass: () => Login,
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => req }),
    } as any;
    jest.useFakeTimers();
    try {
      const guard = new RequestRateGuard(new Reflector());
      expect(guard.canActivate(context)).toBe(true);
      req.ip = '2';
      req.body.email = ' a@EXAMPLE.test ';
      expect(guard.canActivate(context)).toBe(true);
      expect(() => guard.canActivate(context)).toThrow();
      jest.advanceTimersByTime(61000);
      expect(guard.canActivate(context)).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});
