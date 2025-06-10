// src/redis/redis.service.ts
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redisClient: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    const redisHost = this.configService.get<string>('REDIS_HOST') || 'localhost';
    const redisPort = this.configService.get<number>('REDIS_PORT') || 6379;
    const redisPassword = this.configService.get<string | undefined>('REDIS_PASSWORD');

    this.redisClient = new Redis({
      host: redisHost,
      port: redisPort,
      password: redisPassword,
    });

    this.redisClient.on('connect', () => {
      this.logger.log(`Connected to Redis at ${redisHost}:${redisPort}`);
    });

    this.redisClient.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });
  }

  // Método para guardar un valor con una expiración
  // key: la clave a almacenar (ej. 'otp:phoneNumber')
  // value: el valor a almacenar (ej. '1234')
  // ttl: Time To Live en segundos (ej. 1200 para 20 minutos)
  async set(key: string, value: string, ttl?: number): Promise<string | null> {
    if (ttl) {
      return this.redisClient.set(key, value, 'EX', ttl); // 'EX' para tiempo de expiración en segundos
    }
    return this.redisClient.set(key, value);
  }

  // Método para obtener un valor
  async get(key: string): Promise<string | null> {
    return this.redisClient.get(key);
  }

  // Método para eliminar una clave
  async del(key: string): Promise<number> {
    return this.redisClient.del(key);
  }

  // Asegura que la conexión a Redis se cierre al destruir el módulo
  async onModuleDestroy() {
    await this.redisClient.quit();
    this.logger.log('Redis client disconnected.');
  }
}