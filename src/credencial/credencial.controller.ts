import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { CredencialService } from './credencial.service';
import { UpdateCredencialDto } from './dto/update-credencial.dto';
import { AuthService } from 'src/auth/auth.service';

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

  @Post('encuesta')
  postEncuesta(@Body('id') id:number, @Body('servicio') servicio:number, @Body('atencion') atencion:number){          
    return this.authService.postEncuesta( id, servicio, atencion)
  }


  @Get()
    getCbu(@Query('id') id: string) {
     return this.credencialService.getCbu(Number(id));
  }
}
