import { PartialType } from '@nestjs/mapped-types';
import { CreateTramiteDto } from './create-tramite.dto';

export class UpdateTramiteDto extends PartialType(CreateTramiteDto) {}
