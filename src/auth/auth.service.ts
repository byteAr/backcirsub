import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  
  constructor(private prismaService:PrismaService ){

  }

  login(loginUserDto: LoginUserDto) {
    return loginUserDto;
  }

  

  async register(dni: string) {
    const response = await this.prismaService.personas.findMany({
      where: {
        Documento: dni, 
      },
    });
  
    return response;
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
