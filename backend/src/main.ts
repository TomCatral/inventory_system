import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin:
      process.env.FRONTEND_ORIGIN?.split(',')
        .map((origin) => origin.trim())
        .filter(Boolean) ?? [
        'http://localhost:8100',
        'http://localhost:4200',
        'http://127.0.0.1:8100',
        'http://127.0.0.1:4200',
        'capacitor://localhost',
        'ionic://localhost',
      ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
}

void bootstrap();
