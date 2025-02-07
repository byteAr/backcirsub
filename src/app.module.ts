import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TramitesModule } from './tramites/tramites.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [TramitesModule, AuthModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
