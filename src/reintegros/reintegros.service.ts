import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constants as fsConstants } from 'fs';
import { access, mkdir, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';

import {
  EXTENSIONES_PERMITIDAS,
  TipoDocumentoReintegro,
} from './constants/tipos-documento';

export interface ArchivoReintegroGuardado {
  nombreOriginal: string;
  nombreArchivo: string;
  tamanio: number;
}

const DIACRITICOS = /[̀-ͯ]/g;

@Injectable()
export class ReintegrosService {
  private readonly logger = new Logger(ReintegrosService.name);
  private readonly rutaDestino: string;

  constructor(private readonly configService: ConfigService) {
    this.rutaDestino =
      this.configService.get<string>('REINTEGROS_UPLOAD_PATH') ??
      '/usr/local/proyectos/docsreintegros';
  }

  async guardarDocumentos(
    files: Express.Multer.File[],
    tipoDocumento: TipoDocumentoReintegro,
    personasId: number,
  ): Promise<{ ok: boolean; archivos: ArchivoReintegroGuardado[] }> {
    if (!files?.length) {
      throw new BadRequestException('No se recibió ningún documento');
    }

    await this.asegurarDirectorio();

    const guardados: ArchivoReintegroGuardado[] = [];

    for (const file of files) {
      const nombreOriginal = this.normalizarOriginalName(file.originalname);
      const extension = this.validarExtension(nombreOriginal, file.mimetype);
      const base = this.sanitizarBase(nombreOriginal, extension);

      // Formato: <TIPO><idUsuario><nombreOriginal>_<timestamp><extension>
      //          -> RM4receta_20260810143052871.jpg
      const nombreArchivo = await this.resolverNombreLibre(
        `${tipoDocumento}${personasId}${base}_${this.marcaDeTiempo()}`,
        extension,
      );

      try {
        await writeFile(join(this.rutaDestino, nombreArchivo), file.buffer, {
          flag: 'wx',
        });
      } catch (error) {
        this.logger.error(
          `No se pudo guardar ${nombreArchivo} en ${this.rutaDestino}`,
          error as Error,
        );
        throw new InternalServerErrorException(
          'No se pudieron guardar los documentos',
        );
      }

      guardados.push({
        nombreOriginal,
        nombreArchivo,
        tamanio: file.size,
      });
    }

    this.logger.log(
      `Reintegro ${tipoDocumento} - usuario ${personasId}: ${guardados.length} archivo(s) guardado(s)`,
    );

    return { ok: true, archivos: guardados };
  }

  private async asegurarDirectorio() {
    try {
      await mkdir(this.rutaDestino, { recursive: true });
    } catch (error) {
      this.logger.error(
        `No se pudo crear el directorio ${this.rutaDestino}`,
        error as Error,
      );
      throw new InternalServerErrorException(
        'No se pudieron guardar los documentos',
      );
    }
  }

  /** Multer entrega el nombre en latin1; lo pasamos a utf8 y le sacamos cualquier ruta. */
  private normalizarOriginalName(originalname: string): string {
    const utf8 = Buffer.from(originalname ?? '', 'latin1').toString('utf8');
    return basename(utf8.replace(/\\/g, '/')).trim() || 'documento';
  }

  private validarExtension(nombreOriginal: string, mimetype: string): string {
    const extension = extname(nombreOriginal).toLowerCase();
    const mimetypesValidos = EXTENSIONES_PERMITIDAS[extension];

    if (!mimetypesValidos) {
      throw new BadRequestException(
        `Extensión no permitida: ${extension || 'sin extensión'}`,
      );
    }

    if (!mimetypesValidos.includes(mimetype)) {
      throw new BadRequestException(
        `El archivo ${nombreOriginal} no coincide con su tipo (${mimetype})`,
      );
    }

    return extension;
  }

  /** Nombre sin extensión, sin acentos ni caracteres que rompan una ruta. */
  private sanitizarBase(nombreOriginal: string, extension: string): string {
    const base = nombreOriginal.slice(
      0,
      nombreOriginal.length - extension.length,
    );

    const limpio = base
      .normalize('NFD')
      .replace(DIACRITICOS, '')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^[._-]+/, '')
      .slice(0, 80);

    return limpio || 'documento';
  }

  /** Fecha y hora local del server: AAAAMMDDHHmmssSSS. */
  private marcaDeTiempo(): string {
    const ahora = new Date();
    const pad = (valor: number, largo = 2) => `${valor}`.padStart(largo, '0');

    return [
      ahora.getFullYear(),
      pad(ahora.getMonth() + 1),
      pad(ahora.getDate()),
      pad(ahora.getHours()),
      pad(ahora.getMinutes()),
      pad(ahora.getSeconds()),
      pad(ahora.getMilliseconds(), 3),
    ].join('');
  }

  /**
   * Red de seguridad: si dos archivos de la misma solicitud caen en el mismo
   * milisegundo con el mismo nombre, se agrega un sufijo incremental.
   */
  private async resolverNombreLibre(
    nombreSinExtension: string,
    extension: string,
  ): Promise<string> {
    for (let intento = 0; intento < 100; intento++) {
      const sufijo = intento === 0 ? '' : `_${intento}`;
      const candidato = `${nombreSinExtension}${sufijo}${extension}`;

      try {
        await access(join(this.rutaDestino, candidato), fsConstants.F_OK);
      } catch {
        return candidato;
      }
    }

    throw new InternalServerErrorException(
      'No se pudo generar un nombre de archivo disponible',
    );
  }
}
