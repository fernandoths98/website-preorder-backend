import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Real client IP behind Nginx / OpenLiteSpeed.
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // The API owns the /api prefix — do NOT rewrite it in the proxy.
  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const origins = (config.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins, credentials: true });

  const port = config.get<number>('PORT', 3000);

  // Loopback by default, so a bare-metal run is never accidentally public.
  // In Docker the process must bind 0.0.0.0 to be reachable at all — the
  // container's port is still published to 127.0.0.1 only (compose file),
  // so OpenLiteSpeed can reach it and the internet cannot.
  const host = config.get<string>('HOST', '127.0.0.1');

  await app.listen(port, host);
  Logger.log(`API on http://${host}:${port}/api/v1`, 'Bootstrap');
}
void bootstrap();
