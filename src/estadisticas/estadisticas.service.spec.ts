import { ForbiddenException } from '@nestjs/common';

import { AccesosEstadisticasService } from './accesos-estadisticas.service';
import { SalidaController } from './salida.controller';
import { diasHacia, EstadisticasService, momentoArgentino } from './estadisticas.service';

/**
 * Redis en memoria, con lo justo. Los HyperLogLog se simulan con conjuntos:
 * cuentan exacto, que es lo que hace falta para verificar la lógica.
 */
class RedisFalso {
  valores = new Map<string, string>();
  conjuntos = new Map<string, Set<string>>();

  async get(k: string) { return this.valores.get(k) ?? null; }
  async set(k: string, v: string) { this.valores.set(k, v); return 'OK'; }
  async del(k: string) { return this.valores.delete(k) ? 1 : 0; }
  async keys(patron: string) {
    const prefijo = patron.replace('*', '');
    return [...this.valores.keys()].filter((k) => k.startsWith(prefijo));
  }
  async incr(k: string) {
    const n = Number(this.valores.get(k) ?? 0) + 1;
    this.valores.set(k, String(n));
    return n;
  }
  async mget(ks: string[]) { return ks.map((k) => this.valores.get(k) ?? null); }
  async pfadd(k: string, ...es: string[]) {
    const c = this.conjuntos.get(k) ?? new Set<string>();
    es.forEach((e) => c.add(e));
    this.conjuntos.set(k, c);
    return 1;
  }
  async pfcount(...ks: string[]) {
    const union = new Set<string>();
    ks.forEach((k) => this.conjuntos.get(k)?.forEach((e) => union.add(e)));
    return union.size;
  }
  async setSiNoExiste(k: string, v: string) {
    if (this.valores.has(k)) return false;
    this.valores.set(k, v);
    return true;
  }
  async expire() { return 1; }
  ordenados = new Map<string, Map<string, number>>();
  async zadd(k: string, puntaje: number, miembro: string) {
    const z = this.ordenados.get(k) ?? new Map<string, number>();
    z.set(miembro, puntaje);
    this.ordenados.set(k, z);
    return 1;
  }
  async zremrangebyscore(k: string, min: number, max: number) {
    const z = this.ordenados.get(k);
    let borrados = 0;
    z?.forEach((p, m) => { if (p >= min && p <= max) { z.delete(m); borrados++; } });
    return borrados;
  }
  async zcard(k: string) { return this.ordenados.get(k)?.size ?? 0; }
  async zrem(k: string, m: string) { return this.ordenados.get(k)?.delete(m) ? 1 : 0; }
  async zmiembros(k: string) { return [...(this.ordenados.get(k)?.keys() ?? [])]; }
  /** Simula que pasaron los 30 minutos y la sesión venció. */
  vencerSesion(userId: number) { this.valores.delete(`est:sesion:${userId}`); }
}

/** Un instante a una hora argentina dada del 25/09/2026. */
const a = (hora: number, minuto = 0) =>
  new Date(Date.UTC(2026, 8, 25, hora + 3, minuto)); // Argentina es UTC-3

