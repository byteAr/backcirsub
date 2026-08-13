import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { GetUser } from '../auth/decorators/get-user.decorator';
import { DescuentosService } from './descuentos.service';

@Controller('descuentos')
export class DescuentosController {

  constructor(private readonly descuentosService: DescuentosService) {}

  /**
   * Descuentos del socio autenticado.
   *
   * No recibe parámetros a propósito: el id y el DNI salen del token, así que
   * nadie puede pedir los descuentos de otro socio.
   */
  @Get()
  @UseGuards(AuthGuard())
  async getDescuentos(@GetUser() user: { id: number; dni: string }) {
    return this.descuentosService.getDescuentos(user.id, user.dni);
  }
}
