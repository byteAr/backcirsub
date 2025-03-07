import { Controller, Get, Post, Body, UsePipes, ValidationPipe, Param, Put, Delete } from '@nestjs/common';
import { TramitesService } from './tramites.service';
import { CreateTramiteDto } from './dto/create-tramite.dto';
import { UpdateTramiteDto } from './dto/update-tramite.dto';
import { createResponsableDto } from './dto/create-responsable.dto';

@Controller('tramites')
export class TramitesController {
  constructor(private readonly tramitesService: TramitesService) {}

  @Get()
  async obtenerTramites() {
    return this.tramitesService.getAllTramites();
  }

  @Post() 
  crearTramite(@Body() createTramiteDto: CreateTramiteDto) {    
    return this.tramitesService.createTramite(createTramiteDto);
  }

  @Post('responsable') 
  crearResponsable(@Body() createTramiteDto: createResponsableDto) {    
    return this.tramitesService.createResponsabe(createTramiteDto);
  }

  

  @Get('/responsables')
  async obtenerResponsables() {
    return this.tramitesService.getAllTramites();
  }

  @Get(':id')
  async obtenerUnTramites(@Param('id') id: string) {
    return this.tramitesService.getTramiteById(+id);
  }
  @Get('/responsable/:id')
  async obtenerUnResponsable(@Param('id') id: string) {
    return this.tramitesService.getResponsableById(+id);
  }

  @Put(':id')
  async updateTramite(@Body() data: UpdateTramiteDto, @Param('id') id: string) {
    return this.tramitesService.updateTramite(data, +id);
  }

  @Delete(':id')
  async deleteTramite(@Param('id') id: string) {
    return this.tramitesService.deleteTramite(+id);
  }
}
