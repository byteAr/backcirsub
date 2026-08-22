/**
 * Tal cual lo devuelve api-cta.php, sin tocar.
 *
 * Ojo con los nombres, que no dicen lo que parecen: el texto descriptivo
 * viene en "concepto" pero la pantalla lo muestra como DETALLE, y lo que la
 * pantalla llama CONCEPTO es "con". "Mov_conceptos" no se muestra: solo fija
 * el orden de las filas dentro del mes.
 */
export interface DescuentoPhp {
  /** Id del movimiento contable. Se repite entre conceptos del mismo asiento. */
  con?: string;
  /** Código del concepto: 01, 02, 59, 259. Ordena las filas del mes. */
  Mov_conceptos: string;
  Mesanio: string;
  /** Texto descriptivo, con la cuota embebida cuando corresponde. */
  concepto: string;
  importe: string;
}

/**
 * Lo que consume el front. Normaliza lo mismo que las órdenes de pago: el
 * importe viene como string y el período como "MM - YYYY", que no se puede
 * ordenar como texto.
 */
export interface Descuento {
  /** Mov_conceptos: 01, 02, 59, 259. Ordena, no se muestra. */
  codigo: string;
  /** Lo que la tabla muestra en la columna CONCEPTO (el campo "con" del PHP). */
  concepto: string;
  /** Lo que la tabla muestra en la columna DETALLE, ya sin la cuota. */
  detalle: string;
  /** "09 - 2026", listo para mostrar. */
  periodo: string;
  /** "2026-09", para ordenar y agrupar. Null si no se pudo interpretar. */
  periodoIso: string | null;
  importe: number;
  cuota?: number;
  totalCuotas?: number;
  etiquetaCuota?: string;
}

/**
 * Los descuentos agrupados por mes, que es como los muestra la pantalla:
 * una fila por período que se despliega mostrando sus conceptos.
 */
export interface PeriodoDescuentos {
  /** "09 - 2026", tal como lo manda el PHP. */
  periodo: string;
  /** "2026-09", para ordenar. Null si no se pudo interpretar. */
  periodoIso: string | null;
  /** "SEPTIEMBRE 2026", listo para el encabezado de la fila. */
  etiqueta: string;
  /** Suma de los conceptos del mes. */
  total: number;
  conceptos: ConceptoDescuento[];
}

export interface ConceptoDescuento {
  /** Ordena las filas del mes; no se muestra. */
  codigo: string;
  /** Columna CONCEPTO. */
  concepto: string;
  /** Columna DETALLE. */
  detalle: string;
  importe: number;
  /** Número de cuota dentro del plan. Ausente si el concepto no va en cuotas. */
  cuota?: number;
  /** Cantidad total de cuotas del plan. */
  totalCuotas?: number;
  /** "Cuota 1 de 6", listo para mostrar. Ausente si no aplica. */
  etiquetaCuota?: string;
}
