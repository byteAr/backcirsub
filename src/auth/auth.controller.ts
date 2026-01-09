import { Response } from 'express';
import { Controller, Get, Post, Body, Patch, Param, Delete, InternalServerErrorException, NotFoundException, HttpStatus,  HttpCode, UseInterceptors, UploadedFile, BadRequestException, UseGuards, Req, Res, } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { AuthService } from './auth.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

import { TwilioService } from '../twilio/twilio.service'; // Importa el servicio de Twilio
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { passwordUser } from './dto/password-user.dto';
import { AuthGuard } from '@nestjs/passport';
import { GetUser } from './decorators/get-user.decorator';
import { LoginUser } from './interfaces/loginUser.iterface';
import { User } from './interfaces/getUser.interface';
import { SendNotificationCreateCredential } from './dto/send-notification-create-credential.dto';




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


  @Get('check-status')
  @UseGuards( AuthGuard() )
  checkAuthStatus(
    // @Req() request: Express.Request
    @GetUser() user: any
  ) {
    
    // console.log({ user : request.user});
    return this.authService.checkAuthStatus(user)
  }

  

  @Post('register')
  createUser(@Body() createUserDto:CreateUserDto){    
    return this.authService.register( createUserDto)
  }

  @Post('addpersona')
  createPersona(@Body('dni') dni: string){
    return this.authService.createPersona( dni)
  }

  /* otp */
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    
  
    const { phoneNumber } = sendOtpDto;
  

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
  @Post('send-notification')
  @HttpCode(HttpStatus.OK)
  async sendNotification(@Body() sendNotification: SendNotificationCreateCredential) {    
  
    const { phoneNumber } = sendNotification;
    const otp = this.authService.generateOtp();
  

  // ¡NUEVA FORMA DE LLAMAR A TwilioService!
  try {
    await this.twilioService.sendWhatsAppMessage(phoneNumber, otp);
    await this.twilioService.sendNotificationCredentialActive(phoneNumber); // Pasamos directamente el OTP
    return { message: 'Notificación de credencial migrada enviada exitosamente con OTP.' };
  } catch (error) {
    console.error('Error al enviar notificación de acredencial creada:', error);
    throw new InternalServerErrorException('No se pudo enviar la notificación. Por favor, inténtalo de nuevo.');
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
      return { 
        ok: true,
        message: 'OTP verificada exitosamente.' };
    } else {
      // Si la OTP no es válida (no coincide, o ha expirado, o no existe)
      // Lanzamos una excepción 404 Not Found para indicar que la OTP no es "encontrada"
      // en el contexto de ser válida y activa para ese usuario.
      throw new NotFoundException('OTP inválida o expirada.');
      // Alternativamente, podrías usar new BadRequestException('OTP inválida.'); si prefieres 400.
    }
  }

  @Post('resetPassword')
  resetPassword(@Body() passwordUser: passwordUser){
    const {id, password} = passwordUser;    
    return this.authService.resetPass( id, password)
  }

  @Post('prueba')
  prueba(@Body('Documento') Documento:string){   
    
    return this.authService.prueba( Documento)
  }

  @Post('get-contact')
  getContact(@Body('id') id:number){    
    return this.authService.getContactUser( id)
  }

  @Post('verify-dni')
  verifyDni(@Body('dni') dni:string, @Body('telefono') telefono:string){  
         
    return this.authService.obtenerPersonaPorDni( dni, telefono)
  }

  @Post('verify-repass')
  verifyDniRecoveryPass(@Body('dni') dni:string, @Body('telefono') telefono:string){  
         
    return this.authService.obtenerPersonaPorDniRecoveryPass( dni, telefono)
  }

  @Post('upload-profileimage')
  @UseInterceptors(FileInterceptor('profilePicture'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string
  ) {
    console.log('este es el id de usuario',userId);
    
    const parsedId = parseInt(userId);
  if (isNaN(parsedId)) {
    throw new BadRequestException('userId inválido');
  }

    return this.authService.saveImage(file, parsedId);
  }



  @Post('update-profileimage')
  @UseInterceptors(FileInterceptor('profilePicture'))
  async updateFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('userId') userId: string
  ) {
    const parsedId = parseInt(userId);
    
  if (isNaN(parsedId)) {
    throw new BadRequestException('userId inválido');
  }

    return this.authService.updateImage(file, parsedId);
  }

  

  @Get('private')
  @UseGuards( AuthGuard() )
  testingPrivateRoute(
    // @Req() request: Express.Request
    @GetUser() user: any
  ) {

    // console.log({ user : request.user});
    return {
      ok: true,
      message: 'esta es una ruta privada',
      user
    }
  }

  @Get('profile-image/:id')
  async getProfileImage(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.authService.getProfileImage(Number(id));

    res.setHeader('Content-Type', 'image/jpeg'); // o 'image/png'
    res.setHeader('Content-Disposition', 'inline');

    return res.end(buffer); // o res.send(buffer);
  }

  

}
