import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { RedisModule } from '../redis/redis.module';
import { ClaveExternaGuard } from './clave-externa.guard';
import { NotificacionesExternasController } from './notificaciones-externas.controller';
import { NotificacionesExternasService } from './notificaciones-externas.service';

@Module({
  imports: [ConfigModule, RedisModule, AdminNotificationsModule],
  controllers: [NotificacionesExternasController],
  providers: [NotificacionesExternasService, ClaveExternaGuard],
})
export class NotificacionesExternasModule {}
