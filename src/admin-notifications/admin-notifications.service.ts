import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { SendAdminNotifDto } from './dto/send-admin-notif.dto';
import { SendAllAdminNotifDto } from './dto/send-all-admin-notif.dto';
import { DestinatariosGestionService } from './destinatarios-gestion.service';
import { AdminMessage } from './interfaces/admin-message.interface';
import * as crypto from 'crypto';

const SUPER_ADMIN_DNIS = ['34824092', '21677083'];

/** Cuántos envíos van en paralelo en un envío masivo. */
const TANDA = 25;

@Injectable()
export class AdminNotificationsService {
  private readonly logger = new Logger(AdminNotificationsService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly pushService: PushNotificationsService,
    private readonly destinatarios: DestinatariosGestionService,
  ) {}

  async getPermission(
    dni: string,
  ): Promise<{ role: 'superadmin' | 'sender' | null }> {
    if (SUPER_ADMIN_DNIS.includes(dni)) return { role: 'superadmin' };
    const perm = await this.redisService.get(`admin:perm:${dni}`);
    return { role: perm === '1' ? 'sender' : null };
  }

  async addPermission(
    targetDni: string,
    callerDni: string,
    nombre: string,
    apellido: string,
  ): Promise<{ ok: boolean }> {
    if (!SUPER_ADMIN_DNIS.includes(callerDni)) {
      throw new ForbiddenException(
        'Solo los super admins pueden agregar permisos',
      );
    }
    await this.redisService.set(`admin:perm:${targetDni}`, '1');
    await this.redisService.set(
      `admin:perm:info:${targetDni}`,
      JSON.stringify({ nombre, apellido }),
    );
    this.logger.log(`Permiso de envío otorgado a DNI ${targetDni} (${nombre} ${apellido}) por ${callerDni}`);
    return { ok: true };
  }

  async listPermissions(): Promise<
    { dni: string; nombre: string; apellido: string }[]
  > {
    const allKeys = await this.redisService.keys('admin:perm:*');
    // Filtramos solo las claves de permiso (excluimos las de info)
    const permKeys = allKeys.filter(
      (k) => !k.startsWith('admin:perm:info:'),
    );

    const results: { dni: string; nombre: string; apellido: string }[] = [];
    for (const key of permKeys) {
      const dni = key.replace('admin:perm:', '');
      const infoRaw = await this.redisService.get(`admin:perm:info:${dni}`);
      const info = infoRaw ? JSON.parse(infoRaw) : { nombre: '—', apellido: '' };
      results.push({ dni, nombre: info.nombre, apellido: info.apellido });
    }
    return results;
  }

  async removePermission(
    targetDni: string,
    callerDni: string,
  ): Promise<{ ok: boolean }> {
    if (!SUPER_ADMIN_DNIS.includes(callerDni)) {
      throw new ForbiddenException(
        'Solo los super admins pueden quitar permisos',
      );
    }
    await this.redisService.del(`admin:perm:${targetDni}`);
    await this.redisService.del(`admin:perm:info:${targetDni}`);
    this.logger.log(`Permiso de envío removido al DNI ${targetDni} por ${callerDni}`);
    return { ok: true };
  }

  async searchByDni(
    dni: string,
  ): Promise<{ id: number; nombre: string; apellido: string }> {
    const result = await this.prisma.$queryRaw<
      { Id: number; Nombre: string; Apellido: string }[]
    >`SELECT TOP 1 Id, Nombre, Apellido FROM Personas WHERE Documento = ${dni}`;

    if (!result || result.length === 0) {
      throw new NotFoundException(`No se encontró persona con DNI ${dni}`);
    }
    return {
      id: result[0].Id,
      nombre: result[0].Nombre,
      apellido: result[0].Apellido,
    };
  }

  async sendNotification(
    dto: SendAdminNotifDto,
    callerDni: string,
  ): Promise<{ ok: boolean; pushed: boolean }> {
    const { targetUserId, titulo, cuerpo } = dto;

    const { role } = await this.getPermission(callerDni);
    if (!role) throw new ForbiddenException('Sin permisos para enviar notificaciones');

    // Obtener nombre del remitente
    let senderName = 'Administrador';
    try {
      const sender = await this.searchByDni(callerDni);
      senderName = `${sender.nombre} ${sender.apellido}`;
    } catch {
      // Si no se encuentra, usamos el DNI como fallback
      senderName = `DNI ${callerDni}`;
    }

    const messagesKey = `admin:msgs:${targetUserId}`;
    const unreadKey = `admin:unread:${targetUserId}`;

    const existing = await this.redisService.get(messagesKey);
    const messages: AdminMessage[] = existing ? JSON.parse(existing) : [];
    const newMessage: AdminMessage = {
      id: crypto.randomUUID(),
      titulo,
      cuerpo,
      fecha: new Date().toISOString(),
      senderName,
    };
    messages.push(newMessage);
    await this.redisService.set(messagesKey, JSON.stringify(messages));

    const currentUnread = await this.redisService.get(unreadKey);
    const newUnread = currentUnread ? parseInt(currentUnread, 10) + 1 : 1;
    await this.redisService.set(unreadKey, newUnread.toString());
    this.logger.log(`Mensaje guardado para userId=${targetUserId} por ${senderName}`);

    const url = `/auth/login?notify=1&title=${encodeURIComponent(titulo)}&body=${encodeURIComponent(cuerpo)}`;
    try {
      const pushResult = await this.pushService.sendPushToUser(
        targetUserId,
        titulo,
        cuerpo,
        url,
      );
      return { ok: true, pushed: pushResult.ok };
    } catch {
      return { ok: true, pushed: false };
    }
  }

