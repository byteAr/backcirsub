// src/twilio/twilio.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import * as twilio from 'twilio'; // Importa la librería de Twilio

@Injectable()
export class TwilioService {
  private twilioClient: twilio.Twilio;
  private readonly logger = new Logger(TwilioService.name);
  private readonly twilioWhatsAppNumber: string;
  private readonly otpTemplateContentSid: string;
  private readonly credentiialActiveSid: string;

  constructor(private prismaService:PrismaService, private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.twilioWhatsAppNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER');
    this.otpTemplateContentSid = this.configService.get<string>('TWILIO_OTP_TEMPLATE_SID');
    this.credentiialActiveSid = this.configService.get<string>('TWILIO_NOTIFICATION_CREDENTIAL_ACTIVE');

    // 🔴 VALIDAMOS TAMBIÉN EL SID DE LA NOTIFICACIÓN
    if (
      !accountSid ||
      !authToken ||
      !this.twilioWhatsAppNumber ||
      !this.otpTemplateContentSid ||
      !this.credentiialActiveSid
    ) {
      this.logger.error(
        'Faltan credenciales de Twilio, número de WhatsApp o SIDs de templates en las variables de entorno.',
      );
      this.logger.error(`TWILIO_WHATSAPP_NUMBER=${this.twilioWhatsAppNumber}`);
      this.logger.error(`TWILIO_OTP_TEMPLATE_SID=${this.otpTemplateContentSid}`);
      this.logger.error(
        `TWILIO_NOTIFICATION_CREDENTIAL_ACTIVE=${this.credentiialActiveSid}`,
      );
      throw new Error(
        'Las credenciales de Twilio o los SIDs de templates no están configurados correctamente.',
      );
    }

    this.twilioClient = twilio(accountSid, authToken);
  }

  async sendWhatsAppMessage(to: string, otpCode: string): Promise<any> {
    try {
      const message = await this.twilioClient.messages.create({
        from: this.twilioWhatsAppNumber,
        to: `whatsapp:${to}`,
        contentSid: this.otpTemplateContentSid,
        contentVariables: JSON.stringify({
          1: otpCode,
        }),
      });

      this.logger.log(
        `Mensaje OTP enviado exitosamente usando plantilla. SID: ${message.sid}`,
      );
      return message;
    } catch (error) {
      this.logger.error(`Fallo al enviar mensaje OTP a ${to}: ${error.message}`);
      throw error;
    }
  }

  async sendNotificationCredentialActive(to: string): Promise<any> {
    try {
      this.logger.log(
        `Enviando notificación de credencial activa a ${to} con contentSid=${this.credentiialActiveSid}`,
      );

      const message = await this.twilioClient.messages.create({
        from: this.twilioWhatsAppNumber,
        to: `whatsapp:${to}`,
        contentSid: this.credentiialActiveSid, // 👈 acá DEBE venir el SID real
        // si tu template tiene variables, agregá contentVariables acá
        // contentVariables: JSON.stringify({ 1: 'algo' }),
      });

      this.logger.log(
        `Mensaje de credencial migrada enviado exitosamente. SID: ${message.sid}`,
      );
      await this.registrarLog(
          'USUARIOS',
          'INFO',
          'Creación de credencial',
          `Mensaje de notificación enviado por whatsapp exitosamente a ${to}`,
          null
        );
      return message;
    } catch (error) {
      this.logger.error(
        `Fallo al enviar notificación al usuario con número: ${to}: ${error.message}`,
      );
      await this.registrarLog(
          'USUARIOS',
          'ERROR',
          'Creación de credencial',
          `Mensaje de notificación no se pudo enviar a ${to}`,
          null
        );
      throw error;
    }
  }

  private async registrarLog(
    modulo: string,
    tipo: 'INFO' | 'WARN' | 'ERROR',
    accion: string,
    observacion: string,
    usuario?: string | null,
    ip?: string | null,
  ) {
    // Si no tenemos usuario o IP, dejamos que el SP los guarde como '' cuando recibe NULL
    const usuarioParam = usuario ?? null;
    const ipParam = ip ?? null;

    await this.prismaService.$executeRaw`
      EXEC dbo.sp_sis_log_in 
        @Modulo      = ${modulo},
        @Tipo        = ${tipo},
        @Accion      = ${accion},
        @Observacion = ${observacion},
        @Usuario     = ${usuarioParam},
        @Ip          = ${ipParam};
    `;
  }
}