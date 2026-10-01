import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AdminNotificationsService } from '../admin-notifications/admin-notifications.service';
import { RedisService } from '../redis/redis.service';
import { hashDeClave } from './claves-externas';
import { ClaveExternaGuard } from './clave-externa.guard';
import { NotificacionesExternasController } from './notificaciones-externas.controller';
import { NotificacionesExternasService } from './notificaciones-externas.service';

/**
 * Lo mismo que va a ver el sistema de gestión del otro lado: headers, códigos
 * HTTP y validación del body, con el mismo ValidationPipe que main.ts.
 */
describe('Notificaciones externas por HTTP', () => {
  const CLAVE = 'cirsub_gestion_de_prueba';
  let app: INestApplication;
  let enviarAUno: jest.Mock;

  beforeAll(async () => {
    const datos = new Map<string, string>();
    enviarAUno = jest.fn(async () => ({ ok: true, pushed: true }));

    const modulo = await Test.createTestingModule({
      controllers: [NotificacionesExternasController],
      providers: [
        NotificacionesExternasService,
        ClaveExternaGuard,
        { provide: ConfigService, useValue: { get: () => `gestion|Sistema de gestión|uno,todos|${hashDeClave(CLAVE)}` } },
        {
          provide: RedisService,
          useValue: {
            get: async (k: string) => datos.get(k) ?? null,
            set: async (k: string, v: string) => (datos.set(k, v), 'OK'),
            del: async (k: string) => (datos.delete(k) ? 1 : 0),
            setSiNoExiste: async (k: string, v: string) => (datos.has(k) ? false : (datos.set(k, v), true)),
            incr: async () => 1,
            expire: async () => 1,
          },
        },
        {
          provide: AdminNotificationsService,
          useValue: {
            searchByDni: async () => ({ id: 4, nombre: 'Ana', apellido: 'Pérez' }),
            enviarAUno,
            enviarATodos: async () => ({ ok: true, destinatarios: 1, notificados: 1, sinSuscripcion: 0, fallidos: 0 }),
          },
        },
      ],
    }).compile();

    app = modulo.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(() => app.close());

  const enviar = (body: object, clave = CLAVE) =>
    request(app.getHttpServer()).post('/notificaciones-externas/enviar').set('X-API-KEY', clave).send(body);

  it('sin clave: 401', async () => {
    await request(app.getHttpServer())
      .post('/notificaciones-externas/enviar')
      .send({ dni: '30111222', titulo: 'a', cuerpo: 'b' })
      .expect(401);
  });

  it('con clave y datos válidos: 201', async () => {
    const { body } = await enviar({ dni: '30111222', titulo: 'Hola', cuerpo: 'Prueba' }).expect(201);
    expect(body).toEqual({ ok: true, pushed: true });
  });

  it('acepta el DNI con puntos o como número', async () => {
    await enviar({ dni: '30.111.222', titulo: 'Hola', cuerpo: 'Prueba' }).expect(201);
    await enviar({ dni: 30111222, titulo: 'Hola', cuerpo: 'Prueba' }).expect(201);
  });

  it('un título de más de 80 caracteres: 400 con el motivo', async () => {
    const { body } = await enviar({ dni: '30111222', titulo: 'x'.repeat(81), cuerpo: 'Prueba' }).expect(400);
    expect(body.message).toContain('El título no puede superar los 80 caracteres');
  });

  it('un campo que no existe: 400', async () => {
    await enviar({ dni: '30111222', titulo: 'Hola', cuerpo: 'Prueba', urgente: true }).expect(400);
  });

  it('enviar a todos contesta 202 con el id, y el estado se consulta', async () => {
    const { body } = await request(app.getHttpServer())
      .post('/notificaciones-externas/enviar-todos')
      .set('X-API-KEY', CLAVE)
      .send({ titulo: 'Asamblea', cuerpo: 'El viernes a las 18.' })
      .expect(202);

    expect(body.estado).toBe('en-curso');

    const estado = await request(app.getHttpServer())
      .get(`/notificaciones-externas/envios/${body.id}`)
      .set('X-API-KEY', CLAVE)
      .expect(200);
    expect(['en-curso', 'terminado']).toContain(estado.body.estado);
  });
});
