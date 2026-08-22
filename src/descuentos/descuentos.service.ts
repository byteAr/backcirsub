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
 * api-cta.php mete la cuota dentro del texto del concepto:
 *   "AY. ECONOMICAS (Pasivos) Cuota: 2/4"
 * Se separa para poder mostrarla aparte y dejar el concepto limpio.
 */
const CUOTA_EN_CONCEPTO = /^(.*?)\s*cuota:\s*(\d+)\s*\/\s*(\d+)\s*$/i;

/**
 * A los conceptos que no van en cuotas les queda un número suelto al final
 * ("CUOTA SOCIAL 1", "SERVICIO SEPELIO CUOTA 1"), que es el mismo dato
 * renderizado sin el prefijo. Se saca para no mostrarlo como parte del
 * nombre.
 */
const NUMERO_SUELTO_AL_FINAL = /^(.*?)\s+\d+\s*$/;

/**
 * Nombres para mostrar. Lo que manda el PHP trae abreviaturas internas
 * ("AY. ECONOMICAS (Pasivos)") que al socio no le dicen nada. Se agregan
 * entradas acá a medida que aparezcan más conceptos.
 */
const NOMBRES_PARA_MOSTRAR: Record<string, string> = {
  // Corto a propósito: al lado va la etiqueta de la cuota, y con el nombre
  // completo no entraban los dos en una línea de celular.
  'AY. ECONOMICAS (PASIVOS)': 'AY. ECONÓMICA',
};

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

    return this.agruparPorPeriodo(this.hastaElMesEnCurso(descuentos));
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
        detalle: descuento.detalle,
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
    const { detalle, cuota, totalCuotas } = this.separarCuota(crudo.concepto);

    return {
      codigo: (crudo.Mov_conceptos ?? '').trim(),
      // "con" es el campo más nuevo del PHP y ya lo vimos ir y venir varias
      // veces; si no llega, la columna muestra un guión en vez de vaciarse.
      concepto: (crudo.con ?? '').trim() || '-',
      detalle,
      periodo: (crudo.Mesanio ?? '').trim() || '-',
      periodoIso: this.aIso(crudo.Mesanio),
      importe: Number(crudo.importe) || 0,
      ...(cuota !== undefined && {
        cuota,
        totalCuotas,
        etiquetaCuota: `cuota ${cuota}/${totalCuotas}`,
      }),
    };
  }

  /**
   * Saca la cuota del texto descriptivo, que es lo que la tabla muestra en la
   * columna DETALLE. El número de cuota lo manda el PHP, que es quien conoce
   * el plan: no se deduce de los datos.
   */
  private separarCuota(crudo: string | null | undefined): {
    detalle: string;
    cuota?: number;
    totalCuotas?: number;
  } {
    const texto = (crudo ?? '').trim();
    if (!texto) return { detalle: '-' };

    const conCuota = CUOTA_EN_CONCEPTO.exec(texto);
    if (conCuota) {
      const [, nombre, cuota, total] = conCuota;
      return {
        detalle: this.nombreParaMostrar(nombre),
        cuota: Number(cuota),
        totalCuotas: Number(total),
      };
    }

    // Sin "Cuota:" pero con un número suelto al final: es un concepto mensual
    // fijo, así que se limpia el número y no se numera nada.
    const conNumero = NUMERO_SUELTO_AL_FINAL.exec(texto);
    if (conNumero) return { detalle: this.nombreParaMostrar(conNumero[1]) };

    return { detalle: this.nombreParaMostrar(texto) };
  }

  /**
   * Traduce el nombre del PHP al que ve el socio, si hay uno definido.
   *
   * Siempre devuelve mayúsculas: así los conceptos se leen parejos aunque el
   * PHP mande alguno con otra capitalización, como "AY. ECONOMICAS
   * (Pasivos)", que traía la última palabra en minúscula.
   */
  private nombreParaMostrar(crudo: string): string {
    const limpio = crudo.trim();
    if (!limpio) return '-';

    return (NOMBRES_PARA_MOSTRAR[limpio.toUpperCase()] ?? limpio).toUpperCase();
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
