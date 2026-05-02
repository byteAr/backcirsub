import { IsInt, IsNotEmpty, IsPositive, IsString } from 'class-validator';

export class SendAdminNotifDto {
  @IsInt()
  @IsPositive()
  targetUserId: number;

  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @IsNotEmpty()
  cuerpo: string;
}
