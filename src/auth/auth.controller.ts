import { Controller, Get, Post, Body, Patch, Param, Delete, InternalServerErrorException, NotFoundException, HttpStatus,  HttpCode } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

import { TwilioService } from '../twilio/twilio.service'; // Importa el servicio de Twilio
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';



@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twilioService: TwilioService,
  ) {}

  @Post('login')
  create(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }

  @Post('register')
  createUser(@Body('dni') dni: string){    
    return this.authService.register( dni)
  }

  @Post('addpersona')
  createPersona(@Body('dni') dni: string){
    return this.authService.createPersona( dni)
  }

  /* otp */
  @Post('send-otp')
@HttpCode(HttpStatus.OK)
async sendOtp(@Body() sendOtpDto: SendOtpDto) {
  console.log('llego hasta acá en el backend');
  
  const { phoneNumber, email } = sendOtpDto;
  console.log(`este es el mail:`, email);
  

  const otp = this.authService.generateOtp();
  await this.authService.saveOtp(phoneNumber, otp);

  // ¡NUEVA FORMA DE LLAMAR A TwilioService!
  try {
    await this.twilioService.sendWhatsAppMessage(phoneNumber, otp); // Pasamos directamente el OTP
    return { message: 'OTP enviada exitosamente.' };
  } catch (error) {
    console.error('Error al enviar OTP por WhatsApp:', error);
    throw new InternalServerErrorException('No se pudo enviar la OTP. Por favor, inténtalo de nuevo.');
  }
}

  @Post('verify-otp') // Ruta para verificar OTP, ej. POST /auth/verify-otp
  @HttpCode(HttpStatus.OK) // Devolvemos 200 OK si la OTP es válida
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    const { phoneNumber, otp } = verifyOtpDto;

    // 1. Verificar la OTP utilizando el servicio de autenticación
    const isValid = await this.authService.verifyOtp(phoneNumber, otp);

    if (isValid) {
      // Si la OTP es válida, respondemos con éxito
      return { message: 'OTP verificada exitosamente.' };
    } else {
      // Si la OTP no es válida (no coincide, o ha expirado, o no existe)
      // Lanzamos una excepción 404 Not Found para indicar que la OTP no es "encontrada"
      // en el contexto de ser válida y activa para ese usuario.
      throw new NotFoundException('OTP inválida o expirada.');
      // Alternativamente, podrías usar new BadRequestException('OTP inválida.'); si prefieres 400.
    }
  }

}
