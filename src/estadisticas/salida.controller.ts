import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SalidaDto } from './dto/estadisticas.dto';
import { EstadisticasService } from './estadisticas.service';

/**
 * La señal de que el asociado cerró la app o la mandó al fondo.
 *
 * Va en un controlador aparte porque no puede pasar por el guard: la manda
 * navigator.sendBeacon, que no deja poner la cabecera Authorization. El token
 * viaja en el cuerpo y se verifica acá con la misma firma que el resto.
 *
 * Siempre responde 204, aunque el token no sirva: quien la manda ya se está
 * yendo y no va a leer la respuesta. Lo único que puede hacer esta ruta es
 * sacar al propio dueño del token de "usando la app ahora".
 */
@Controller('estadisticas')
export class SalidaController {
  constructor(
    private readonly jwt: JwtService,
    private readonly estadisticas: EstadisticasService,
  ) {}

  @Post('salida')
  @HttpCode(204)
  async salida(@Body() dto: SalidaDto): Promise<void> {
    try {
      const { id } = await this.jwt.verifyAsync<JwtPayload>(dto.token);
      if (id) await this.estadisticas.salida(id, dto.plataforma);
    } catch {
      // Token vencido o inválido: no hay nada que hacer.
    }
  }
}
