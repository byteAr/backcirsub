import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { of, throwError } from 'rxjs';

import { AdminNotificationsService } from './admin-notifications.service';
import { DestinatariosGestionService } from './destinatarios-gestion.service';

/**
 * El envío masivo alcanza a cientos de asociados reales y no se puede
 * deshacer. Estos tests fijan las tres cosas que lo hacen seguro: quién puede
 * dispararlo, que no se mande a ciegas si el padrón no llegó, y que a todos
 * les quede el mensaje aunque no tengan las notificaciones prendidas.
 */
describe('Envío masivo de notificaciones', () => {
  const SUPER_ADMIN = '34824092';
  const CUALQUIERA = '99999999';

  let redis: { get: jest.Mock; set: jest.Mock; keys: jest.Mock; del: jest.Mock };
  let push: { sendPushToUser: jest.Mock };
  let destinatarios: { obtenerIds: jest.Mock };
  let servicio: AdminNotificationsService;

  /** @param conSuscripcion userIds que tienen las notificaciones prendidas. */
  function crear(ids: number[], conSuscripcion: number[] = []): void {
    redis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      keys: jest.fn().mockResolvedValue(conSuscripcion.map((id) => `push:sub:${id}`)),
      del: jest.fn().mockResolvedValue(1),
    };
    push = { sendPushToUser: jest.fn().mockResolvedValue({ ok: true, message: '' }) };
    destinatarios = { obtenerIds: jest.fn().mockResolvedValue(ids) };
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };

    servicio = new AdminNotificationsService(
      redis as any,
      prisma as any,
      push as any,
      destinatarios as any,
    );
  }

  const mensaje = { titulo: 'Asamblea', cuerpo: 'El viernes a las 18.' };

  it('solo lo pueden disparar los super admins', async () => {
    crear([1, 2, 3], [1, 2, 3]);

    await expect(servicio.sendNotificationToAll(mensaje, CUALQUIERA)).rejects.toThrow(
      ForbiddenException,
    );
    expect(push.sendPushToUser).not.toHaveBeenCalled();
  });

  it('no manda nada si el padrón de gestión vino vacío', async () => {
    crear([]);

    await expect(servicio.sendNotificationToAll(mensaje, SUPER_ADMIN)).rejects.toThrow(
      ServiceUnavailableException,
    );
    expect(push.sendPushToUser).not.toHaveBeenCalled();
  });

  it('le manda la push a cada asociado con las notificaciones prendidas', async () => {
    crear([10, 20, 30], [10, 20, 30]);

    const resultado = await servicio.sendNotificationToAll(mensaje, SUPER_ADMIN);

    expect(push.sendPushToUser).toHaveBeenCalledTimes(3);
    expect(resultado).toEqual({
      ok: true,
      destinatarios: 3,
      notificados: 3,
      sinSuscripcion: 0,
      fallidos: 0,
    });
  });

  it('al que no tiene las notificaciones prendidas igual le deja el mensaje', async () => {
    crear([10, 20, 30], [10]);

    const resultado = await servicio.sendNotificationToAll(mensaje, SUPER_ADMIN);

    expect(push.sendPushToUser).toHaveBeenCalledTimes(1);
    expect(push.sendPushToUser).toHaveBeenCalledWith(10, mensaje.titulo, mensaje.cuerpo, expect.any(String));
    expect(resultado.sinSuscripcion).toBe(2);
    // Tres bandejas escritas: una por asociado, tenga push o no.
    const bandejas = redis.set.mock.calls.filter(([clave]) => clave.startsWith('admin:msgs:'));
    expect(bandejas.map(([clave]) => clave).sort()).toEqual([
      'admin:msgs:10',
      'admin:msgs:20',
      'admin:msgs:30',
    ]);
  });

  it('un envío que falla no frena a los demás', async () => {
    crear([10, 20], [10, 20]);
    push.sendPushToUser.mockImplementation(async (userId: number) => {
      if (userId === 10) throw new Error('subscription vencida');
      return { ok: true, message: '' };
    });

    const resultado = await servicio.sendNotificationToAll(mensaje, SUPER_ADMIN);

    expect(resultado).toMatchObject({ ok: true, notificados: 1, fallidos: 1 });
  });

  it('cuenta la audiencia separando quién tiene la app de quién no', async () => {
    crear([1, 2, 3, 4], [2, 4]);

    await expect(servicio.contarAudiencia()).resolves.toEqual({ enGestion: 4, conApp: 2 });
  });
});

describe('DestinatariosGestionService', () => {
  function crear(respuesta: unknown, falla = false) {
    const http = {
      post: jest.fn().mockReturnValue(
        falla ? throwError(() => new Error('timeout')) : of({ data: respuesta }),
      ),
    };
    return { servicio: new DestinatariosGestionService(http as any), http };
  }

  it('entiende la tupla que manda el PHP hoy', async () => {
    const { servicio } = crear([[{ id: '75283' }, { id: '192' }]]);

    await expect(servicio.obtenerIds()).resolves.toEqual([75283, 192]);
  });

  it('entiende también un arreglo pelado, por si le sacan la tupla', async () => {
    const { servicio } = crear([{ id: '10' }, { id: '11' }]);

    await expect(servicio.obtenerIds()).resolves.toEqual([10, 11]);
  });

  it('saca los repetidos y la basura', async () => {
    const { servicio } = crear([[{ id: '10' }, { id: '10' }, { id: 'abc' }, { id: '0' }, {}]]);

    await expect(servicio.obtenerIds()).resolves.toEqual([10]);
  });

  it('ante un {ok:0} del PHP devuelve vacío, no rompe', async () => {
    const { servicio } = crear({ ok: 0, message: 'Faltan parámetros' });

    await expect(servicio.obtenerIds()).resolves.toEqual([]);
  });

  it('ante un error de red devuelve vacío', async () => {
    const { servicio } = crear(null, true);

    await expect(servicio.obtenerIds()).resolves.toEqual([]);
  });

  it('pide el padrón con la clave del día y sin identificar a nadie', async () => {
    const { servicio, http } = crear([[{ id: '1' }]]);

    await servicio.obtenerIds();

    const [, cuerpo, opciones] = http.post.mock.calls[0];
    expect(cuerpo).toEqual({ userId: 0, dni: '0' });
    expect(opciones.headers['X-API-KEY']).toMatch(/^api-key-tk-\d{6}$/);
  });
});
