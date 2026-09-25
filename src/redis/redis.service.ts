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

  // Método para obtener claves que coincidan con un patrón
  async keys(pattern: string): Promise<string[]> {
    return this.redisClient.keys(pattern);
  }

  /** Suma uno a un contador. Si la clave no existía, arranca de cero. */
  async incr(key: string): Promise<number> {
    return this.redisClient.incr(key);
  }

  /** Lee varios valores de una. Las claves que no existen vuelven como null. */
  async mget(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    return this.redisClient.mget(...keys);
  }

  /**
   * Agrega elementos a un HyperLogLog: una estructura que cuenta cuántos
   * elementos distintos vio sin guardar la lista. Sirve para contar personas
   * únicas sin almacenar quién fue.
   */
  async pfadd(key: string, ...elementos: string[]): Promise<number> {
    return this.redisClient.pfadd(key, ...elementos);
  }

  /** Cuántos distintos hay. Con varias claves, cuenta la unión sin repetir. */
  async pfcount(...keys: string[]): Promise<number> {
    if (keys.length === 0) return 0;
    return this.redisClient.pfcount(...keys);
  }

  /**
   * Guarda el valor sólo si la clave no existe. Devuelve true si la creó.
   * Es la forma atómica de decir "esto es lo primero que pasa".
   */
  async setSiNoExiste(key: string, value: string, ttl: number): Promise<boolean> {
    const resultado = await this.redisClient.set(key, value, 'EX', ttl, 'NX');
    return resultado === 'OK';
  }

  /** Renueva el vencimiento de una clave que ya existe. */
  async expire(key: string, ttl: number): Promise<number> {
    return this.redisClient.expire(key, ttl);
  }

  /** Agrega o actualiza un miembro en un conjunto ordenado, con su puntaje. */
  async zadd(key: string, puntaje: number, miembro: string): Promise<number> {
    return this.redisClient.zadd(key, puntaje, miembro);
  }

  /** Borra los miembros con puntaje entre min y max. */
  async zremrangebyscore(key: string, min: number, max: number): Promise<number> {
    return this.redisClient.zremrangebyscore(key, min, max);
  }

  /** Cuántos miembros tiene un conjunto ordenado. */
  async zcard(key: string): Promise<number> {
    return this.redisClient.zcard(key);
  }

  // Asegura que la conexión a Redis se cierre al destruir el módulo
  async onModuleDestroy() {
    await this.redisClient.quit();
    this.logger.log('Redis client disconnected.');
  }
}