import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

import { PrismaService } from '../prisma/prisma.service';
import { User } from './interfaces/getUser.interface';

@Injectable()
export class AuthService {
  
  constructor(private prismaService:PrismaService ){

  }

  login(loginUserDto: LoginUserDto) {
    return loginUserDto;
  }
 

  async register(dni: string) {
    
    const persona = await this.prismaService.personas.findFirst({
      where: {
        Documento: dni,
      },
      include: {
        Personas_Contacto: true,
        sis_Usuarios: true
      }
    });
  
    return persona; // si existe, devuelve el objeto; si no, devuelve null
  }

  async createPersona(persona: any) {
    const { nombre, apellido, dni, fechaNacimiento, tipodni } = persona
    try {
      const response:any = await this.prismaService.$queryRaw`
        EXEC dbo.Personas_IN @Tipo_Documento = ${tipodni.Id},
                              @Documento = ${dni}, 
                              @Apellido =${apellido}, 
                              @Nombre = ${nombre}, 
                              @Fecha_Nacimiento = ${fechaNacimiento},
                              @Activo = ${false}
      `;  
      console.log(response);
      
      return response[0]
    } catch (error) {
      return error
    }
  }

  
}
