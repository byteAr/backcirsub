import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AppExterna } from './claves-externas';
import { AppQueLlama, ClaveExternaGuard } from './clave-externa.guard';
import { MensajeExternoDto, NotificacionExternaDto } from './dto/notificacion-externa.dto';
import { NotificacionesExternasService } from './notificaciones-externas.service';

/**
 * Para que otros sistemas de la mutual (gestión, el panel de admin) les
 * manden notificaciones a los asociados. Se llama de servidor a servidor con
 * el header X-API-KEY; nunca desde el navegador, porque la clave quedaría a la
 * vista. Ver docs/notificaciones-externas.md.
 */
@Controller('notificaciones-externas')
@UseGuards(ClaveExternaGuard)
export class NotificacionesExternasController {
  constructor(private readonly servicio: NotificacionesExternasService) {}

  @Post('enviar')
  enviar(@AppQueLlama() app: AppExterna, @Body() dto: NotificacionExternaDto) {
    return this.servicio.enviarAUno(app, dto);
  }

  /** 202: el envío sigue en segundo plano. El resultado se consulta con el id. */
  @Post('enviar-todos')
  @HttpCode(HttpStatus.ACCEPTED)
  enviarATodos(@AppQueLlama() app: AppExterna, @Body() dto: MensajeExternoDto) {
    return this.servicio.enviarATodos(app, dto);
  }

  @Get('envios/:id')
  estado(@AppQueLlama() app: AppExterna, @Param('id', ParseUUIDPipe) id: string) {
    return this.servicio.estadoDeEnvio(app, id);
  }
}
