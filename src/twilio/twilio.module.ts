// src/twilio/twilio.module.ts
import { Module } from '@nestjs/common';
import { TwilioService } from './twilio.service';
import { ConfigModule } from '@nestjs/config'; // Importa ConfigModule porque TwilioService lo usa
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule], // Importa ConfigModule para que TwilioService pueda acceder a ConfigService
  providers: [TwilioService], // Registra TwilioService como un proveedor
  exports: [TwilioService], // Exporta TwilioService para que pueda ser inyectado en otros módulos
})
export class TwilioModule {}