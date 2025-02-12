import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TramitesService {
  constructor(private prisma: PrismaService) {}

  // Llamar a un procedimiento almacenado sin retorno
  async crearTramite(nombre: string, tipo: number) {
    await this.prisma.$executeRaw`
      EXEC dbo.CrearTramite @Nombre = ${nombre}, @Tipo = ${tipo}
    `;
    return { mensaje: 'Trámite creado exitosamente' };
  }

  // Llamar a un procedimiento almacenado con retorno
  async obtenerTramites() {
    const tramites = await this.prisma.$queryRaw`
      EXEC dbo.ObtenerTramites
    `;
    return tramites;
  }
}