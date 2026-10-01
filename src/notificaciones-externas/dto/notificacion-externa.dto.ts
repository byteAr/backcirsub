import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * Mismos límites que el envío masivo del panel: el texto viaja en la
 * notificación del sistema operativo, que recorta sin avisar, y en la URL que
 * abre la app al tocarla.
 */
export class MensajeExternoDto {
  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'El título no puede estar vacío' })
  @MaxLength(80, { message: 'El título no puede superar los 80 caracteres' })
  titulo: string;

  @Transform(recortar)
  @IsString()
  @IsNotEmpty({ message: 'El mensaje no puede estar vacío' })
  @MaxLength(300, { message: 'El mensaje no puede superar los 300 caracteres' })
  cuerpo: string;
}

export class NotificacionExternaDto extends MensajeExternoDto {
  /** Se aceptan con o sin puntos ("30.111.222"); se guardan sólo los dígitos. */
  @Transform(({ value }) => (typeof value === 'string' || typeof value === 'number' ? String(value).replace(/\D/g, '') : value))
  @IsString()
  @Matches(/^\d{7,8}$/, { message: 'El DNI tiene que tener 7 u 8 dígitos' })
  dni: string;
}
