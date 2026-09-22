import { Body, Controller, Get, Ip, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AuthService } from 'src/auth/auth.service';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CredencialService } from './credencial.service';
import { EncuestaDto } from './dto/encuesta.dto';
import { UpdateCredencialDto } from './dto/update-credencial.dto';

/**
 * Todo el controlador exige sesión, y en todos los endpoints el asociado sale
 * del token, nunca del pedido.
 *
 * Antes ninguno pedía sesión y los tres tomaban el id del cuerpo o de la URL:
 * cualquiera podía ver el CBU de cualquier asociado, cambiárselo por otro —y
 * quedarse con sus reintegros— o calificar a su nombre. El guard va en la
 * clase y no en cada método para que un endpoint nuevo nazca protegido.
 *
 * Ojo al desplegar: el ValidationPipe global rechaza campos de más
 * (forbidNonWhitelisted), así que un front que todavía mande "id" en el
 * cuerpo recibe 400, y uno que no mande el token recibe 401. Front y back de
 * este cambio van juntos.
 */
@Controller('credencial')
@UseGuards(AuthGuard())
export class CredencialController {
  constructor(
    private readonly credencialService: CredencialService,
    private readonly authService: AuthService,
  ) {}

  /** CBU del asociado autenticado. */
  @Get()
  getCbu(@GetUser() user: { id: number }) {
    return this.credencialService.getCbu(user.id);
  }

  /**
   * Cambia el CBU del asociado autenticado. data.cbu puede ser un CBU de 22
   * dígitos o null. Se registra quién y desde qué IP, porque es el dato al
   * que se transfieren los reintegros.
   */
  @Patch()
  updateCbu(
    @Body() data: UpdateCredencialDto,
    @GetUser() user: { id: number },
    @Ip() ip: string,
  ) {
    return this.credencialService.updateCbu(data.cbu ?? null, user.id, `PersonasId:${user.id}`, ip);
  }

  /** Calificación de la credencial, de 1 a 5 estrellas en dos preguntas. */
  @Post('encuesta')
  postEncuesta(@Body() encuesta: EncuestaDto, @GetUser() user: { id: number }) {
    return this.authService.postEncuesta(user.id, encuesta.servicio, encuesta.atencion);
  }
}
