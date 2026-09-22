import { ValidationPipe } from '@nestjs/common';

import { EncuestaDto } from './encuesta.dto';

/**
 * Mismas opciones que el ValidationPipe global de main.ts, para probar lo
 * que de verdad le llega al controlador.
 */
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validar = (cuerpo: unknown) =>
  pipe.transform(cuerpo, { type: 'body', metatype: EncuestaDto });

describe('EncuestaDto', () => {

  it('acepta dos calificaciones de 1 a 5', async () => {
    await expect(validar({ servicio: 5, atencion: 1 })).resolves.toEqual({ servicio: 5, atencion: 1 });
  });

  it('acepta números que llegan como texto', async () => {
    await expect(validar({ servicio: '4', atencion: '3' })).resolves.toEqual({ servicio: 4, atencion: 3 });
  });

  it('rechaza calificaciones fuera de rango', async () => {
    await expect(validar({ servicio: 0, atencion: 3 })).rejects.toThrow();
    await expect(validar({ servicio: 3, atencion: 6 })).rejects.toThrow();
  });

  it('rechaza calificaciones que no son enteras', async () => {
    await expect(validar({ servicio: 2.5, atencion: 3 })).rejects.toThrow();
  });

  it('rechaza el id en el cuerpo: se toma del token, nunca del pedido', async () => {
    await expect(validar({ id: 4, servicio: 5, atencion: 5 })).rejects.toThrow();
  });

  it('exige las dos calificaciones', async () => {
    await expect(validar({ servicio: 5 })).rejects.toThrow();
  });
});
