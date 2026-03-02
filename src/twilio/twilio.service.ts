// src/twilio/twilio.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import * as twilio from 'twilio'; // Importa la librería de Twilio

// Enum para los códigos de mensaje de reintegros por WhatsApp
export enum MensajeWhatsappCodigo {
  FARMACIA_TESORERIA = 1,
  FARMACIA_PAGO = 2,
  NACIMIENTO_TESORERIA = 3,
  NACIMIENTO_PAGO = 4,
  MATRIMONIO_TESORERIA = 5,
  MATRIMONIO_PAGO = 6,
  ESCOLARIDAD_TESORERIA = 7,
  ESCOLARIDAD_PAGO = 8,
}

// Interface para las variables genéricas de los mensajes
// Coinciden con lo que comentaste: apellido, nombre, fechas, importe, N° de orden de pago
export interface MensajeWhatsappVariables {
  nombre?: string;
  apellido?: string;
  fecha1?: string;
  fecha2?: string;
  fecha3?: string;
  importe?: string;
  ordenPago?: string;
}

// Configuración de cada plantilla: qué variables usa (y en qué orden) y cuál es su SID
interface PlantillaConfig {
  sid: string;
  variables: (keyof MensajeWhatsappVariables)[];
  descripcion: string;
}

@Injectable()
export class TwilioService {
  private twilioClient: twilio.Twilio;
  private readonly logger = new Logger(TwilioService.name);
  private readonly twilioWhatsAppNumber: string;
  private readonly otpTemplateContentSid: string;
  private readonly credentiialActiveSid: string;

  // Mapa de plantillas de reintegro - Los SIDs se obtienen de variables de entorno
  private readonly plantillasReintegro: Map<MensajeWhatsappCodigo, PlantillaConfig>;

