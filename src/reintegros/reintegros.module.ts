import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '../auth/auth.module';
import { ReintegrosController } from './reintegros.controller';
import { ReintegrosService } from './reintegros.service';

@Module({
  imports: [ConfigModule, AuthModule, HttpModule],
  controllers: [ReintegrosController],
  providers: [ReintegrosService],
  exports: [ReintegrosService],
})
export class ReintegrosModule {}
