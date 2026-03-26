import { IsInt, IsOptional, Matches } from 'class-validator';
import { Transform, Type } from 'class-transformer';

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

  @Type(() => Number)
  @IsInt({ message: 'El ID debe ser un número' })
  id: number;
}
