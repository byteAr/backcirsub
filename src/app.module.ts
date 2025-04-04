import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TramitesModule } from './tramites/tramites.module';
import { AuthModule } from './auth/auth.module';
import { EnvConfiguration } from './config/app.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [EnvConfiguration]
    }),
    TramitesModule,
    AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {

  constructor() {}
}
