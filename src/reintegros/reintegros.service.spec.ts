import { of } from 'rxjs';

import { ReintegrosService } from './reintegros.service';
import { OrdenPagoPhp } from './entities/orden-pago.entity';

/**
 * Estos tests fijan el contrato con api-ops.php, que ya cambió sus literales
 * dos veces sin aviso: primero mandaba "apro", después el typo "Oprobado" y
 * ahora "Pendiente"/"Aprobado"/"Pagado". Si vuelve a cambiar, que rompa acá y
 * no en la pantalla del socio.
 */
describe('ReintegrosService - órdenes de pago', () => {
  const orden = (estado: string, fecha = '12/08/2026', comp = '1'): OrdenPagoPhp => ({
    comp,
    fecha,
    estado,
    imp: '1000.00',
    fechatranf: fecha,
    detalle: '',
  });

  const construir = (payload: OrdenPagoPhp[]) => {
    const httpService = {
      post: jest.fn().mockReturnValue(of({ data: payload })),
    };

    const service = new ReintegrosService(
      { get: () => undefined } as any,
      {} as any,
      httpService as any,
    );

    return service;
  };

  it('mapea los tres estados del circuito', async () => {
    const service = construir([
      orden('Pendiente', '01/08/2026', '1'),
      orden('Aprobado', '02/08/2026', '2'),
      orden('Pagado', '03/08/2026', '3'),
    ]);

    const resultado = await service.getOrdenesPago(1, '13972290');
    const porComprobante = Object.fromEntries(
      resultado.map((o) => [o.comprobante, o]),
    );

    expect(porComprobante['1'].estado).toBe('pendiente');
    expect(porComprobante['1'].estadoDescripcion).toBe('Pendiente');

    expect(porComprobante['2'].estado).toBe('aprobado');
    expect(porComprobante['2'].estadoDescripcion).toBe('Aprobado');

    expect(porComprobante['3'].estado).toBe('pagado');
    expect(porComprobante['3'].estadoDescripcion).toBe('Pagado');
  });

  it('sigue aceptando los literales viejos del PHP', async () => {
    const service = construir([
      orden('apro', '01/08/2026', '1'),
      orden('Oprobado', '02/08/2026', '2'),
      orden('pdte', '03/08/2026', '3'),
    ]);

    const resultado = await service.getOrdenesPago(1, '13972290');
    const estados = Object.fromEntries(
      resultado.map((o) => [o.comprobante, o.estado]),
    );

    expect(estados['1']).toBe('aprobado');
    expect(estados['2']).toBe('aprobado');
    expect(estados['3']).toBe('pendiente');
  });

  it('no inventa un estado cuando el literal es desconocido', async () => {
    const service = construir([orden('Rechazado')]);

    const [resultado] = await service.getOrdenesPago(1, '13972290');

    expect(resultado.estado).toBe('otro');
    expect(resultado.estadoDescripcion).toBe('Rechazado');
  });

  it('ordena por el circuito: lo que el socio espera va arriba', async () => {
    const service = construir([
      orden('Pagado', '01/01/2026', 'pagado'),
      orden('Pendiente', '01/01/2020', 'pendiente'),
      orden('Aprobado', '01/01/2024', 'aprobado'),
    ]);

    const resultado = await service.getOrdenesPago(1, '13972290');

    // El pendiente es el más viejo de los tres y aun así va primero.
    expect(resultado.map((o) => o.comprobante)).toEqual([
      'pendiente',
      'aprobado',
      'pagado',
    ]);
  });

  it('dentro de un mismo estado, lo más reciente arriba', async () => {
    const service = construir([
      orden('Pagado', '01/01/2026', 'viejo'),
      orden('Pagado', '12/08/2026', 'nuevo'),
    ]);

    const resultado = await service.getOrdenesPago(1, '13972290');

    expect(resultado.map((o) => o.comprobante)).toEqual(['nuevo', 'viejo']);
  });
});
