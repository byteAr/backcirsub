import {
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ClaveExternaGuard } from './clave-externa.guard';
import { AppExterna, appDeLaClave, hashDeClave, leerClaves } from './claves-externas';
import { LIMITE_POR_MINUTO, NotificacionesExternasService } from './notificaciones-externas.service';

/**
 * Esto abre el envío de notificaciones a sistemas que no son la app. Los
 * tests fijan lo que lo hace seguro: sin la clave justa no entra nadie, cada
 * clave hace sólo lo que tiene habilitado, y el envío a todos no se puede
 * disparar dos veces por error.
 */

const CLAVE_GESTION = 'cirsub_gestion_secreta';
const CLAVE_ADMIN = 'cirsub_admin_secreta';
const CONFIG = [
  `gestion|Sistema de gestión|uno,todos|${hashDeClave(CLAVE_GESTION)}`,
  `admin|Panel de administración|uno|${hashDeClave(CLAVE_ADMIN)}`,
].join(';');

const GESTION: AppExterna = { id: 'gestion', nombre: 'Sistema de gestión', alcances: ['uno', 'todos'] };
const ADMIN: AppExterna = { id: 'admin', nombre: 'Panel de administración', alcances: ['uno'] };

describe('Claves de apps externas', () => {
  it('reconoce cada clave y devuelve su app', () => {
    const claves = leerClaves(CONFIG);

    expect(appDeLaClave(CLAVE_GESTION, claves)).toEqual(GESTION);
    expect(appDeLaClave(CLAVE_ADMIN, claves)).toEqual(ADMIN);
  });

  it('una clave que no está dada de alta no es de nadie', () => {
    expect(appDeLaClave('cualquier-cosa', leerClaves(CONFIG))).toBeNull();
  });

  it('el hash de la config no sirve como clave', () => {
    expect(appDeLaClave(hashDeClave(CLAVE_GESTION), leerClaves(CONFIG))).toBeNull();
  });

  it('descarta las entradas mal formadas sin tumbar las demás', () => {
    const avisos: string[] = [];
    const claves = leerClaves(
      `rota|sin hash|uno|xyz;sinalcance|Nombre||${hashDeClave('x')};${CONFIG}`,
      (m) => avisos.push(m),
    );

    expect(claves.map((c) => c.id)).toEqual(['gestion', 'admin']);
    expect(avisos.length).toBe(2);
  });

  it('sin la variable no hay ninguna app habilitada', () => {
    expect(leerClaves(undefined)).toEqual([]);
  });
});

