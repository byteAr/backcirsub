import { IsOptional, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Actualización del CBU del asociado autenticado.
 *
 * No lleva id a propósito: sale del token. Antes venía en el cuerpo y el
 * endpoint no pedía sesión, así que cualquiera podía cambiar el CBU de
 * cualquier asociado y quedarse con sus reintegros. Un "id" en el cuerpo
 * ahora se rechaza con 400 (forbidNonWhitelisted del ValidationPipe global).
 */
export class UpdateCredencialDto {
  // trim, y si queda vacío => null
  @Transform(({ value }) => {
    if (value === undefined || value === null) return null;
    const v = String(value).trim();
    return v === '' ? null : v;
  })
  @IsOptional() // ignora validaciones si es null/undefined
  @Matches(/^(?!0{22})\d{22}$/, {
    message: 'El CBU debe tener exactamente 22 dígitos numéricos y no puede ser todo ceros',
  })
  cbu: string | null;
}