  async getMessages(
    userId: number,
  ): Promise<{ messages: AdminMessage[]; unread: number }> {
    const [rawMessages, rawUnread] = await Promise.all([
      this.redisService.get(`admin:msgs:${userId}`),
      this.redisService.get(`admin:unread:${userId}`),
    ]);

    const messages: AdminMessage[] = rawMessages ? JSON.parse(rawMessages) : [];
    const unread = rawUnread ? parseInt(rawUnread, 10) : 0;
    return { messages: [...messages].reverse(), unread };
  }

  async markRead(userId: number): Promise<{ ok: boolean }> {
    await this.redisService.set(`admin:unread:${userId}`, '0');
    return { ok: true };
  }

  /**
   * Cuánta gente recibiría un envío masivo. Sirve para que el panel muestre el
   * número antes de mandar nada: son asociados de verdad.
   *
   * `enGestion` es el padrón que devuelve el PHP —los que se registraron— y
   * `conApp` los que además tienen una suscripción push viva. La diferencia
   * entre los dos es gente que se registró pero no aceptó las notificaciones,
   * borró la app o dejó pasar los 90 días de la suscripción: a esos el mensaje
   * les queda guardado y lo ven al entrar.
   */
  async contarAudiencia(): Promise<{ enGestion: number; conApp: number }> {
    const ids = await this.destinatarios.obtenerIds();
    const suscriptos = await this.idsConSuscripcion();

    return {
      enGestion: ids.length,
      conApp: ids.filter((id) => suscriptos.has(id)).length,
    };
  }

  /**
   * Manda una notificación a todo el padrón de la app.
   *
   * Queda reservado a los super admins: un envío alcanza a cientos de
   * asociados reales y no se puede deshacer.
   *
   * A cada uno le queda el mensaje guardado, tenga o no suscripción push, así
   * que quien no reciba el aviso igual lo encuentra al entrar. Se manda de a
   * tandas para no abrir cientos de conexiones de una.
   */
  async sendNotificationToAll(
    dto: SendAllAdminNotifDto,
    callerDni: string,
  ): Promise<{
    ok: boolean;
    destinatarios: number;
    notificados: number;
    sinSuscripcion: number;
    fallidos: number;
  }> {
    if (!SUPER_ADMIN_DNIS.includes(callerDni)) {
      throw new ForbiddenException(
        'Solo los super admins pueden enviar a todos los asociados',
      );
    }

    const { titulo, cuerpo } = dto;
    const ids = await this.destinatarios.obtenerIds();

    if (ids.length === 0) {
      throw new ServiceUnavailableException(
        'No se pudo obtener el padrón de asociados del sistema de gestión',
      );
    }

    const senderName = await this.nombreDelRemitente(callerDni);
    const suscriptos = await this.idsConSuscripcion();
    const url = `/auth/login?notify=1&title=${encodeURIComponent(titulo)}&body=${encodeURIComponent(cuerpo)}`;

    let notificados = 0;
    let sinSuscripcion = 0;
    let fallidos = 0;

    for (let i = 0; i < ids.length; i += TANDA) {
      const tanda = ids.slice(i, i + TANDA);

      await Promise.all(
        tanda.map(async (userId) => {
          try {
            await this.guardarMensaje(userId, titulo, cuerpo, senderName);

            if (!suscriptos.has(userId)) {
              sinSuscripcion++;
              return;
            }

            const push = await this.pushService.sendPushToUser(userId, titulo, cuerpo, url);
            if (push.ok) notificados++;
            else fallidos++;
          } catch (error) {
            fallidos++;
            this.logger.warn(`Falló el envío masivo a userId=${userId}: ${error?.message ?? error}`);
          }
        }),
      );
    }

    this.logger.log(
      `Envío masivo de ${senderName}: ${ids.length} destinatarios, ` +
        `${notificados} notificados, ${sinSuscripcion} sin suscripción, ${fallidos} fallidos`,
    );

    return { ok: true, destinatarios: ids.length, notificados, sinSuscripcion, fallidos };
  }

  /** Los userId que tienen una suscripción push guardada en Redis. */
  private async idsConSuscripcion(): Promise<Set<number>> {
    const claves = await this.redisService.keys('push:sub:*');

    return new Set(
      claves
        .map((clave) => Number(clave.slice('push:sub:'.length)))
        .filter((id) => Number.isInteger(id) && id > 0),
    );
  }

  private async nombreDelRemitente(dni: string): Promise<string> {
    try {
      const remitente = await this.searchByDni(dni);
      return `${remitente.nombre} ${remitente.apellido}`;
    } catch {
      return `DNI ${dni}`;
    }
  }

  /** Deja el mensaje en la bandeja del asociado y le suma uno a los sin leer. */
  private async guardarMensaje(
    userId: number,
    titulo: string,
    cuerpo: string,
    senderName: string,
  ): Promise<void> {
    const messagesKey = `admin:msgs:${userId}`;
    const unreadKey = `admin:unread:${userId}`;

    const existing = await this.redisService.get(messagesKey);
    const messages: AdminMessage[] = existing ? JSON.parse(existing) : [];
    messages.push({
      id: crypto.randomUUID(),
      titulo,
      cuerpo,
      fecha: new Date().toISOString(),
      senderName,
    });
    await this.redisService.set(messagesKey, JSON.stringify(messages));

    const sinLeer = await this.redisService.get(unreadKey);
    await this.redisService.set(unreadKey, (sinLeer ? parseInt(sinLeer, 10) + 1 : 1).toString());
  }
}
