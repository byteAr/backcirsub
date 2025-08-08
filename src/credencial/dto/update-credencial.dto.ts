import { IsString, Length, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateCredencialDto {
  @IsString()
  @Length(22, 22, { message: 'El CBU debe tener exactamente 22 dígitos' })
  cbu: string;

  @Type(() => Number)
  @IsInt({ message: 'El ID debe ser un número' })
  id: number;
}