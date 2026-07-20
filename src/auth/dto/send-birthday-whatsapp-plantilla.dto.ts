// src/auth/dto/send-birthday-whatsapp-plantilla.dto.ts
import { IsString, IsNotEmpty, Matches, IsIn } from 'class-validator';

export class SendBirthdayWhatsappPlantillaDto {
  @IsString({ message: 'El número de teléfono debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El número de teléfono no puede estar vacío.' })
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'Formato de número de teléfono inválido. Debe incluir el código de país (ej. +1234567890).' })
  phoneNumber: string;

  @IsString({ message: 'El nombre debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El nombre no puede estar vacío.' })
  nombre: string;

  @IsString({ message: 'El apellido debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El apellido no puede estar vacío.' })
  apellido: string;

  @IsString({ message: 'La plantilla debe ser una cadena de texto.' })
  @IsIn(['blanco', 'verde'], { message: 'La plantilla debe ser "blanco" o "verde".' })
  plantilla: 'blanco' | 'verde';
}
