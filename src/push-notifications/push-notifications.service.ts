import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { RedisService } from 'src/redis/redis.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

const TTL_90_DIAS = 90 * 24 * 60 * 60;

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);

  private vapidReady = false;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    const subject = this.configService.get<string>('VAPID_SUBJECT');
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');

    if (subject && publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.vapidReady = true;
    } else {
      this.logger.warn('VAPID keys no configuradas. Las push notifications están deshabilitadas.');
    }
  }

  getVapidPublicKey(): string {
    return this.configService.get<string>('VAPID_PUBLIC_KEY');
  }

  async saveSubscription(dto: SubscribePushDto): Promise<{ ok: boolean }> {
    const key = `push:sub:${dto.userId}`;
    await this.redisService.set(key, JSON.stringify(dto), TTL_90_DIAS);
    this.logger.log(`Subscription guardada para userId=${dto.userId}`);
    return { ok: true };
  }

  async sendPushToUser(
    userId: number,
    title: string,
    body: string,
    url = '/dashboard/credencial',
  ): Promise<{ ok: boolean; message: string }> {
    const key = `push:sub:${userId}`;
    const raw = await this.redisService.get(key);

    if (!raw) {
      this.logger.warn(`No hay subscription registrada para userId=${userId}`);
      return { ok: false, message: 'El usuario no tiene subscription registrada' };
    }

    const sub: SubscribePushDto = JSON.parse(raw);
    const payload = JSON.stringify({
      notification: {
        title,
        body,
        icon: '/assets/icons/icon-192x192.png',
        badge: '/assets/icons/icon-72x72.png',
        data: { url },
      },
    });

    if (!this.vapidReady) {
      this.logger.warn('Intento de enviar push sin VAPID configurado');
      return { ok: false, message: 'Push notifications no configuradas en el servidor' };
    }

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
      );
      this.logger.log(`Push enviada a userId=${userId}`);
      return { ok: true, message: 'Notificación enviada' };
    } catch (error: any) {
      if (error.statusCode === 410) {
        this.logger.warn(`Subscription expirada para userId=${userId}, eliminando`);
        await this.redisService.del(key);
        return { ok: false, message: 'Subscription expirada, se eliminó' };
      }
      this.logger.error(`Error enviando push a userId=${userId}: ${error.message}`);
      throw error;
    }
  }
}
