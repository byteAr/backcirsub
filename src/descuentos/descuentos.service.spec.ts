import { of } from 'rxjs';

import { DescuentosService } from './descuentos.service';
import { DescuentoPhp } from './entities/descuento.entity';

/**
 * api-cta.php viene cambiando su forma seguido: en una misma noche mandó los
 * códigos en "Mov_conceptos", después los movió a un campo "Orden" y terminó
 * dejándolos donde estaban con el id del movimiento en "con". Estos tests
 * fijan de qué campo sale cada columna para que un cambio de su lado rompa
 * acá y no en la pantalla del socio.
 */
describe('DescuentosService', () => {
  // Un mes viejo a propósito: getDescuentos() descarta lo posterior al mes
  // en curso, y un período fijo hace el test independiente de la fecha.
  const MES = '01 - 2020';

  const fila = (
    con: string | undefined,
    movConceptos: string,
    concepto: string,
    importe = '100.00',
  ): DescuentoPhp => ({
    con,
    Mov_conceptos: movConceptos,
    Mesanio: MES,
    concepto,
    importe,
  });

  const construir = (payload: DescuentoPhp[]) =>
    new DescuentosService({
      post: jest.fn().mockReturnValue(of({ data: payload })),
    } as any);

  it('CONCEPTO sale de "con" y DETALLE del texto de "concepto"', async () => {
    const service = construir([fila('340', '01', 'CUOTA SOCIAL 1', '32263.00')]);

    const [periodo] = await service.getDescuentos(1, '21677083');
    const [concepto] = periodo.conceptos;

    expect(concepto.concepto).toBe('340');
    expect(concepto.detalle).toBe('CUOTA SOCIAL');
    expect(concepto.importe).toBe(32263);
  });

  it('ordena las filas del mes por Mov_conceptos, no por el texto', async () => {
    const service = construir([
      fila('340', '259', 'SERVICIO SEPELIO CUOTA 1'),
      fila('342', '59', 'AHORRO CON ESTIMULO 1'),
      fila('340', '01', 'CUOTA SOCIAL 1'),
      fila('249', '02', 'FARMACIA CUOTA 1'),
    ]);

    const [periodo] = await service.getDescuentos(1, '21677083');

    // 59 antes que 259: la comparación es numérica, no alfabética.
    expect(periodo.conceptos.map(c => c.detalle)).toEqual([
      'CUOTA SOCIAL',
      'FARMACIA CUOTA',
      'AHORRO CON ESTIMULO',
      'SERVICIO SEPELIO CUOTA',
    ]);
  });

  it('muestra un guión si el PHP deja de mandar "con"', async () => {
    const service = construir([fila(undefined, '01', 'CUOTA SOCIAL 1')]);

    const [periodo] = await service.getDescuentos(1, '21677083');

    expect(periodo.conceptos[0].concepto).toBe('-');
  });

  it('separa la cuota del detalle y la deja en su propia etiqueta', async () => {
    const service = construir([
      fila('340', '01', 'AY. ECONOMICAS (Pasivos) Cuota: 2/4'),
    ]);

    const [periodo] = await service.getDescuentos(1, '21677083');
    const [concepto] = periodo.conceptos;

    expect(concepto.detalle).toBe('AY. ECONÓMICA');
    expect(concepto.etiquetaCuota).toBe('cuota 2/4');
  });

  it('suma el total del mes sin arrastrar basura de punto flotante', async () => {
    const service = construir([
      fila('340', '01', 'CUOTA SOCIAL 1', '32263.00'),
      fila('249', '02', 'FARMACIA CUOTA 1', '38917.90'),
      fila('342', '59', 'AHORRO CON ESTIMULO 1', '8000.64'),
    ]);

    const [periodo] = await service.getDescuentos(1, '21677083');

    expect(periodo.total).toBe(79181.54);
  });
});
