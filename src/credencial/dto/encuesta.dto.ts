import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * Calificación de la credencial digital: dos puntajes de 1 a 5 estrellas.
 *
 * No lleva el id del asociado a propósito: sale del token, así nadie puede
 * calificar a nombre de otro.
 */
export class EncuestaDto {
  @Type(() => Number)
  @IsInt({ message: 'La calificación del servicio debe ser un número entero' })
  @Min(1, { message: 'La calificación del servicio va de 1 a 5' })
  @Max(5, { message: 'La calificación del servicio va de 1 a 5' })
  servicio: number;

  @Type(() => Number)
  @IsInt({ message: 'La calificación de la atención debe ser un número entero' })
  @Min(1, { message: 'La calificación de la atención va de 1 a 5' })
  @Max(5, { message: 'La calificación de la atención va de 1 a 5' })
  atencion: number;
}
