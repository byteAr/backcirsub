import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { buildGestionApiKey, GESTION_API_BASE } from '../common/gestion-api-key';

const URL = `${GESTION_API_BASE}/Notificacion_atodos.php`;

/**
 * La lista de asociados que se registraron en la app, que mantiene el sistema
 * de gestión.
 *
 * El PHP devuelve `[[{ "id": "75283" }, ...]]`: una tupla con una sola rama,
 * los ids como texto. Es un padrón global y no filtra por socio, así que se lo
 * llama con `userId: 0` y `dni: '0'`, igual que al catálogo de trámites.
 *
 * Como todos los endpoints de gestión, puede contestar HTTP 200 con `{ok:0}`
 * cuando algo falla, así que acá no se confía en el código de estado: se
 * valida la forma antes de devolver nada.
 */
@Injectable()
export class DestinatariosGestionService {
  private readonly logger = new Logger(DestinatariosGestionService.name);

  constructor(private readonly http: HttpService) {}

  /** Ids de los asociados con la app, sin repetidos. Lista vacía si falla. */
  async obtenerIds(): Promise<number[]> {
    try {
      const respuesta = await firstValueFrom(
        this.http.post(
          URL,
          { userId: 0, dni: '0' },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-KEY': buildGestionApiKey(),
            },
            timeout: 20000,
          },
        ),
      );

      return this.normalizar(respuesta.data);
    } catch (error) {
      this.logger.error(
        `No se pudo traer el padrón de gestión: ${error?.message ?? error}`,
      );
      return [];
    }
  }

  /**
   * Acepta las dos formas que puede tomar la respuesta —la tupla
   * `[[{id}]]` de hoy y un `[{id}]` pelado— y descarta cualquier otra cosa,
   * que es como llega un error del PHP.
   */
  private normalizar(data: unknown): number[] {
    if (!Array.isArray(data)) {
      this.logger.warn(`Respuesta inesperada del padrón: ${JSON.stringify(data)?.slice(0, 200)}`);
      return [];
    }

    const filas = Array.isArray(data[0]) ? (data[0] as unknown[]) : (data as unknown[]);

    const ids = filas
      .map((fila) => Number((fila as { id?: unknown })?.id))
      .filter((id) => Number.isInteger(id) && id > 0);

    return [...new Set(ids)];
  }
}
