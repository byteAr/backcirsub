/**
 * Clave que espera el sistema PHP de gestion.cirsubgn.org.ar en el header
 * X-API-KEY. Es la fecha del día en horario argentino con un prefijo fijo:
 * api-key-tk-DDMMYY.
 *
 * La zona va explícita y no se toma del reloj del proceso: el servidor corre
 * en horario del este de EE.UU. y los contenedores en UTC, así que después de
 * las 21:00 de Argentina la fecha local ya es la del día siguiente y la clave
 * saldría vencida. Ese fue el 401 que costó encontrar en su momento.
 */
export function buildGestionApiKey(fecha: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).formatToParts(fecha);

  const dd = partes.find((p) => p.type === 'day')!.value;
  const mm = partes.find((p) => p.type === 'month')!.value;
  const yy = partes.find((p) => p.type === 'year')!.value;

  return `api-key-tk-${dd}${mm}${yy}`;
}

/** Base de las funciones PHP del sistema de gestión. */
export const GESTION_API_BASE =
  'https://gestion.cirsubgn.org.ar/Cirsub/CirsubApp/Migrante/funciones';
