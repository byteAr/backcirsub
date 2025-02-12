import { Controller, Get, Post, Body } from '@nestjs/common';
import { TramitesService } from './tramites.service';

@Controller('tramites')
export class TramitesController {
  constructor(private readonly tramitesService: TramitesService) {}

  @Post('crear')
  async crearTramite(@Body() data: { nombre: string; tipo: number }) {
    return this.tramitesService.crearTramite(data.nombre, data.tipo);
  }

  @Get()
  async obtenerTramites() {
    return this.tramitesService.obtenerTramites();
  }
}
