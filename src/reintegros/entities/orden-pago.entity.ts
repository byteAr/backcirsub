/** Tal cual lo devuelve api-ops.php, sin tocar. */
export interface OrdenPagoPhp {
  comp: string;
  fecha: string;
  estado: string;
  imp: string;
  fechatranf: string;
  detalle: string;
}

export type EstadoOrdenPago = 'pendiente' | 'aprobado' | 'otro';

/**
 * Lo que consume el front. Normaliza tres cosas que el PHP devuelve
 * incómodas: el estado mezcla un literal en castellano ("Pendiente") con el
 * código crudo de la base ("apro"), el importe viene como string, y las
 * fechas en dd/mm/yyyy no se pueden ordenar como texto.
 */
export interface OrdenPago {
  comprobante: string;
  /** dd/mm/yyyy, lista para mostrar. */
  fecha: string;
  /** AAAA-MM-DD, para ordenar y comparar. */
  fechaIso: string | null;
  estado: EstadoOrdenPago;
  /** Etiqueta lista para mostrar: "Pendiente" / "Aprobado". */
  estadoDescripcion: string;
  importe: number;
  /** dd/mm/yyyy, o null si todavía no se transfirió (el PHP manda "-"). */
  fechaTransferencia: string | null;
  detalle: string;
}
