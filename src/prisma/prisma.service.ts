import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected');
    } catch (error) {
      this.logger.error('Failed to connect to the database', error);
      // Puedes seguir sin conexión, e intentar luego en cada request
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async ensureConnection() {
    try {
      await this.$executeRaw`SELECT 1`; // Simple consulta de prueba
    } catch (error) {
      this.logger.warn('Lost DB connection, trying to reconnect...');
      try {
        await this.$connect();
        this.logger.log('Reconnected to DB');
      } catch (reconnectError) {
        this.logger.error('Reconnection failed', reconnectError);
        throw reconnectError;
      }
    }
  }
}

