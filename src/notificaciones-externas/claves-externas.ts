import { createHash, timingSafeEqual } from 'crypto';

/**
 * Qué puede hacer una app externa:
 * - `uno`: mandarle una notificación a un asociado puntual.
 * - `todos`: mandársela a todo el padrón de la app.
 */
export type Alcance = 'uno' | 'todos';

export interface AppExterna {
  /** Identificador corto, va en los logs: "gestion", "admin". */
  id: string;
  /** Lo que ve el asociado como remitente: "Sistema de gestión". */
  nombre: string;
  alcances: Alcance[];
}

interface ClaveRegistrada extends AppExterna {
  /** sha256 en hex de la clave. La clave en sí no se guarda en ningún lado. */
  hash: Buffer;
}

const ALCANCES_VALIDOS: Alcance[] = ['uno', 'todos'];

export function hashDeClave(clave: string): string {
  return createHash('sha256').update(clave, 'utf8').digest('hex');
}

/**
 * Lee las apps habilitadas de la variable NOTIF_EXTERNAS_CLAVES.
 *
 * Una app por entrada, separadas por punto y coma; cada una con cuatro campos
 * separados por barra vertical:
 *
 *   id|Nombre visible|alcances|sha256
 *   gestion|Sistema de gestión|uno,todos|9f86d08...;admin|Panel de administración|uno|2c26b46...
 *
 * Se guarda el hash y no la clave: si alguien lee el .env, no puede usarla.
 * La clave se genera con `npm run clave:notificaciones -- <id>`.
 *
 * Una entrada mal formada se descarta y se avisa; no tumba al resto.
 */
export function leerClaves(
  crudo: string | undefined,
  avisar: (mensaje: string) => void = () => undefined,
): ClaveRegistrada[] {
  const claves: ClaveRegistrada[] = [];

  for (const entrada of (crudo ?? '').split(';').map((e) => e.trim()).filter(Boolean)) {
    const [id, nombre, alcancesCrudos, hash] = entrada.split('|').map((c) => (c ?? '').trim());
    const alcances = (alcancesCrudos ?? '')
      .split(',')
      .map((a) => a.trim())
      .filter((a): a is Alcance => ALCANCES_VALIDOS.includes(a as Alcance));

    if (!id || !nombre || !alcances.length || !/^[0-9a-f]{64}$/i.test(hash ?? '')) {
      avisar(`Entrada inválida en NOTIF_EXTERNAS_CLAVES (id "${id ?? ''}"): se ignora`);
      continue;
    }

    if (claves.some((c) => c.id === id)) {
      avisar(`Id repetido en NOTIF_EXTERNAS_CLAVES: "${id}". Se usa la primera`);
      continue;
    }

    claves.push({ id, nombre, alcances, hash: Buffer.from(hash.toLowerCase(), 'hex') });
  }

  return claves;
}

/**
 * Busca la app dueña de la clave. Compara contra todas, en tiempo constante,
 * para que la demora de la respuesta no deje adivinar la clave de a partes.
 */
export function appDeLaClave(clave: string, claves: ClaveRegistrada[]): AppExterna | null {
  const recibido = Buffer.from(hashDeClave(clave), 'hex');
  let encontrada: ClaveRegistrada | null = null;

  for (const registrada of claves) {
    if (timingSafeEqual(recibido, registrada.hash) && !encontrada) encontrada = registrada;
  }

  if (!encontrada) return null;
  const { id, nombre, alcances } = encontrada;
  return { id, nombre, alcances };
}
