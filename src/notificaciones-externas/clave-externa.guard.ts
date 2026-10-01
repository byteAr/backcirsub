import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppExterna, appDeLaClave, leerClaves } from './claves-externas';

/**
 * Deja pasar sólo a las apps con una clave dada de alta en
 * NOTIF_EXTERNAS_CLAVES, y cuelga en el request cuál es.
 *
 * No se mira el Origin ni la IP: los dos se pueden falsificar desde un curl y
 * las llamadas vienen de servidor a servidor, donde CORS no aplica. Lo único
 * que prueba quién llama es la clave.
 */
@Injectable()
export class ClaveExternaGuard implements CanActivate {
  private readonly logger = new Logger(ClaveExternaGuard.name);
  private readonly claves;

  constructor(config: ConfigService) {
    this.claves = leerClaves(config.get<string>('NOTIF_EXTERNAS_CLAVES'), (m) => this.logger.warn(m));
    this.logger.log(`Apps externas habilitadas: ${this.claves.map((c) => c.id).join(', ') || 'ninguna'}`);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const clave = request.headers['x-api-key'];

    const app = typeof clave === 'string' && clave ? appDeLaClave(clave, this.claves) : null;
    if (!app) {
      // Nunca se loguea la clave recibida: si era una buena mal pegada, quedaría en los logs.
      this.logger.warn(`Clave externa rechazada desde ${request.ip} hacia ${request.method} ${request.url}`);
      throw new UnauthorizedException('Clave de API inválida');
    }

    request.appExterna = app;
    return true;
  }
}

/** La app que pasó por ClaveExternaGuard. */
export const AppQueLlama = createParamDecorator(
  (_: unknown, context: ExecutionContext): AppExterna => context.switchToHttp().getRequest().appExterna,
);
