import { Injectable } from '@nestjs/common';
import { CreateTramiteDto } from './dto/create-tramite.dto';
import { UpdateTramiteDto } from './dto/update-tramite.dto';

@Injectable()
export class TramitesService {
  create(createTramiteDto: CreateTramiteDto) {
    return createTramiteDto;
  }

  findAll() {
    return `Esta acción retorna todos los trámites`;
  }

  findOne(id: number) {
    return `This action returns a #${id} tramite`;
  }

  update(id: string, updateTramiteDto: UpdateTramiteDto) {
    return `This action updates a #${id} tramite`;
  }

  remove(id: number) {
    return `This action removes a #${id} tramite`;
  }
}
