import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { mkdirSync } from 'node:fs';
import { AppModule } from './app.module';

async function bootstrap() {
  mkdirSync(process.env.UPLOAD_DIR || './uploads', { recursive: true });
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.FRONTEND_ORIGIN?.split(',') || true,
    credentials: true,
  });
  await app.listen(Number(process.env.PORT) || 3000, '0.0.0.0');
}

bootstrap();
