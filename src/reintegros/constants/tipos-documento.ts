/**
 * Claves de beneficio tal como vienen en el JSON de sp_Perfil_completo_detallado
 * (userData.Beneficios): far = farmacia, sep = sepelio, eva = evacuación,
 * seg = seguro.
 */
export type ClaveBeneficio = 'far' | 'sep' | 'eva' | 'seg';

export interface DefinicionTipoDocumento {
  descripcion: string;
  /**
   * Beneficio que el socio debe tener activo para poder cargar este tipo.
   *
   * Es opcional: los trámites que no dependen de una adhesión —nacimiento,
   * escolaridad, préstamo— no exigen ninguno y quedan abiertos a todo socio.
   * Sin este campo no se valida nada.
   */
  beneficio?: ClaveBeneficio;
}

/**
 * Tipos de documento que se pueden adjuntar a una solicitud de reintegro.
 * El código es el prefijo que lleva el archivo guardado en disco y es el que
 * usa el sistema de gestión para clasificar lo que sube el socio.
 *
 * Los códigos salen de la tabla de tipos del sistema de gestión, que está
 * normalizada: cuando agreguen uno nuevo alcanza con sumarlo acá indicando,
 * si corresponde, qué beneficio exige. La validación de permisos sale de este
 * mapa, no hay que tocar el controller ni el service.
 */
export const TIPOS_DOCUMENTO_REINTEGRO: Record<string, DefinicionTipoDocumento> = {
  RM: { descripcion: 'Reintegro de medicamentos', beneficio: 'far' },
  RN: { descripcion: 'Reintegro por nacimiento' },
  RE: { descripcion: 'Reintegro por escolaridad' },
  TE: { descripcion: 'Trámite de evacuación', beneficio: 'eva' },
  TP: { descripcion: 'Trámite de préstamo' },
};

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
