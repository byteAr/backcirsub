import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { SendAdminNotifDto } from './dto/send-admin-notif.dto';
import { AdminMessage } from './interfaces/admin-message.interface';
import * as crypto from 'crypto';

const SUPER_ADMIN_DNIS = ['34824092', '21677083'];

@Injectable()
export class AdminNotificationsService {
  private readonly logger = new Logger(AdminNotificationsService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
    private readonly pushService: PushNotificationsService,
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
  ): Promise<{ ok: boolean }> {
    if (!SUPER_ADMIN_DNIS.includes(callerDni)) {
      throw new ForbiddenException(
        'Solo los super admins pueden agregar permisos',
      );
    }
    await this.redisService.set(`admin:perm:${targetDni}`, '1');
    this.logger.log(`Permiso de envío otorgado a DNI ${targetDni} por ${callerDni}`);
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

    const messagesKey = `admin:msgs:${targetUserId}`;
    const unreadKey = `admin:unread:${targetUserId}`;

    const existing = await this.redisService.get(messagesKey);
    const messages: AdminMessage[] = existing ? JSON.parse(existing) : [];
    const newMessage: AdminMessage = {
      id: crypto.randomUUID(),
      titulo,
      cuerpo,
      fecha: new Date().toISOString(),
    };
    messages.push(newMessage);
    await this.redisService.set(messagesKey, JSON.stringify(messages));

    const currentUnread = await this.redisService.get(unreadKey);
    const newUnread = currentUnread ? parseInt(currentUnread, 10) + 1 : 1;
    await this.redisService.set(unreadKey, newUnread.toString());
    this.logger.log(`Mensaje guardado para userId=${targetUserId}`);

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
}
