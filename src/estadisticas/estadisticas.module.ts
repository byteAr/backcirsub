import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { AccesosEstadisticasService } from './accesos-estadisticas.service';
import { EstadisticasController } from './estadisticas.controller';
import { SalidaController } from './salida.controller';
import { EstadisticasService } from './estadisticas.service';

@Module({
  imports: [AuthModule, PrismaModule, RedisModule],
  controllers: [EstadisticasController, SalidaController],
  providers: [EstadisticasService, AccesosEstadisticasService],
})
export class EstadisticasModule {}