describe('EstadisticasService', () => {
  let redis: RedisFalso;
  let servicio: EstadisticasService;

  beforeEach(() => {
    redis = new RedisFalso();
    servicio = new EstadisticasService(redis as any);
  });

  it('el mismo asociado que entra dos veces en la mañana cuenta como una persona', async () => {
    await servicio.registrar(7, 'pwa', a(9, 0));
    redis.vencerSesion(7);
    await servicio.registrar(7, 'pwa', a(11, 0));

    const dia = await servicio.dia('2026-09-25');

    expect(dia.totales.personas).toBe(1);
    expect(dia.totales.sesiones).toBe(2);
    expect(dia.totales.visitas).toBe(2);
  });

  it('varias pantallas seguidas son una sola sesión', async () => {
    await servicio.registrar(7, 'web', a(10, 0));
    await servicio.registrar(7, 'web', a(10, 5));
    await servicio.registrar(7, 'web', a(10, 12));

    const dia = await servicio.dia('2026-09-25');

    expect(dia.totales).toEqual({ personas: 1, sesiones: 1, visitas: 3 });
  });

  it('cuenta cada hora en hora argentina', async () => {
    await servicio.registrar(1, 'web', a(21, 30)); // 00:30 UTC del día siguiente

    const dia = await servicio.dia('2026-09-25');

    expect(dia.porHora[21].visitas).toBe(1);
    expect(dia.horaPico).toBe(21);
  });

  it('la hora pico es la de más personas, no la de más visitas', async () => {
    // A las 9, una persona que navega mucho.
    for (let i = 0; i < 10; i++) await servicio.registrar(1, 'web', a(9, i));
    // A las 11, tres personas distintas.
    await servicio.registrar(2, 'web', a(11));
    await servicio.registrar(3, 'web', a(11));
    await servicio.registrar(4, 'web', a(11));

    const dia = await servicio.dia('2026-09-25');

    expect(dia.horaPico).toBe(11);
  });

  it('separa la app instalada del navegador, y el filtro muestra sólo una', async () => {
    await servicio.registrar(1, 'pwa', a(9));
    await servicio.registrar(2, 'pwa', a(9));
    await servicio.registrar(3, 'web', a(9));

    const todas = await servicio.dia('2026-09-25');
    const soloApp = await servicio.dia('2026-09-25', 'pwa');

    expect(todas.porPlataforma.pwa.personas).toBe(2);
    expect(todas.porPlataforma.web.personas).toBe(1);
    expect(todas.totales.personas).toBe(3);
    expect(soloApp.totales.personas).toBe(2);
    expect(soloApp.plataforma).toBe('pwa');
    // El reparto viene completo aunque se filtre, para el gráfico de torta.
    expect(soloApp.porPlataforma.web.personas).toBe(1);
  });

  it('quien entra por la app y por el navegador el mismo día es una persona', async () => {
    await servicio.registrar(5, 'pwa', a(9));
    redis.vencerSesion(5);
    await servicio.registrar(5, 'web', a(15));

    const dia = await servicio.dia('2026-09-25');

    expect(dia.totales.personas).toBe(1);
  });

  it('un día sin actividad no tiene hora pico', async () => {
    const dia = await servicio.dia('2026-09-25');

    expect(dia.horaPico).toBeNull();
    expect(dia.totales).toEqual({ personas: 0, sesiones: 0, visitas: 0 });
    expect(dia.porHora).toHaveLength(24);
  });

  it('la tendencia trae un punto por día, en orden', async () => {
    await servicio.registrar(1, 'web', new Date(Date.UTC(2026, 8, 24, 15)));
    await servicio.registrar(2, 'web', a(10));
    await servicio.registrar(3, 'web', a(10));

    const puntos = await servicio.tendencia(7, '2026-09-25');

    expect(puntos).toHaveLength(7);
    expect(puntos[6]).toMatchObject({ fecha: '2026-09-25', personas: 2 });
    expect(puntos[5]).toMatchObject({ fecha: '2026-09-24', personas: 1 });
    expect(puntos[0].fecha).toBe('2026-09-19');
  });

  describe('usando la app ahora', () => {
    it('cuenta a quien estuvo activo en los últimos 2 minutos', async () => {
      await servicio.registrar(1, 'pwa', a(10, 0));
      await servicio.registrar(2, 'web', a(10, 1));

      expect(await servicio.activosAhora(a(10, 1))).toEqual({ total: 2, pwa: 1, web: 1 });
    });

    it('sin latido ni actividad, a los 2 minutos deja de contarlo', async () => {
      await servicio.registrar(1, 'pwa', a(10, 0));
      await servicio.registrar(2, 'pwa', a(10, 3));

      expect(await servicio.activosAhora(a(10, 4))).toEqual({ total: 1, pwa: 1, web: 0 });
    });

    it('el latido lo mantiene aunque no abra pantallas nuevas', async () => {
      await servicio.registrar(1, 'pwa', a(10, 0));
      await servicio.latido(1, 'pwa', a(10, 5));

      expect((await servicio.activosAhora(a(10, 6))).total).toBe(1);
    });

    it('el latido no suma visitas: no abrió ninguna pantalla', async () => {
      await servicio.registrar(1, 'pwa', a(10, 0));
      await servicio.latido(1, 'pwa', a(10, 1));
      await servicio.latido(1, 'pwa', a(10, 2));

      expect((await servicio.dia('2026-09-25')).totales.visitas).toBe(1);
    });

    it('al cerrar la app sale de la cuenta en el acto', async () => {
      await servicio.registrar(1, 'pwa', a(10, 0));
      await servicio.salida(1, 'pwa');

      expect(await servicio.activosAhora(a(10, 0))).toEqual({ total: 0, pwa: 0, web: 0 });
    });

    it('si cierra la app pero sigue en el navegador, sigue contando ahí', async () => {
      await servicio.registrar(1, 'pwa', a(10, 0));
      await servicio.registrar(1, 'web', a(10, 0));
      await servicio.salida(1, 'pwa');

      expect(await servicio.activosAhora(a(10, 1))).toEqual({ total: 1, pwa: 0, web: 1 });
    });

    it('quien está en la app y en el navegador a la vez es una sola persona', async () => {
      await servicio.registrar(1, 'pwa', a(10, 0));
      await servicio.registrar(1, 'web', a(10, 1));

      expect(await servicio.activosAhora(a(10, 1))).toEqual({ total: 1, pwa: 1, web: 1 });
    });
  });

  it('si Redis falla, registrar no rompe la navegación del asociado', async () => {
    redis.incr = () => Promise.reject(new Error('caído'));

    await expect(servicio.registrar(1, 'web', a(9))).resolves.toBeUndefined();
  });
});

