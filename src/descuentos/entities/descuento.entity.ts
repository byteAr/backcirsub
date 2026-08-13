/** Tal cual lo devuelve api-cta.php, sin tocar. */
export interface DescuentoPhp {
  Mov_conceptos: string;
  Mesanio: string;
  concepto: string;
  importe: string;
}

/**
 * Lo que consume el front. Normaliza lo mismo que las órdenes de pago: el
 * importe viene como string y el período como "MM - YYYY", que no se puede
 * ordenar como texto.
 */
export interface Descuento {
  /** Código interno del concepto: 01, 02, 59, 259... */
  codigo: string;
  concepto: string;
  /** "09 - 2026", listo para mostrar. */
  periodo: string;
  /** "2026-09", para ordenar y agrupar. Null si no se pudo interpretar. */
  periodoIso: string | null;
  importe: number;
}
