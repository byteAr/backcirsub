import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';

export type Plataforma = 'pwa' | 'web';
export const PLATAFORMAS: Plataforma[] = ['pwa', 'web'];

/**
 * Una sesión se cierra tras 30 minutos sin actividad. Es el criterio que usa
 * la industria (Google Analytics, entre otros): si el asociado vuelve a la
 * hora, es otra sesión; si navega varias pantallas seguidas, es una.
 */
const DURACION_SESION = 30 * 60;

/**
 * "Usando la app ahora" es haber hecho algo en los últimos 5 minutos. Es la
 * ventana que usan los paneles en vivo: más corta y cuenta a quien está
 * leyendo una pantalla sin tocar nada; más larga y deja de ser "ahora".
 */
export const VENTANA_ACTIVOS_MS = 5 * 60 * 1000;

export interface ActivosAhora {
  total: number;
  pwa: number;
  web: number;
}

export interface Metricas {
  /** Asociados distintos. Uno que entra tres veces cuenta una sola. */
  personas: number;
  /** Ratos de uso: se cortan a los 30 minutos sin actividad. */
  sesiones: number;
  /** Pantallas abiertas. */
  visitas: number;
}

export interface ResumenDia {
  fecha: string;
  plataforma: Plataforma | 'todas';
  totales: Metricas;
  /** Siempre las dos, sin importar el filtro: es lo que alimenta el reparto. */
  porPlataforma: Record<Plataforma, Metricas>;
  porHora: (Metricas & { hora: number })[];
  /** La hora con más personas. Null si el día no tuvo actividad. */
  horaPico: number | null;
}

export interface PuntoTendencia extends Metricas {
  fecha: string;
}

/**
 * Estadísticas de uso de la app, guardadas en Redis como totales por hora y
 * por día. No se guarda quién entró: las personas únicas se cuentan con
 * HyperLogLog, que estima cuántos distintos hubo sin conservar la lista.
 *
 * Todas las horas son de Argentina, fijadas acá y no tomadas del reloj del
 * contenedor, igual que el resto de las fechas que salen del backend.
 *
 * Claves (una por plataforma):
 *   est:v:<fecha>:<hh>:<plat>   visitas en esa hora
 *   est:s:<fecha>:<hh>:<plat>   sesiones que empezaron en esa hora
 *   est:p:<fecha>:<hh>:<plat>   personas en esa hora (HyperLogLog)
 *   est:vd / est:sd / est:pd    lo mismo, por día completo
 *   est:sesion:<userId>         marca de sesión abierta, vence a los 30 min
 *   est:activos[:<plat>]        quién hizo algo hace poco: conjunto ordenado
 *                               por instante, que se poda al consultarlo
 */
