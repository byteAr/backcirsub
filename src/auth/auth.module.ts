import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

import { RedisModule } from '../redis/redis.module';
import { TwilioModule } from '../twilio/twilio.module';

@Module({
  imports:[PrismaModule, RedisModule, TwilioModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