  constructor(private prismaService:PrismaService, private readonly configService: ConfigService) {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    this.twilioWhatsAppNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER');
    this.otpTemplateContentSid = this.configService.get<string>('TWILIO_OTP_TEMPLATE_SID');
    this.credentiialActiveSid = this.configService.get<string>('TWILIO_NOTIFICATION_CREDENTIAL_ACTIVE');

    // Inicializar el mapa de plantillas de reintegro
    this.plantillasReintegro = new Map([
      // Reintegro de farmacia enviado a Tesorería
      // Sr. Afiliado, ... Orden de pago N° {{1}} ... ticket de farmacia con fecha {{2}}
      [MensajeWhatsappCodigo.FARMACIA_TESORERIA, {
        sid: this.configService.get<string>('TWILIO_FARMACIA_TESORERIA') || '',
        variables: ['ordenPago', 'fecha1'], // {{1}} = ordenPago, {{2}} = fecha ticket
        descripcion: 'Farmacia enviada a Tesorería'
      }],

      // Reintegro de farmacia pago
      // ... Orden de pago Nº {{1}} ... ticket de farmacia con fecha {{2}} ... transferencia con fecha: {{3}} ... importe de {{4}}
      [MensajeWhatsappCodigo.FARMACIA_PAGO, {
        sid: this.configService.get<string>('TWILIO_FARMACIA_PAGO') || '',
        variables: ['ordenPago', 'fecha1', 'fecha2', 'importe'], // 1=ordenPago,2=fecha ticket,3=fecha transferencia,4=importe
        descripcion: 'Farmacia pagada'
      }],

      // Reintegro por nacimiento enviado a Tesorería
      // ... Nacimiento de su hijo 👶{{1}} {{2}} ... Orden de pago Nº {{3}}
      [MensajeWhatsappCodigo.NACIMIENTO_TESORERIA, {
        sid: this.configService.get<string>('TWILIO_NACIMIENTO_TESORERIA') || '',
        variables: ['nombre', 'apellido', 'ordenPago'], // 1=nombre hijo,2=apellido hijo,3=ordenPago
        descripcion: 'Nacimiento enviado a Tesorería'
      }],

      // Reintegro por nacimiento pago
      // ... Nacimiento de su hijo 👶 {{1}} {{2}} ... Orden de reintegro Nº {{3}} ... importe de $ {{4}} ... fecha {{5}}
      [MensajeWhatsappCodigo.NACIMIENTO_PAGO, {
        sid: this.configService.get<string>('TWILIO_NACIMIENTO_PAGO') || '',
        variables: ['nombre', 'apellido', 'ordenPago', 'importe', 'fecha1'], // 1=nombre,2=apellido,3=ordenPago,4=importe,5=fecha
        descripcion: 'Nacimiento pagado'
      }],

      // Reintegro por matrimonio enviado a Tesorería
      // ... Enlace Matrimonial 👰🤵 ... Orden de pago Nº {{1}}
      [MensajeWhatsappCodigo.MATRIMONIO_TESORERIA, {
        sid: this.configService.get<string>('TWILIO_MATRIMONIO_TESORERIA') || '',
        variables: ['ordenPago'], // 1=ordenPago
        descripcion: 'Matrimonio enviado a Tesorería'
      }],

      // Reintegro por matrimonio pago
      // ... Enlace Matrimonial 🤵👰 ... Orden de reintegro Nº {{1}}, en la fecha {{2}} ... importe de ${{3}}
      [MensajeWhatsappCodigo.MATRIMONIO_PAGO, {
        sid: this.configService.get<string>('TWILIO_MATRIMONIO_PAGO') || '',
        variables: ['ordenPago', 'fecha1', 'importe'], // 1=ordenPago,2=fecha,3=importe
        descripcion: 'Matrimonio pagado'
      }],

      // Ayuda económica escolar a Tesorería
      // ... Ayuda Económica Escolar de su hijo {{1}} {{2}} ...
      [MensajeWhatsappCodigo.ESCOLARIDAD_TESORERIA, {
        sid: this.configService.get<string>('TWILIO_ESCOLARIDAD_TESORERIA') || '',
        variables: ['nombre', 'apellido'], // 1=nombre hijo,2=apellido hijo
        descripcion: 'Ayuda escolar enviada a Tesorería'
      }],

      // Ayuda económica escolar pago
      // ... Ayuda Económica Escolar de su hijo {{1}} {{2}} ... transferencia de $ {{3}}
      [MensajeWhatsappCodigo.ESCOLARIDAD_PAGO, {
        sid: this.configService.get<string>('TWILIO_ESCOLARIDAD_PAGO') || '',
        variables: ['nombre', 'apellido', 'importe'], // 1=nombre,2=apellido,3=importe
        descripcion: 'Ayuda escolar pagada'
      }],
    ]);

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

  /**
   * Envía un mensaje de WhatsApp relacionado con reintegros usando plantillas preaprobadas
   * @param variables - Objeto con las variables a reemplazar en el mensaje
   * @param codigoMensaje - Código del tipo de mensaje (1-8)
   * @param numeroTelefono - Número de teléfono destino (sin el prefijo whatsapp:)
   */
  async sendMensajeReintegro(
    variables: MensajeWhatsappVariables,
    codigoMensaje: MensajeWhatsappCodigo,
    numeroTelefono: string
  ): Promise<any> {
    const plantilla = this.plantillasReintegro.get(codigoMensaje);

    if (!plantilla) {
      this.logger.error(`Código de mensaje inválido: ${codigoMensaje}`);
      throw new BadRequestException(`Código de mensaje inválido: ${codigoMensaje}`);
    }

    if (!plantilla.sid) {
      this.logger.error(`No hay SID configurado para el mensaje: ${plantilla.descripcion}`);
      throw new BadRequestException(`Plantilla no configurada para: ${plantilla.descripcion}`);
    }

    // Validar que se proporcionen las variables requeridas
    const variablesFaltantes = plantilla.variables.filter(v => !variables[v]);
    if (variablesFaltantes.length > 0) {
      this.logger.error(`Variables faltantes para ${plantilla.descripcion}: ${variablesFaltantes.join(', ')}`);
      throw new BadRequestException(`Variables faltantes: ${variablesFaltantes.join(', ')}`);
    }

    // Construir el objeto contentVariables con índices numéricos (1, 2, 3, ...)
    const contentVariables: Record<string, string> = {};
    plantilla.variables.forEach((variableName, index) => {
      contentVariables[(index + 1).toString()] = variables[variableName] || '';
    });

    try {
      this.logger.log(`Enviando mensaje de reintegro (${plantilla.descripcion}) a ${numeroTelefono}`);
      this.logger.log(`Variables: ${JSON.stringify(contentVariables)}`);

      const message = await this.twilioClient.messages.create({
        from: this.twilioWhatsAppNumber,
        to: `whatsapp:${numeroTelefono}`,
        contentSid: plantilla.sid,
        contentVariables: JSON.stringify(contentVariables),
      });

      this.logger.log(`Mensaje de reintegro enviado exitosamente. SID: ${message.sid}`);

      await this.registrarLog(
        'REINTEGROS',
        'INFO',
        plantilla.descripcion,
        `Mensaje enviado a ${numeroTelefono} - Variables: ${JSON.stringify(variables)}`,
        null
      );

      return { 
        ok: true, 
        messageSid: message.sid, 
        descripcion: plantilla.descripcion 
      };
    } catch (error) {
      this.logger.error(`Fallo al enviar mensaje de reintegro a ${numeroTelefono}: ${error.message}`);

      await this.registrarLog(
        'REINTEGROS',
        'ERROR',
        plantilla.descripcion,
        `Error enviando mensaje a ${numeroTelefono}: ${error.message}`,
        null
      );

      throw error;
    }
  }

  /**
   * Obtiene la lista de plantillas disponibles con sus códigos y variables requeridas
   */
  getPlantillasDisponibles(): { codigo: number; descripcion: string; variablesRequeridas: string[] }[] {
    const plantillas: { codigo: number; descripcion: string; variablesRequeridas: string[] }[] = [];

    this.plantillasReintegro.forEach((config, codigo) => {
      plantillas.push({
        codigo,
        descripcion: config.descripcion,
        variablesRequeridas: config.variables,
      });
    });

    return plantillas;
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