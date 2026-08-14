import { HttpService } from '@nestjs/axios';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

import {
  buildGestionApiKey,
  GESTION_API_BASE,
} from '../common/gestion-api-key';
import {
  Descuento,
  DescuentoPhp,
  PeriodoDescuentos,
} from './entities/descuento.entity';

const MESES = [
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
];

/**
 * Conceptos que se descuentan en cuotas y por lo tanto se numeran ("Cuota 3
 * de 6"). El resto —cuota social, farmacia, sepelio— son mensuales y fijos:
 * numerarlos daría un "Cuota 1 de 2" sin sentido.
 *
 * Se agregan códigos acá a medida que aparezcan otros planes en cuotas.
 */
const CODIGOS_EN_CUOTAS = new Set(['3']);

@Injectable()
export class DescuentosService {

  private readonly logger = new Logger(DescuentosService.name);

  constructor(private readonly httpService: HttpService) {}

  /**
   * Descuentos del socio, mes a mes. Los datos viven en el MariaDB del
   * sistema PHP de gestión, así que se piden por HTTP igual que las órdenes
   * de pago. El id y el DNI salen del token, nunca del cliente.
   */
  async getDescuentos(personasId: number, dni: string): Promise<PeriodoDescuentos[]> {
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

    const descuentos = this.ordenar(crudos.map(crudo => this.normalizar(crudo)));

    // La numeración se calcula ANTES de filtrar: son justamente las cuotas
    // futuras las que dicen de cuántas es el plan. Si se filtrara primero,
    // una ayuda de 6 cuotas con 4 ya descontadas se mostraría como "de 4".
    this.numerarCuotas(descuentos);

    return this.agruparPorPeriodo(this.hastaElMesEnCurso(descuentos));
  }

  /**
   * Numera las cuotas de cada plan. Como el PHP no manda ningún
   * identificador de la ayuda económica, se agrupan por concepto e importe:
   * dos cuotas del mismo monto se asumen del mismo plan. Es lo mejor que se
   * puede hacer con los datos que llegan, y falla si el socio tiene dos
   * ayudas distintas con la misma cuota.
   */
  private numerarCuotas(descuentos: Descuento[]): void {
    const planes = new Map<string, Descuento[]>();

    for (const descuento of descuentos) {
      if (!CODIGOS_EN_CUOTAS.has(descuento.codigo)) continue;

      const clave = `${descuento.concepto}|${descuento.importe}`;
      const plan = planes.get(clave) ?? [];
      plan.push(descuento);
      planes.set(clave, plan);
    }

    for (const plan of planes.values()) {
      // De más viejo a más nuevo: la primera cuota es la primera que se pagó.
      const enOrden = [...plan].sort((a, b) =>
        (a.periodoIso ?? '').localeCompare(b.periodoIso ?? ''),
      );

      enOrden.forEach((descuento, indice) => {
        descuento.cuota = indice + 1;
        descuento.totalCuotas = enOrden.length;
        descuento.etiquetaCuota = `Cuota ${indice + 1} de ${enOrden.length}`;
      });
    }
  }

  /**
   * Descarta los períodos posteriores al mes en curso: son descuentos que
   * todavía no se hicieron y al socio le confunden ver como si ya estuvieran.
   */
  private hastaElMesEnCurso(descuentos: Descuento[]): Descuento[] {
    const mesActual = this.mesActualIso();

    return descuentos.filter(
      descuento => !descuento.periodoIso || descuento.periodoIso <= mesActual,
    );
  }

  /** "AAAA-MM" del mes en curso en horario argentino. */
  private mesActualIso(): string {
    const partes = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());

    const anio = partes.find(p => p.type === 'year')!.value;
    const mes = partes.find(p => p.type === 'month')!.value;

    // El padStart no es decorativo: la comparación es de texto, y sin el cero
    // "2026-12" <= "2026-8" da verdadero y los meses futuros se colaban.
    return `${anio}-${mes.padStart(2, '0')}`;
  }

  /**
   * Arma una entrada por mes con sus conceptos adentro, que es como se
   * muestra: una fila desplegable por período.
   */
  private agruparPorPeriodo(descuentos: Descuento[]): PeriodoDescuentos[] {
    const porPeriodo = new Map<string, PeriodoDescuentos>();

    for (const descuento of descuentos) {
      // Se agrupa por el período crudo y no por el ISO: si alguno no se pudo
      // interpretar, igual tiene que caer junto a los de su mismo texto en vez
      // de mezclarse todos bajo una clave nula.
      const clave = descuento.periodo;

      let periodo = porPeriodo.get(clave);
      if (!periodo) {
        periodo = {
          periodo: descuento.periodo,
          periodoIso: descuento.periodoIso,
          etiqueta: this.etiquetaDe(descuento.periodoIso, descuento.periodo),
          total: 0,
          conceptos: [],
        };
        porPeriodo.set(clave, periodo);
      }

      periodo.conceptos.push({
        codigo: descuento.codigo,
        concepto: descuento.concepto,
        importe: descuento.importe,
        ...(descuento.cuota !== undefined && {
          cuota: descuento.cuota,
          totalCuotas: descuento.totalCuotas,
          etiquetaCuota: descuento.etiquetaCuota,
        }),
      });
      periodo.total += descuento.importe;
    }

    // Sumar decimales en punto flotante arrastra basura (82802.54000000001).
    for (const periodo of porPeriodo.values()) {
      periodo.total = Math.round(periodo.total * 100) / 100;
    }

    return [...porPeriodo.values()];
  }

  /** "2026-09" -> "SEPTIEMBRE 2026". Si no se pudo interpretar, deja el crudo. */
  private etiquetaDe(periodoIso: string | null, crudo: string): string {
    if (!periodoIso) return crudo;

    const [anio, mes] = periodoIso.split('-');
    const nombre = MESES[Number(mes) - 1];

    return nombre ? `${nombre} ${anio}` : crudo;
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