describe('ClaveExternaGuard', () => {
  const guard = new ClaveExternaGuard({ get: () => CONFIG } as any);

  function contexto(headers: Record<string, string>) {
    const request: any = { headers, ip: '1.2.3.4', method: 'POST', url: '/notificaciones-externas/enviar' };
    const ctx = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    return { ctx, request };
  }

  it('sin clave rechaza con 401', () => {
    expect(() => guard.canActivate(contexto({}).ctx)).toThrow(UnauthorizedException);
  });

  it('con una clave equivocada rechaza con 401', () => {
    expect(() => guard.canActivate(contexto({ 'x-api-key': 'otra' }).ctx)).toThrow(UnauthorizedException);
  });

  it('el Origin de un dominio de confianza no alcanza: sin clave no entra', () => {
    const { ctx } = contexto({ origin: 'https://admin.cirsubgn.org.ar' });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('con una clave válida deja pasar y dice qué app es', () => {
    const { ctx, request } = contexto({ 'x-api-key': CLAVE_GESTION });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.appExterna).toEqual(GESTION);
  });
});

describe('NotificacionesExternasService', () => {
  let redis: Record<string, jest.Mock>;
  let datos: Map<string, string>;
  let notificaciones: Record<string, jest.Mock>;
  let servicio: NotificacionesExternasService;

  beforeEach(() => {
    datos = new Map();
    redis = {
      get: jest.fn(async (k: string) => datos.get(k) ?? null),
      set: jest.fn(async (k: string, v: string) => (datos.set(k, v), 'OK')),
      del: jest.fn(async (k: string) => (datos.delete(k) ? 1 : 0)),
      setSiNoExiste: jest.fn(async (k: string, v: string) => (datos.has(k) ? false : (datos.set(k, v), true))),
      incr: jest.fn(async (k: string) => {
        const n = Number(datos.get(k) ?? 0) + 1;
        datos.set(k, String(n));
        return n;
      }),
      expire: jest.fn(async () => 1),
    };
    notificaciones = {
      searchByDni: jest.fn(async (dni: string) => {
        if (dni !== '30111222') throw new NotFoundException();
        return { id: 4, nombre: 'Ana', apellido: 'Pérez' };
      }),
      enviarAUno: jest.fn(async () => ({ ok: true, pushed: true })),
      enviarATodos: jest.fn(async () => ({ ok: true, destinatarios: 3, notificados: 2, sinSuscripcion: 1, fallidos: 0 })),
    };
    servicio = new NotificacionesExternasService(notificaciones as any, redis as any);
  });

  const mensaje = { titulo: 'Reintegro aprobado', cuerpo: 'Ya podés verlo en Mis trámites.' };
  /** Deja correr lo que quedó en segundo plano. */
  const esperar = () => new Promise((r) => setImmediate(r));

  describe('a un asociado', () => {
    it('busca al asociado por DNI y firma con el nombre de la app', async () => {
      await expect(servicio.enviarAUno(ADMIN, { ...mensaje, dni: '30111222' })).resolves.toEqual({ ok: true, pushed: true });

      expect(notificaciones.enviarAUno).toHaveBeenCalledWith(4, mensaje.titulo, mensaje.cuerpo, 'Panel de administración');
    });

    it('un DNI que no es de un asociado da 404 y no manda nada', async () => {
      await expect(servicio.enviarAUno(ADMIN, { ...mensaje, dni: '11111111' })).rejects.toThrow(NotFoundException);
      expect(notificaciones.enviarAUno).not.toHaveBeenCalled();
    });

    it(`frena después de ${LIMITE_POR_MINUTO} envíos en el mismo minuto`, async () => {
      for (let i = 0; i < LIMITE_POR_MINUTO; i++) {
        await servicio.enviarAUno(ADMIN, { ...mensaje, dni: '30111222' });
      }

      await expect(servicio.enviarAUno(ADMIN, { ...mensaje, dni: '30111222' })).rejects.toThrow(HttpException);
    });
  });

  describe('a todos', () => {
    it('una clave sin el alcance "todos" recibe 403', async () => {
      await expect(servicio.enviarATodos(ADMIN, mensaje)).rejects.toThrow(ForbiddenException);
      expect(notificaciones.enviarATodos).not.toHaveBeenCalled();
    });

    it('contesta enseguida con un id, y el resultado se consulta después', async () => {
      const { id, estado } = await servicio.enviarATodos(GESTION, mensaje);
      expect(estado).toBe('en-curso');

      await esperar();

      const final = await servicio.estadoDeEnvio(GESTION, id);
      expect(final).toEqual(expect.objectContaining({ estado: 'terminado', destinatarios: 3, notificados: 2 }));
      expect(notificaciones.enviarATodos).toHaveBeenCalledWith(mensaje.titulo, mensaje.cuerpo, 'Sistema de gestión');
    });

    it('no deja arrancar otro mientras hay uno en curso', async () => {
      notificaciones.enviarATodos.mockReturnValue(new Promise(() => undefined)); // no termina nunca
      await servicio.enviarATodos(GESTION, mensaje);

      await expect(servicio.enviarATodos(GESTION, { titulo: 'Otro', cuerpo: 'Distinto' })).rejects.toThrow(ConflictException);
    });

    it('el mismo mensaje repetido se rechaza aunque el anterior ya haya terminado', async () => {
      await servicio.enviarATodos(GESTION, mensaje);
      await esperar();

      await expect(servicio.enviarATodos(GESTION, mensaje)).rejects.toThrow(ConflictException);
      expect(notificaciones.enviarATodos).toHaveBeenCalledTimes(1);
    });

    it('si falla, queda registrado el error y se suelta el candado', async () => {
      notificaciones.enviarATodos.mockRejectedValueOnce(new Error('padrón vacío'));
      const { id } = await servicio.enviarATodos(GESTION, mensaje);
      await esperar();

      expect(await servicio.estadoDeEnvio(GESTION, id)).toEqual(
        expect.objectContaining({ estado: 'error', error: 'padrón vacío' }),
      );
      await expect(servicio.enviarATodos(GESTION, { titulo: 'Otro', cuerpo: 'Distinto' })).resolves.toBeDefined();
    });

    it('una app no puede ver los envíos de otra', async () => {
      const otraConTodos: AppExterna = { id: 'otra', nombre: 'Otra', alcances: ['todos'] };
      const { id } = await servicio.enviarATodos(GESTION, mensaje);

      await expect(servicio.estadoDeEnvio(otraConTodos, id)).rejects.toThrow(NotFoundException);
    });
  });
});
