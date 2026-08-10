/**
 * Tipos de documento que se pueden adjuntar a una solicitud de reintegro.
 * El código es el prefijo que lleva el archivo guardado en disco.
 * Para agregar un tipo nuevo basta con sumarlo a este mapa.
 */
export const TIPOS_DOCUMENTO_REINTEGRO = {
  RM: 'Receta Médica',
} as const;

export type TipoDocumentoReintegro = keyof typeof TIPOS_DOCUMENTO_REINTEGRO;

export const CODIGOS_TIPO_DOCUMENTO_REINTEGRO = Object.keys(
  TIPOS_DOCUMENTO_REINTEGRO,
) as TipoDocumentoReintegro[];

/** Extensiones aceptadas y su mimetype válido. */
export const EXTENSIONES_PERMITIDAS: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg', 'image/jpg'],
  '.jpeg': ['image/jpeg', 'image/jpg'],
};

export const MAX_ARCHIVOS_POR_SOLICITUD = 10;
export const MAX_TAMANIO_ARCHIVO = 10 * 1024 * 1024; // 10MB
