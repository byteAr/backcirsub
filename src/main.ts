import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  const allowedOrigins = [
    'http://localhost:4200',
    /^https:\/\/([a-z0-9-]+\.)*cirsubgn\.org\.ar$/,
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.some((allowed) =>
        typeof allowed === 'string' ? allowed === origin : allowed.test(origin),
      )) {
        callback(null, true);
      } else {
        callback(new Error(`Origen no permitido por CORS: ${origin}`));
      }
    },
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true 
    })
   );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
