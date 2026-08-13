import { HttpService } from '@nestjs/axios';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import {
  buildGestionApiKey,
  GESTION_API_BASE,
} from '../common/gestion-api-key';
import { Descuento, DescuentoPhp } from './entities/descuento.entity';

@Injectable()
export class DescuentosService {

  private readonly logger = new Logger(DescuentosService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Descuentos del socio, mes a mes. Los datos viven en el MariaDB del
   * sistema PHP de gestión, así que se piden por HTTP igual que las órdenes
   * de pago. El id y el DNI salen del token, nunca del cliente.
   */
  async getDescuentos(personasId: number, dni: string): Promise<Descuento[]> {
    const url = `${GESTION_API_BASE}/api-cta.php`;

    let crudos: DescuentoPhp[];

    try {
      const respuesta = await firstValueFrom(
        this.httpService.post<DescuentoPhp[] | { ok: number; message: string }>(
          url,
          { userId: personasId, dni },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-KEY': buildGestionApiKey(),
            },
            timeout: 15000,
          },
        ),
      );

      // El PHP contesta 200 aunque haya fallado: puede devolver {ok: 0} o
      // directamente el texto de un error de MySQL.
      if (!Array.isArray(respuesta.data)) {
        throw new Error(
          `Respuesta inesperada: ${JSON.stringify(respuesta.data).slice(0, 200)}`,
        );
      }

      crudos = respuesta.data;
    } catch (error) {
      this.logger.error(
        `No se pudieron obtener los descuentos del socio ${personasId}`,
        error as Error,
      );
      throw new InternalServerErrorException(
        'No pudimos obtener sus descuentos en este momento. Intente nuevamente en unos minutos.',
      );
    }

    return this.ordenar(crudos.map(crudo => this.normalizar(crudo)));
  }

  private normalizar(crudo: DescuentoPhp): Descuento {
    return {
      codigo: (crudo.Mov_conceptos ?? '').trim(),
      concepto: (crudo.concepto ?? '').trim() || '-',
      periodo: (crudo.Mesanio ?? '').trim() || '-',
      periodoIso: this.aIso(crudo.Mesanio),
      importe: Number(crudo.importe) || 0,
    };
  }

  /** "MM - YYYY" -> "YYYY-MM". Null si no matchea, para no inventar fechas. */
  private aIso(periodo: string): string | null {
    const match = /^(\d{1,2})\s*-\s*(\d{4})$/.exec((periodo ?? '').trim());
    if (!match) return null;

    const [, mm, yyyy] = match;
    return `${yyyy}-${mm.padStart(2, '0')}`;
  }

  /**
   * Más reciente arriba. El PHP ya los manda ordenados, pero igual que con
   * las órdenes de pago no conviene depender de eso: alcanza con que cambien
   * el ORDER BY para que la pantalla quede desordenada.
   */
  private ordenar(descuentos: Descuento[]): Descuento[] {
    return [...descuentos].sort((a, b) => {
      if (a.periodoIso !== b.periodoIso) {
        if (!a.periodoIso) return 1;
        if (!b.periodoIso) return -1;
        return b.periodoIso.localeCompare(a.periodoIso);
      }

      return a.codigo.localeCompare(b.codigo, undefined, { numeric: true });
    });
  }
}
