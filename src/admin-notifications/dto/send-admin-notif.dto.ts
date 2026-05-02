import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class SendAdminNotifDto {
  @IsInt()
  targetUserId: number;

  @IsString()
  @IsNotEmpty()
  titulo: string;

  @IsString()
  @IsNotEmpty()
  cuerpo: string;
}
