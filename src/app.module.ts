import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TramitesModule } from './tramites/tramites.module';
import { AuthModule } from './auth/auth.module';
import { EnvConfiguration } from './config/app.config';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [EnvConfiguration]
    }),
    TramitesModule,
    AuthModule,
    RedisModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {

  constructor() {}
  
}
