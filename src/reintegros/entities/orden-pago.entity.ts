/** Tal cual lo devuelve api-ops.php, sin tocar. */
export interface OrdenPagoPhp {
  comp: string;
  fecha: string;
  estado: string;
  imp: string;
  fechatranf: string;
  detalle: string;
}

/**
 * El circuito del reintegro tiene tres pasos y api-ops.php los devuelve como
 * literales: se solicita (pendiente), se autoriza (aprobado) y se transfiere
 * la plata (pagado). "otro" es la red de contención por si aparece un cuarto
 * literal: se muestra el texto crudo en vez de mentirle al socio.
 */
export type EstadoOrdenPago = 'pendiente' | 'aprobado' | 'pagado' | 'otro';

/** Lo que se muestra cuando un dato no vino. */
export const SIN_DATO = '-';

/**
 * Lo que consume el front. Normaliza tres cosas que el PHP devuelve
 * incómodas: el estado mezcla un literal en castellano ("Pendiente") con el
 * código crudo de la base ("apro"), el importe viene como string, y las
 * fechas en dd/mm/yyyy no se pueden ordenar como texto.
 *
 * Los campos de texto nunca vienen vacíos: si falta el dato llega un guión,
 * así el front los pinta directo sin condicionales.
 */
export interface OrdenPago {
  comprobante: string;
  /** dd/mm/yyyy, lista para mostrar. */
  fecha: string;
  /**
   * AAAA-MM-DD, sólo para ordenar y comparar; no se muestra. Es el único
   * campo que puede ser null, cuando la fecha no se pudo parsear.
   */
  fechaIso: string | null;
  estado: EstadoOrdenPago;
  /** Etiqueta lista para mostrar: "Pendiente" / "Aprobado" / "Pagado". */
  estadoDescripcion: string;
  importe: number;
  /** dd/mm/yyyy, o "-" si todavía no se pagó. */
  fechaPago: string;
  detalle: string;
}
