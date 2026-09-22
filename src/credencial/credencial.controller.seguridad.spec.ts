import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';

import { CredencialController } from './credencial.controller';
import { UpdateCredencialDto } from './dto/update-credencial.dto';

/**
 * Estos tests están para que no vuelva a pasar: el controlador de credencial
 * estuvo sin guard y tomaba el id del pedido, así que cualquiera podía cambiar
 * el CBU de cualquier asociado. Si alguien saca el guard o vuelve a leer el id
 * del cuerpo, rompen acá.
 */
describe('CredencialController - seguridad', () => {

  it('exige sesión en todo el controlador', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CredencialController) ?? [];

    expect(guards.length).toBeGreaterThan(0);
  });

  describe('usa siempre el asociado del token', () => {
    const credencialService = {
      getCbu: jest.fn().mockResolvedValue({ cbu: '0000000000000000000001' }),
      updateCbu: jest.fn().mockResolvedValue({ ok: true }),
    };
    const authService = { postEncuesta: jest.fn().mockResolvedValue({ ok: true }) };
    const controller = new CredencialController(credencialService as any, authService as any);
    const delToken = { id: 4 };

    beforeEach(() => jest.clearAllMocks());

    it('al leer el CBU', async () => {
      await controller.getCbu(delToken);

      expect(credencialService.getCbu).toHaveBeenCalledWith(4);
    });

    it('al cambiar el CBU, y registra quién y desde qué IP', async () => {
      await controller.updateCbu({ cbu: '2850590940090418135201' }, delToken, '10.0.0.7');

      expect(credencialService.updateCbu).toHaveBeenCalledWith(
        '2850590940090418135201', 4, 'PersonasId:4', '10.0.0.7',
      );
    });

    it('al calificar', async () => {
      await controller.postEncuesta({ servicio: 5, atencion: 4 }, delToken);

      expect(authService.postEncuesta).toHaveBeenCalledWith(4, 5, 4);
    });
  });
});

describe('UpdateCredencialDto', () => {
  // Mismas opciones que el ValidationPipe global de main.ts.
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
  const validar = (cuerpo: unknown) => pipe.transform(cuerpo, { type: 'body', metatype: UpdateCredencialDto });

  it('acepta un CBU de 22 dígitos', async () => {
    await expect(validar({ cbu: '2850590940090418135201' })).resolves.toEqual({ cbu: '2850590940090418135201' });
  });

  it('rechaza el id en el cuerpo: el asociado sale del token, nunca del pedido', async () => {
    await expect(validar({ id: 99, cbu: '2850590940090418135201' })).rejects.toThrow();
  });

  it('rechaza un CBU que no tiene 22 dígitos o que es todo ceros', async () => {
    await expect(validar({ cbu: '123' })).rejects.toThrow();
    await expect(validar({ cbu: '0000000000000000000000' })).rejects.toThrow();
    await expect(validar({ cbu: '28505909400904181352AB' })).rejects.toThrow();
  });

  it('acepta vacío como "sin CBU"', async () => {
    await expect(validar({ cbu: '' })).resolves.toEqual({ cbu: null });
  });
});
