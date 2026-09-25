import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

/**
 * Los dueños ven las estadísticas siempre y son los únicos que pueden dar o
 * quitar el acceso a otros. Van fijos en el código a propósito: si alguien
 * llega a Redis, no puede nombrarse dueño.
 */
const DUENOS = ['34824092'];

export interface PersonaConAcceso {
  dni: string;
  nombre: string;
  apellido: string;
}

/**
 * Quién puede ver las estadísticas. Los accesos se guardan en Redis como
 * `est:acceso:<dni>`, con el nombre aparte en `est:acceso:info:<dni>` para
 * listarlos sin ir a la base cada vez.
 */
@Injectable()
export class AccesosEstadisticasService {
  private readonly logger = new Logger(AccesosEstadisticasService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  esDueno(dni: string): boolean {
    return DUENOS.includes(dni);
  }

  async puedeVer(dni: string): Promise<boolean> {
    if (this.esDueno(dni)) return true;
    return (await this.redis.get(`est:acceso:${dni}`)) === '1';
  }

  async exigirQuePuedaVer(dni: string): Promise<void> {
    if (!(await this.puedeVer(dni))) {
      throw new ForbiddenException('No tiene acceso a las estadísticas');
    }
  }

  exigirDueno(dni: string): void {
    if (!this.esDueno(dni)) {
      throw new ForbiddenException('Sólo el dueño de las estadísticas puede administrar los accesos');
    }
  }

  async listar(): Promise<PersonaConAcceso[]> {
    const claves = (await this.redis.keys('est:acceso:*')).filter(
      (clave) => !clave.startsWith('est:acceso:info:'),
    );

    const personas = await Promise.all(
      claves.map(async (clave) => {
        const dni = clave.slice('est:acceso:'.length);
        const info = await this.redis.get(`est:acceso:info:${dni}`);
        const { nombre = '', apellido = '' } = info ? JSON.parse(info) : {};
        return { dni, nombre, apellido };
      }),
    );

    return personas.sort((a, b) => a.apellido.localeCompare(b.apellido));
  }

  /** Busca al asociado en la base, para confirmar a quién se le da acceso. */
  async buscar(dni: string): Promise<PersonaConAcceso> {
    const filas = await this.prisma.$queryRaw<{ Nombre: string; Apellido: string }[]>`
      SELECT TOP 1 Nombre, Apellido FROM Personas WHERE Documento = ${dni}`;

    if (!filas?.length) throw new NotFoundException(`No hay ningún asociado con DNI ${dni}`);
    return { dni, nombre: filas[0].Nombre.trim(), apellido: filas[0].Apellido.trim() };
  }

  /**
   * El nombre se toma de la base y no del pedido: lo que se muestra en la
   * lista tiene que ser quien realmente es, no lo que alguien escribió.
   */
  async agregar(dni: string, dniDelDueno: string): Promise<PersonaConAcceso> {
    this.exigirDueno(dniDelDueno);
    const persona = await this.buscar(dni);

    await this.redis.set(`est:acceso:${dni}`, '1');
    await this.redis.set(
      `est:acceso:info:${dni}`,
      JSON.stringify({ nombre: persona.nombre, apellido: persona.apellido }),
    );
    this.logger.log(`Acceso a estadísticas otorgado a DNI ${dni} por ${dniDelDueno}`);
    return persona;
  }

  async quitar(dni: string, dniDelDueno: string): Promise<{ ok: boolean }> {
    this.exigirDueno(dniDelDueno);
    await this.redis.del(`est:acceso:${dni}`);
    await this.redis.del(`est:acceso:info:${dni}`);
    this.logger.log(`Acceso a estadísticas quitado a DNI ${dni} por ${dniDelDueno}`);
    return { ok: true };
  }
}
