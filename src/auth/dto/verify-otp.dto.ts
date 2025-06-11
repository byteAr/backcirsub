// src/auth/dto/verify-otp.dto.ts
import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';

export class VerifyOtpDto {
  @IsString({ message: 'El número de teléfono debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El número de teléfono no puede estar vacío.' })
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Formato de número de teléfono inválido. Debe incluir el código de país (ej. +1234567890).' })
  phoneNumber: string;

  @IsString({ message: 'El OTP debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El OTP no puede estar vacío.' })
  @Length(4, 4, { message: 'El OTP debe tener exactamente 4 dígitos.' })
  @Matches(/^\d{4}$/, { message: 'El OTP debe ser de 4 dígitos numéricos.' })
  otp: string;
}