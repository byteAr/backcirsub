import { IsIn } from 'class-validator';
import {
  CODIGOS_TIPO_DOCUMENTO_REINTEGRO,
  TipoDocumentoReintegro,
} from '../constants/tipos-documento';

export class UploadReintegroDto {
  @IsIn(CODIGOS_TIPO_DOCUMENTO_REINTEGRO, {
    message: `tipoDocumento debe ser uno de: ${CODIGOS_TIPO_DOCUMENTO_REINTEGRO.join(', ')}`,
  })
  tipoDocumento: TipoDocumentoReintegro;
}
