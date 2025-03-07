import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTramiteDto } from './dto/create-tramite.dto';
import { UpdateTramiteDto } from './dto/update-tramite.dto';
import { createResponsableDto } from './dto/create-responsable.dto';

@Injectable()
export class TramitesService {
  constructor(private prisma: PrismaService) {}

  // Llamar a un procedimiento almacenado sin retorno
  async createTramite(data: CreateTramiteDto) {
    const { detalle, fechaInicio, fechaFin, tipoPerioricidad, prioridad, idTramitesGrupo,activo,fechaCreacion,personaIdCreacion } = data;
     
    try {      
      const response:any = await this.prisma.$queryRaw`
        EXEC dbo.Tramites_IN @Detalle = ${detalle}, @Fecha_Inicio = ${fechaInicio}, @Fecha_Fin = ${fechaFin}, @Tipo_Perioricidad=${tipoPerioricidad},@Prioridad=${prioridad},@Id_Tramites_Grupo=${idTramitesGrupo},@Activo=${activo},@Fecha_Creacion=${fechaCreacion},@Persona_Id_Creacion=${personaIdCreacion}
      `;  
      console.log(response[0]);
      
      return response[0]
      
    } catch (error) {
      return error
    }
  }

  async createResponsabe(responsable: createResponsableDto) {
    const {idTramite ,idResposable, emailResponsable, fechaAvisoEmail } = responsable
    const respose = await this.prisma.$queryRaw`EXEC dbo.Tramites_Cumplimentar_Responsable_IN @Tramites_Cumplimentar_Id = ${idTramite}, @Personas_Id = ${idResposable}, @Persona_responsable_Email =  ${emailResponsable}, @Fecha_Aviso_Email = ${fechaAvisoEmail} `
  }

  // Llamar a un procedimiento almacenado con retorno

  async getTramiteById(id: number) {
    const tramites = await this.prisma.$queryRaw`
      EXEC dbo.Tramites_OU_DETALLADO @Id = ${id}
    `;
    const newDate = new Date(tramites[0].Fecha_Creacion).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true, // Formato AM/PM
    });
    return newDate;
    /* return { ...tramites[0]} */
  }
  async getResponsableById(id: number) {
    const tramites = await this.prisma.$queryRaw`
      EXEC dbo.Tramites_Cumplimentar_Responsable_OU @Id = ${id}
    `;
    return tramites;
  }

  async getAllTramites() {
    const tramites = await this.prisma.$queryRaw`
      EXEC dbo.Tramites_Cumplimentar_Estado_general
    `;
    
    return tramites;
  }
  async getAllResponsables() {
    const tramites = await this.prisma.$queryRaw`
      EXEC dbo.Tramites_Cumplimentar_Estado_general
    `;
    
    return tramites;
  }

  async updateTramite(data: UpdateTramiteDto, id: number) {
    const { detalle, fechaInicio, fechaFin, tipoPerioricidad, prioridad, idTramitesGrupo,activo,fechaCreacion,personaIdCreacion } = data;
    try {
      const response:any = await this.prisma.$queryRaw`
        EXEC dbo.Tramites_AC @Id=${id}, @Detalle = ${detalle}, @Fecha_Inicio = ${fechaInicio}, @Fecha_Fin = ${fechaFin}, @Tipo_Perioricidad=${tipoPerioricidad},@Prioridad=${prioridad},@Id_Tramites_Grupo=${idTramitesGrupo},@Activo=${activo},@Fecha_Creacion=${fechaCreacion},@Persona_Id_Creacion=${personaIdCreacion}
      `;
      return response[0]
    } catch (error) {
      return error
    }
  }

  async deleteTramite(id: number) {
    try {
      const response:any = await this.prisma.$queryRaw`
        EXEC dbo.Tramites_BL @Id=${id}
      `;
      console.log(response);
      return response
    } catch (error) {
      return new BadRequestException(error)
    }
  }
  
}