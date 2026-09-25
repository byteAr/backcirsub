import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Envío a todos los asociados con la app. No lleva destinatario: el padrón lo
 * trae el sistema de gestión.
 *
 * Los largos están acotados porque el texto viaja en la notificación del
 * sistema operativo, que recorta sin avisar, y además va en la URL que abre la
 * app al tocarla.
 */
export class SendAllAdminNotifDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El título no puede estar vacío' })
  @MaxLength(80, { message: 'El título no puede superar los 80 caracteres' })
  titulo: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío' })
  @MaxLength(300, { message: 'El mensaje no puede superar los 300 caracteres' })
  cuerpo: string;
}
