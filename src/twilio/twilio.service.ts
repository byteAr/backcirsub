// src/twilio/twilio.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as twilio from 'twilio'; // Importa la librería de Twilio

@Injectable()
export class TwilioService {
  private twilioClient: twilio.Twilio; // Cliente de Twilio
  private readonly logger = new Logger(TwilioService.name); // Para logs internos
  private readonly twilioWhatsAppNumber: string; // Número de WhatsApp de Twilio
  private readonly otpTemplateContentSid: string;

  constructor(private readonly configService: ConfigService) {
    // Obtenemos las credenciales de Twilio de las variables de entorno
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.twilioWhatsAppNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER');
    this.otpTemplateContentSid = this.configService.get<string>('TWILIO_OTP_TEMPLATE_SID')

    // Verificamos que las credenciales estén presentes
    if (!accountSid || !authToken || !this.twilioWhatsAppNumber || !this.otpTemplateContentSid) {
      this.logger.error('Faltan credenciales de Twilio o número de WhatsApp en las variables de entorno.');
      throw new Error('Las credenciales de Twilio o el número de WhatsApp no están configurados correctamente.');
    }
    // Inicializamos el cliente de Twilio
    this.twilioClient = twilio(accountSid, authToken);
  }

  
  async sendWhatsAppMessage(to: string, otpCode: string): Promise<any> {
    try {
      const message = await this.twilioClient.messages.create({
        from: this.twilioWhatsAppNumber, // Tu número de Twilio habilitado para WhatsApp
        to: `whatsapp:${to}`, // El número del destinatario DEBE tener el prefijo 'whatsapp:'
        contentSid: this.otpTemplateContentSid,
        contentVariables: JSON.stringify({ // Pasamos las variables como JSON
          1: otpCode, // La clave '1' corresponde al {{1}} en la plantilla de autenticación
        }), // El contenido del mensaje (debe coincidir con tu template)
      });
      this.logger.log(`Mensaje OTP enviado exitosamente usando plantilla. SID: ${message.sid}`);
      return message;
    } catch (error) {
      this.logger.error(`Fallo al enviar mensaje OTP a ${to}: ${error.message}`);
      throw error;
    }
  }
}