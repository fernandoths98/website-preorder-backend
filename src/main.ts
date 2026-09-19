import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get(ConfigService);

  app.useStaticAssets('/app/uploads', { prefix: '/api/v1/uploads/' });

  // The curated UMKM image is stored in git as an SVG wrapper because the
  // repository contents API is text-only. Decode the embedded WebP once at
  // process startup and serve the real raster file to browsers.
  const curatedDir = '/app/assets/product-media';
  const curatedSvg = join(curatedDir, 'ayam-goreng-bawang-putih-bang-gendoet-m1.svg');
  const curatedWebp = join(curatedDir, 'ayam-goreng-bawang-putih-bang-gendoet-m1.webp');
  if (!existsSync(curatedWebp) && existsSync(curatedSvg)) {
    const svg = readFileSync(curatedSvg, 'utf8');
    const match = svg.match(/data:image\/webp;base64,([^"]+)/);
    if (match?.[1]) {
      writeFileSync(curatedWebp, Buffer.from(match[1], 'base64'));
    }
  }
  app.useStaticAssets(curatedDir, { prefix: '/api/v1/product-media/' });

  // Supplier snapshots can contain thousands of products. The default Express
  // JSON limit (~100 KB) is too small for a complete catalog snapshot, so use
  // an explicit bounded limit while keeping payload parsing local to the API.
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));

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
