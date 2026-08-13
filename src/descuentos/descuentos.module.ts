import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { DescuentosController } from './descuentos.controller';
import { DescuentosService } from './descuentos.service';

@Module({
  imports: [AuthModule, HttpModule],
  controllers: [DescuentosController],
  providers: [DescuentosService],
  exports: [DescuentosService],
})
export class DescuentosModule {}
