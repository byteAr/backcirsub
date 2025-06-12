// src/auth/dto/send-otp.dto.ts
import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString({ message: 'El número de teléfono debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El número de teléfono no puede estar vacío.' })
  // Expresión regular para validar un número de teléfono con código de país (ej. +54911xxxxxxx)
  // AJUSTA esta regex según los formatos de números de teléfono que esperes.
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Formato de número de teléfono inválido. Debe incluir el código de país (ej. +1234567890).' })
  phoneNumber: string;
  @IsString()
  email:string;
}