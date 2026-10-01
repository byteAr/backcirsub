import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { RedisService } from '../redis/redis.service';
import { Alcance, AppExterna } from './claves-externas';
import { MensajeExternoDto, NotificacionExternaDto } from './dto/notificacion-externa.dto';

/** Envíos individuales por minuto y por app. Frena un bucle que se dispara solo. */
export const LIMITE_POR_MINUTO = 120;

/** Cuánto se recuerda un envío masivo para rechazar el mismo texto repetido. */
const VENTANA_DUPLICADO_S = 10 * 60;

/** Si un envío masivo se cuelga, el candado se suelta solo pasado este tiempo. */
const CANDADO_S = 60 * 60;

/** Cuánto se guarda el resultado de un envío masivo para consultarlo. */
const RESULTADO_S = 7 * 24 * 60 * 60;

const CLAVE_CANDADO = 'notif-ext:todos:en-curso';

export interface EstadoEnvioMasivo {
  id: string;
  app: string;
  estado: 'en-curso' | 'terminado' | 'error';
  iniciado: string;
  terminado?: string;
  destinatarios?: number;
  notificados?: number;
  sinSuscripcion?: number;
  fallidos?: number;
  error?: string;
}

@Injectable()
export class NotificacionesExternasService {
  private readonly logger = new Logger(NotificacionesExternasService.name);

  constructor(
    private readonly notificaciones: AdminNotificationsService,
    private readonly redis: RedisService,
  ) {}

  /** A un asociado puntual, por DNI. */
  async enviarAUno(app: AppExterna, dto: NotificacionExternaDto): Promise<{ ok: boolean; pushed: boolean }> {
    this.exigir(app, 'uno');
    await this.contarEnvio(app);

    // Tira 404 si el DNI no es de un asociado.
    const { id } = await this.notificaciones.searchByDni(dto.dni);

    const resultado = await this.notificaciones.enviarAUno(id, dto.titulo, dto.cuerpo, app.nombre);
    this.logger.log(`[${app.id}] notificación a DNI ${dto.dni} (userId=${id}), push=${resultado.pushed}`);
    return resultado;
  }

  /**
   * A todo el padrón. Contesta enseguida con un id y el envío sigue en segundo
   * plano: con cientos de asociados tarda más que el corte de 100 s de
   * Cloudflare, y la app que llama se quedaría sin saber si salió.
   *
   * Dos frenos, porque no se puede deshacer:
   * - un solo envío masivo a la vez, venga de la app que venga;
   * - el mismo título y texto de la misma app se rechaza por 10 minutos, así un
   *   reintento automático no le manda el mensaje dos veces a todos.
   */
  async enviarATodos(app: AppExterna, dto: MensajeExternoDto): Promise<EstadoEnvioMasivo> {
    this.exigir(app, 'todos');

    const id = randomUUID();
    if (!(await this.redis.setSiNoExiste(CLAVE_CANDADO, id, CANDADO_S))) {
      throw new ConflictException('Ya hay un envío a todos en curso. Esperá a que termine.');
    }

    const huella = createHash('sha256').update(`${dto.titulo}\n${dto.cuerpo}`).digest('hex');
    if (!(await this.redis.setSiNoExiste(`notif-ext:dup:${app.id}:${huella}`, id, VENTANA_DUPLICADO_S))) {
      await this.soltarCandado(id);
      throw new ConflictException('Ese mismo mensaje ya se mandó a todos hace menos de 10 minutos.');
    }

    const estado: EstadoEnvioMasivo = {
      id,
      app: app.id,
      estado: 'en-curso',
      iniciado: new Date().toISOString(),
    };
    await this.guardarEstado(estado);
    this.logger.log(`[${app.id}] envío a todos ${id} iniciado: "${dto.titulo}"`);

    void this.correrEnvioMasivo(app, dto, estado);
    return estado;
  }

  /** Cada app ve sólo sus propios envíos. */
  async estadoDeEnvio(app: AppExterna, id: string): Promise<EstadoEnvioMasivo> {
    const crudo = await this.redis.get(`notif-ext:envio:${id}`);
    const estado: EstadoEnvioMasivo | null = crudo ? JSON.parse(crudo) : null;

    if (!estado || estado.app !== app.id) throw new NotFoundException('No existe ese envío');
    return estado;
  }

  private async correrEnvioMasivo(app: AppExterna, dto: MensajeExternoDto, estado: EstadoEnvioMasivo) {
    try {
      const resultado = await this.notificaciones.enviarATodos(dto.titulo, dto.cuerpo, app.nombre);
      await this.guardarEstado({
        ...estado,
        estado: 'terminado',
        terminado: new Date().toISOString(),
        destinatarios: resultado.destinatarios,
        notificados: resultado.notificados,
        sinSuscripcion: resultado.sinSuscripcion,
        fallidos: resultado.fallidos,
      });
      this.logger.log(`[${app.id}] envío a todos ${estado.id} terminado`);
    } catch (error) {
      await this.guardarEstado({
        ...estado,
        estado: 'error',
        terminado: new Date().toISOString(),
        error: error?.message ?? String(error),
      });
      this.logger.error(`[${app.id}] envío a todos ${estado.id} falló: ${error?.message ?? error}`);
    } finally {
      await this.soltarCandado(estado.id);
    }
  }

  private exigir(app: AppExterna, alcance: Alcance) {
    if (!app.alcances.includes(alcance)) {
      throw new ForbiddenException(
        alcance === 'todos'
          ? 'Esta clave no está habilitada para enviar a todos los asociados'
          : 'Esta clave no está habilitada para enviar a un asociado',
      );
    }
  }

  private async contarEnvio(app: AppExterna) {
    const clave = `notif-ext:ritmo:${app.id}:${Math.floor(Date.now() / 60_000)}`;
    const enEsteMinuto = await this.redis.incr(clave);
    if (enEsteMinuto === 1) await this.redis.expire(clave, 120);

    if (enEsteMinuto > LIMITE_POR_MINUTO) {
      throw new HttpException(
        `Más de ${LIMITE_POR_MINUTO} envíos por minuto. Reintentá en un rato.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private guardarEstado(estado: EstadoEnvioMasivo) {
    return this.redis.set(`notif-ext:envio:${estado.id}`, JSON.stringify(estado), RESULTADO_S);
  }

  /** Sólo lo suelta quien lo tomó, por si venció y ya lo tomó otro envío. */
  private async soltarCandado(id: string) {
    if ((await this.redis.get(CLAVE_CANDADO)) === id) await this.redis.del(CLAVE_CANDADO);
  }
}
