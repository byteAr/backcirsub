import { Module } from '@nestjs/common';
import { TramitesService } from './tramites.service';
import { TramitesController } from './tramites.controller';

@Module({
  controllers: [TramitesController],
  providers: [TramitesService],
})
export class TramitesModule {}
