import { Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CredencialService } from './credencial.service';
import { UpdateCredencialDto } from './dto/update-credencial.dto';
import { EncuestaDto } from './dto/encuesta.dto';
import { AuthService } from 'src/auth/auth.service';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('credencial')
export class CredencialController {
  constructor(
    private readonly credencialService: CredencialService,    
    private readonly authService: AuthService,
  ) {}

  @Patch()
  updateCbu(@Body() data: UpdateCredencialDto) {
  // data.cbu puede ser string (22 dígitos) o null
  return this.credencialService.updateCbu(data.cbu ?? null, data.id);
  }

  /**
   * Calificación de la credencial. Antes no pedía sesión y tomaba el id del
   * cuerpo, así que cualquiera podía calificar a nombre de cualquier
   * asociado. Ahora exige token y el id sale de ahí.
   *
   * Ojo al desplegar: el ValidationPipe global rechaza campos de más
   * (forbidNonWhitelisted), así que un front viejo que todavía mande "id" en
   * el cuerpo recibe 400. Front y back de este cambio van juntos.
   */
  @Post('encuesta')
  @UseGuards(AuthGuard())
  postEncuesta(@Body() encuesta: EncuestaDto, @GetUser() user: { id: number }) {
    return this.authService.postEncuesta(user.id, encuesta.servicio, encuesta.atencion);
  }


  @Get()
    getCbu(@Query('id') id: string) {
     return this.credencialService.getCbu(Number(id));
  }
}