describe('SalidaController', () => {
  let estadisticas: { salida: jest.Mock };
  let jwt: { verifyAsync: jest.Mock };
  let controlador: SalidaController;

  beforeEach(() => {
    estadisticas = { salida: jest.fn().mockResolvedValue(undefined) };
    jwt = { verifyAsync: jest.fn() };
    controlador = new SalidaController(jwt as any, estadisticas as any);
  });

  it('con un token válido saca al dueño del token, no a otro', async () => {
    jwt.verifyAsync.mockResolvedValue({ id: 42, dni: '30000000' });

    await controlador.salida({ token: 'a.b.c', plataforma: 'pwa' });

    expect(estadisticas.salida).toHaveBeenCalledWith(42, 'pwa');
  });

  it('con un token vencido o falso no hace nada, y tampoco rompe', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(controlador.salida({ token: 'a.b.c', plataforma: 'web' })).resolves.toBeUndefined();
    expect(estadisticas.salida).not.toHaveBeenCalled();
  });
});

describe('fechas', () => {
  it('toma la hora argentina y no la del reloj del servidor', () => {
    expect(momentoArgentino(new Date('2026-09-26T01:30:00Z'))).toEqual({
      fecha: '2026-09-25',
      hora: '22',
    });
  });

  it('cuenta días hacia atrás cruzando de mes', () => {
    expect(diasHacia('2026-10-02', 4)).toEqual([
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ]);
  });
});

describe('AccesosEstadisticasService', () => {
  const DUENO = '34824092';
  let redis: RedisFalso;
  let prisma: { $queryRaw: jest.Mock };
  let accesos: AccesosEstadisticasService;

  beforeEach(() => {
    redis = new RedisFalso();
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ Nombre: 'María ', Apellido: 'González ' }]) };
    accesos = new AccesosEstadisticasService(redis as any, prisma as any);
  });

  it('el dueño las ve siempre, y nadie más hasta que se le dé acceso', async () => {
    expect(await accesos.puedeVer(DUENO)).toBeTrue();
    expect(await accesos.puedeVer('11111111')).toBeFalse();
  });

  it('una persona con acceso las ve, pero no administra los accesos', async () => {
    await accesos.agregar('11111111', DUENO);

    expect(await accesos.puedeVer('11111111')).toBeTrue();
    expect(accesos.esDueno('11111111')).toBeFalse();
    await expect(accesos.agregar('22222222', '11111111')).rejects.toThrow(ForbiddenException);
  });

  it('el nombre se toma de la base, no de lo que manda el cliente', async () => {
    const persona = await accesos.agregar('11111111', DUENO);

    expect(persona).toEqual({ dni: '11111111', nombre: 'María', apellido: 'González' });
    expect(await accesos.listar()).toEqual([persona]);
  });

  it('al quitar el acceso deja de verlas', async () => {
    await accesos.agregar('11111111', DUENO);
    await accesos.quitar('11111111', DUENO);

    expect(await accesos.puedeVer('11111111')).toBeFalse();
    expect(await accesos.listar()).toEqual([]);
  });

  it('sólo el dueño puede quitar accesos', async () => {
    await expect(accesos.quitar('11111111', '99999999')).rejects.toThrow(ForbiddenException);
  });
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeTrue(): R;
      toBeFalse(): R;
    }
  }
}

expect.extend({
  toBeTrue: (recibido) => ({ pass: recibido === true, message: () => `esperaba true, llegó ${recibido}` }),
  toBeFalse: (recibido) => ({ pass: recibido === false, message: () => `esperaba false, llegó ${recibido}` }),
});
