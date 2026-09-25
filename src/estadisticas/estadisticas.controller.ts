import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { GetUser } from '../auth/decorators/get-user.decorator';
import { AccesosEstadisticasService } from './accesos-estadisticas.service';
import {
  ConsultaDiaDto,
  ConsultaTendenciaDto,
  DniDto,
  RegistrarActividadDto,
} from './dto/estadisticas.dto';
import { EstadisticasService } from './estadisticas.service';

type Usuario = { id: number; dni: string };

/**
 * Todo el controlador exige sesión. El asociado sale siempre del token: el
 * registro de actividad no acepta un id del cliente, así que nadie puede
 * inflar los números a nombre de otro.
 */
@Controller('estadisticas')
@UseGuards(AuthGuard())
export class EstadisticasController {
  constructor(
    private readonly estadisticas: EstadisticasService,
    private readonly accesos: AccesosEstadisticasService,
  ) {}

  /** La app avisa que el asociado abrió una pantalla. */
  @Post('actividad')
  @HttpCode(204)
  async registrar(@Body() dto: RegistrarActividadDto, @GetUser() usuario: Usuario): Promise<void> {
    await this.estadisticas.registrar(usuario.id, dto.plataforma);
  }

  /** Si el asociado ve las estadísticas, y si además administra los accesos. */
  @Get('permiso')
  async permiso(@GetUser() usuario: Usuario) {
    return {
      puedeVer: await this.accesos.puedeVer(usuario.dni),
      esDueno: this.accesos.esDueno(usuario.dni),
    };
  }

  @Get('dia')
  async dia(@Query() consulta: ConsultaDiaDto, @GetUser() usuario: Usuario) {
    await this.accesos.exigirQuePuedaVer(usuario.dni);
    return this.estadisticas.dia(consulta.fecha, consulta.plataforma);
  }

  @Get('tendencia')
  async tendencia(@Query() consulta: ConsultaTendenciaDto, @GetUser() usuario: Usuario) {
    await this.accesos.exigirQuePuedaVer(usuario.dni);
    return this.estadisticas.tendencia(consulta.dias ?? 30, consulta.hasta, consulta.plataforma);
  }

  // ---- Accesos: sólo el dueño ----

  @Get('accesos')
  async listarAccesos(@GetUser() usuario: Usuario) {
    this.accesos.exigirDueno(usuario.dni);
    return this.accesos.listar();
  }

  @Get('accesos/buscar')
  async buscar(@Query() { dni }: DniDto, @GetUser() usuario: Usuario) {
    this.accesos.exigirDueno(usuario.dni);
    return this.accesos.buscar(dni);
  }

  @Post('accesos')
  async agregar(@Body() { dni }: DniDto, @GetUser() usuario: Usuario) {
    return this.accesos.agregar(dni, usuario.dni);
  }

  @Delete('accesos/:dni')
  async quitar(@Param() { dni }: DniDto, @GetUser() usuario: Usuario) {
    return this.accesos.quitar(dni, usuario.dni);
  }
}
