import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TramitesModule } from './tramites/tramites.module';
import { AuthModule } from './auth/auth.module';
import { EnvConfiguration } from './config/app.config';
import { RedisModule } from './redis/redis.module';
import { TwilioModule } from './twilio/twilio.module';
import { CredencialModule } from './credencial/credencial.module';
import { PushNotificationsModule } from './push-notifications/push-notifications.module';
import { AdminNotificationsModule } from './admin-notifications/admin-notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [EnvConfiguration]
    }),
    TramitesModule,
    AuthModule,
    RedisModule,
    TwilioModule,
    CredencialModule,
    PushNotificationsModule,
    AdminNotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {

  constructor() {}
  
}
