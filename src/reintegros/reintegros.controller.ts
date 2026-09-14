import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FilesInterceptor } from '@nestjs/platform-express';
import { extname } from 'path';

import { GetUser } from '../auth/decorators/get-user.decorator';
import {
  EXTENSIONES_PERMITIDAS,
  MAX_ARCHIVOS_POR_SOLICITUD,
  MAX_TAMANIO_ARCHIVO,
  TIPOS_DOCUMENTO_REINTEGRO,
} from './constants/tipos-documento';
import { UploadReintegroDto } from './dto/upload-reintegro.dto';
import { ReintegrosService } from './reintegros.service';

@Controller('reintegros')
export class ReintegrosController {
  constructor(private readonly reintegrosService: ReintegrosService) {}

  /**
   * Órdenes de pago del socio autenticado.
   *
   * No recibe parámetros a propósito: el id y el DNI salen del token, así que
   * nadie puede pedir los reintegros de otro socio.
   */
  @Get('ordenes-pago')
  @UseGuards(AuthGuard())
  async getOrdenesPago(@GetUser() user: { id: number; dni: string }) {
    return this.reintegrosService.getOrdenesPago(user.id, user.dni);
  }

  /**
   * Proxy de api-list_tramite.php: valores de la mutual y tipos de trámite.
   *
   * El front le pega directo al PHP; esto es la salida de emergencia para
   * cuando el navegador bloquea esa llamada por CORS. Devuelve la respuesta
   * cruda, sin normalizar: el que la interpreta es el front.
   */
  @Get('listas-gestion')
  @UseGuards(AuthGuard())
  async getListasGestion() {
    return this.reintegrosService.getListasGestion();
  }

  /**
   * Tipos disponibles según la tabla del backend.
   *
   * Ya no lo usa el selector del front, que ahora se llena con lo que manda
   * api-list_tramite.php. Queda porque sigue siendo la lista contra la que se
   * valida lo que se sube.
   */
  @Get('tipos-documento')
  getTiposDocumento() {
    return Object.entries(TIPOS_DOCUMENTO_REINTEGRO).map(
      ([codigo, { descripcion }]) => ({ codigo, descripcion }),
    );
  }

  @Post('documentos')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(AuthGuard())
  @UseInterceptors(
    FilesInterceptor('documentos', MAX_ARCHIVOS_POR_SOLICITUD, {
      limits: { fileSize: MAX_TAMANIO_ARCHIVO },
      fileFilter: (_req, file, cb) => {
        const extension = extname(file.originalname ?? '').toLowerCase();

        if (!EXTENSIONES_PERMITIDAS[extension]) {
          return cb(
            new BadRequestException(
              `Solo se aceptan archivos ${Object.keys(EXTENSIONES_PERMITIDAS).join(', ')}`,
            ),
            false,
          );
        }

        cb(null, true);
      },
    }),
  )
  async subirDocumentos(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() uploadReintegroDto: UploadReintegroDto,
    @GetUser() user: { id: number; dni: string },
  ) {
    return this.reintegrosService.guardarDocumentos(
      files,
      uploadReintegroDto.tipoDocumento,
      user.id,
      user.dni,
    );
  }
}
