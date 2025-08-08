import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { CredencialService } from './credencial.service';
import { UpdateCredencialDto } from './dto/update-credencial.dto';

@Controller('credencial')
export class CredencialController {
  constructor(private readonly credencialService: CredencialService) {}

  @Patch()
  updateCbu(@Body() data: UpdateCredencialDto) {
    return this.credencialService.updateCbu(data.cbu, data.id);
  }

  @Get()
    getCbu(@Query('id') id: string) {
     return this.credencialService.getCbu(Number(id));
}
}