@Injectable()
export class EstadisticasService {
  private readonly logger = new Logger(EstadisticasService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Anota que un asociado abrió una pantalla. Nunca rompe: si Redis falla, el
   * asociado no tiene por qué enterarse de que no se contó su visita.
   */
  async registrar(userId: number, plataforma: Plataforma, ahora = new Date()): Promise<void> {
    try {
      const { fecha, hora } = momentoArgentino(ahora);
      const id = String(userId);

      const sesionNueva = await this.redis.setSiNoExiste(
        `est:sesion:${id}`,
        plataforma,
        DURACION_SESION,
      );

      const instante = ahora.getTime();
      const operaciones: Promise<unknown>[] = [
        // Para "usando la app ahora": el último momento en que se lo vio.
        this.redis.zadd('est:activos', instante, id),
        this.redis.zadd(`est:activos:${plataforma}`, instante, id),
        this.redis.incr(`est:v:${fecha}:${hora}:${plataforma}`),
        this.redis.incr(`est:vd:${fecha}:${plataforma}`),
        this.redis.pfadd(`est:p:${fecha}:${hora}:${plataforma}`, id),
        this.redis.pfadd(`est:pd:${fecha}:${plataforma}`, id),
      ];

      if (sesionNueva) {
        operaciones.push(
          this.redis.incr(`est:s:${fecha}:${hora}:${plataforma}`),
          this.redis.incr(`est:sd:${fecha}:${plataforma}`),
        );
      } else {
        // Sigue navegando: la sesión se estira otros 30 minutos.
        operaciones.push(this.redis.expire(`est:sesion:${id}`, DURACION_SESION));
      }

      await Promise.all(operaciones);
    } catch (error) {
      this.logger.warn(`No se pudo registrar la actividad de userId=${userId}: ${error?.message ?? error}`);
    }
  }

  /**
   * Cuántas personas están usando la app en este momento. Primero se borra lo
   * viejo, así el conjunto nunca crece más que la gente activa.
   *
   * El total no es la suma de las dos plataformas: quien tiene la app abierta
   * en el celular y el navegador en la compu es una sola persona.
   */
  async activosAhora(ahora = new Date()): Promise<ActivosAhora> {
    const corte = ahora.getTime() - VENTANA_ACTIVOS_MS;
    const claves = ['est:activos', 'est:activos:pwa', 'est:activos:web'];

    await Promise.all(claves.map((k) => this.redis.zremrangebyscore(k, 0, corte)));
    const [total, pwa, web] = await Promise.all(claves.map((k) => this.redis.zcard(k)));

    return { total, pwa, web };
  }

  /** Las métricas de un día, hora por hora. */
  async dia(fecha: string, plataforma?: Plataforma): Promise<ResumenDia> {
    const elegidas = plataforma ? [plataforma] : PLATAFORMAS;
    const horas = Array.from({ length: 24 }, (_, h) => h);

    // Visitas y sesiones de las dos plataformas en dos lecturas.
    const clavesPorHora = (prefijo: string) =>
      PLATAFORMAS.flatMap((plat) => horas.map((h) => `est:${prefijo}:${fecha}:${hh(h)}:${plat}`));
    const [visitasCrudas, sesionesCrudas] = await Promise.all([
      this.redis.mget(clavesPorHora('v')),
      this.redis.mget(clavesPorHora('s')),
    ]);

    const valor = (crudos: (string | null)[], plat: Plataforma, h: number) =>
      Number(crudos[PLATAFORMAS.indexOf(plat) * 24 + h] ?? 0) || 0;

    const personasPorHora = await Promise.all(
      horas.map((h) => this.redis.pfcount(...elegidas.map((p) => `est:p:${fecha}:${hh(h)}:${p}`))),
    );

    const porHora = horas.map((h) => ({
      hora: h,
      personas: personasPorHora[h],
      sesiones: elegidas.reduce((suma, p) => suma + valor(sesionesCrudas, p, h), 0),
      visitas: elegidas.reduce((suma, p) => suma + valor(visitasCrudas, p, h), 0),
    }));

    const porPlataforma = {} as Record<Plataforma, Metricas>;
    for (const plat of PLATAFORMAS) {
      porPlataforma[plat] = {
        personas: await this.redis.pfcount(`est:pd:${fecha}:${plat}`),
        sesiones: horas.reduce((suma, h) => suma + valor(sesionesCrudas, plat, h), 0),
        visitas: horas.reduce((suma, h) => suma + valor(visitasCrudas, plat, h), 0),
      };
    }

    // Las personas del día no son la suma de las horas: quien entró a las 9 y
    // a las 11 es una sola persona. Por eso se cuenta aparte, con la unión.
    const totales: Metricas = {
      personas: await this.redis.pfcount(...elegidas.map((p) => `est:pd:${fecha}:${p}`)),
      sesiones: porHora.reduce((suma, h) => suma + h.sesiones, 0),
      visitas: porHora.reduce((suma, h) => suma + h.visitas, 0),
    };

    const pico = porHora.reduce((mejor, h) => (h.personas > mejor.personas ? h : mejor), porHora[0]);

    return {
      fecha,
      plataforma: plataforma ?? 'todas',
      totales,
      porPlataforma,
      porHora,
      horaPico: pico.personas > 0 ? pico.hora : null,
    };
  }

  /** Totales por día, del más viejo al más nuevo, terminando en `hasta`. */
  async tendencia(dias: number, hasta: string, plataforma?: Plataforma): Promise<PuntoTendencia[]> {
    const elegidas = plataforma ? [plataforma] : PLATAFORMAS;
    const fechas = diasHacia(hasta, dias);

    const [visitasCrudas, sesionesCrudas] = await Promise.all([
      this.redis.mget(fechas.flatMap((f) => elegidas.map((p) => `est:vd:${f}:${p}`))),
      this.redis.mget(fechas.flatMap((f) => elegidas.map((p) => `est:sd:${f}:${p}`))),
    ]);

    const sumar = (crudos: (string | null)[], i: number) =>
      elegidas.reduce((suma, _, j) => suma + (Number(crudos[i * elegidas.length + j] ?? 0) || 0), 0);

    return Promise.all(
      fechas.map(async (fecha, i) => ({
        fecha,
        personas: await this.redis.pfcount(...elegidas.map((p) => `est:pd:${fecha}:${p}`)),
        sesiones: sumar(sesionesCrudas, i),
        visitas: sumar(visitasCrudas, i),
      })),
    );
  }
}

/** Fecha (AAAA-MM-DD) y hora (00-23) de Argentina para un instante. */
export function momentoArgentino(instante: Date): { fecha: string; hora: string } {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante);

  const parte = (tipo: string) => partes.find((p) => p.type === tipo)!.value;
  return { fecha: `${parte('year')}-${parte('month')}-${parte('day')}`, hora: parte('hour') };
}

/** Las `cantidad` fechas que terminan en `hasta`, en orden. */
export function diasHacia(hasta: string, cantidad: number): string[] {
  // Mediodía UTC: así restar días nunca cruza de fecha por la zona horaria.
  const base = new Date(`${hasta}T12:00:00Z`);
  return Array.from({ length: cantidad }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - (cantidad - 1 - i));
    return d.toISOString().slice(0, 10);
  });
}

function hh(hora: number): string {
  return String(hora).padStart(2, '0');
}
