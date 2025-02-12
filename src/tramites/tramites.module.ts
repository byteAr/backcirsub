import { Module } from '@nestjs/common';
import { TramitesService } from './tramites.service';
import { TramitesController } from './tramites.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

@Module({
  imports:[PrismaModule],
  controllers: [TramitesController],
  providers: [TramitesService],
})
export class TramitesModule {}
