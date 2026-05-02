import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminNotificationsService } from './admin-notifications.service';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [RedisModule, ConfigModule, AuthModule, PushNotificationsModule],
  controllers: [AdminNotificationsController],
  providers: [AdminNotificationsService, PrismaService],
})
export class AdminNotificationsModule {}
