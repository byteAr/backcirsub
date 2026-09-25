import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

import { PLATAFORMAS, Plataforma } from '../estadisticas.service';

/** Lo que manda la app cada vez que el asociado abre una pantalla. */
export class RegistrarActividadDto {
  @IsIn(PLATAFORMAS, { message: 'La plataforma tiene que ser pwa o web' })
  plataforma: Plataforma;
}

export class ConsultaDiaDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha va como AAAA-MM-DD' })
  fecha: string;

  @IsOptional()
  @IsIn(PLATAFORMAS, { message: 'La plataforma tiene que ser pwa o web' })
  plataforma?: Plataforma;
}

export class ConsultaTendenciaDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha va como AAAA-MM-DD' })
  hasta: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(90)
  dias?: number;

  @IsOptional()
  @IsIn(PLATAFORMAS, { message: 'La plataforma tiene que ser pwa o web' })
  plataforma?: Plataforma;
}

export class DniDto {
  @Matches(/^\d{6,9}$/, { message: 'El DNI tiene que ser sólo números' })
  dni: string;
}
