import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { constants as fsConstants } from 'fs';
import { access, mkdir, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';

import { AuthService } from '../auth/auth.service';
import {
  EXTENSIONES_PERMITIDAS,
  TIPOS_DOCUMENTO_REINTEGRO,
  TipoDocumentoReintegro,
} from './constants/tipos-documento';

export interface ArchivoReintegroGuardado {
  nombreOriginal: string;
  nombreArchivo: string;
  tamanio: number;
}

const DIACRITICOS = /[̀-ͯ]/g;

/** Zona de referencia para el timestamp del nombre de archivo. */
const ZONA_HORARIA = 'America/Argentina/Buenos_Aires';

@Injectable()
export class ReintegrosService {
  private readonly logger = new Logger(ReintegrosService.name);
  private readonly rutaDestino: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    this.rutaDestino =
      this.configService.get<string>('REINTEGROS_UPLOAD_PATH') ??
      '/usr/local/proyectos/docsreintegros';
  }

  async guardarDocumentos(
    files: Express.Multer.File[],
    tipoDocumento: TipoDocumentoReintegro,
    personasId: number,
    dni: string,
  ): Promise<{ ok: boolean; archivos: ArchivoReintegroGuardado[] }> {
    if (!files?.length) {
      throw new BadRequestException('No se recibió ningún documento');
    }

    await this.verificarBeneficio(tipoDocumento, personasId, dni);

    await this.asegurarDirectorio();

    const guardados: ArchivoReintegroGuardado[] = [];

    for (const file of files) {
      const nombreOriginal = this.normalizarOriginalName(file.originalname);
      const extension = this.validarExtension(nombreOriginal, file.mimetype);
      const base = this.sanitizarBase(nombreOriginal, extension);

      // Formato: <TIPO>-<idUsuario>-<nombreOriginal>-<timestamp><extension>
      //          -> RM-4-FOTO1-20260810143052871.jpg
      //
      // El guion separa los cuatro datos. Como sanitizarBase() convierte los
      // guiones del nombre original en guiones bajos, el nombre siempre se
      // parte en exactamente cuatro campos y no hay forma de confundir el id
      // del socio con un archivo que se llame solo con números.
      const nombreArchivo = await this.resolverNombreLibre(
        [tipoDocumento, personasId, base, this.marcaDeTiempo()].join('-'),
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

  /**
   * Solo puede cargar documentación quien tenga activo el beneficio que ese
   * tipo de documento exige (una receta médica requiere farmacia).
   *
   * La pantalla ya esconde el botón al socio sin el beneficio, pero eso es
   * cosmético: el endpoint es alcanzable con cualquier token válido. La fuente
   * de verdad es el perfil que devuelve el SP, no lo que mande el cliente.
   */
  private async verificarBeneficio(
    tipoDocumento: TipoDocumentoReintegro,
    personasId: number,
    dni: string,
  ) {
    const definicion = TIPOS_DOCUMENTO_REINTEGRO[tipoDocumento];
    if (!definicion) {
      throw new BadRequestException('Tipo de documento no reconocido');
    }

    let beneficios: Record<string, unknown>[];

    try {
      const perfil = await this.authService.perfilCompleto(dni);
      const json = perfil?.[0]?.['Json'];
      if (!json) throw new Error('El perfil vino vacío');

      beneficios = JSON.parse(json)?.Beneficios ?? [];
    } catch (error) {
      this.logger.error(
        `No se pudo verificar el beneficio del socio ${personasId}`,
        error as Error,
      );
      throw new InternalServerErrorException(
        'No se pudo validar su beneficio. Intente nuevamente en unos minutos.',
      );
    }

    const habilitado = beneficios.some(
      (beneficio) => beneficio?.[definicion.beneficio] === true,
    );

    if (!habilitado) {
      this.logger.warn(
        `Socio ${personasId} (DNI ${dni}) intentó cargar ${tipoDocumento} sin el beneficio "${definicion.beneficio}"`,
      );
      throw new ForbiddenException(
        `No cuenta con el beneficio necesario para solicitar este reintegro.`,
      );
    }
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

  /**
   * Nombre sin extensión, sin acentos ni caracteres que rompan una ruta.
   *
   * Los guiones del nombre original pasan a guion bajo: el guion queda
   * reservado como separador de los campos del nombre final.
   */
  private sanitizarBase(nombreOriginal: string, extension: string): string {
    const base = nombreOriginal.slice(
      0,
      nombreOriginal.length - extension.length,
    );

    const limpio = base
      .normalize('NFD')
      .replace(DIACRITICOS, '')
      .replace(/[^a-zA-Z0-9._]/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^[._]+/, '')
      .slice(0, 80);

    return limpio || 'documento';
  }

  /**
   * Fecha y hora de Argentina en formato AAAAMMDDHHmmssSSS.
   *
   * La zona va fija y no se toma del reloj del contenedor: el host corre en
   * horario del este de EE.UU. y el contenedor en UTC, así que confiar en la
   * hora local daría un nombre con la hora corrida. Los datos de zona salen
   * del ICU que trae Node, no del sistema, así que esto funciona en Alpine
   * sin instalar tzdata.
   */
  private marcaDeTiempo(): string {
    const ahora = new Date();

    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: ZONA_HORARIA,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(ahora)
      .reduce<Record<string, string>>((acc, parte) => {
        acc[parte.type] = parte.value;
        return acc;
      }, {});

    const milisegundos = `${ahora.getMilliseconds()}`.padStart(3, '0');

    return [
      partes.year,
      partes.month,
      partes.day,
      partes.hour,
      partes.minute,
      partes.second,
      milisegundos,
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
