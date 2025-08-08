import { Injectable } from '@nestjs/common';
import { CreateCredencialDto } from './dto/create-credencial.dto';
import { UpdateCredencialDto } from './dto/update-credencial.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CredencialService {

  constructor( private prismaService:PrismaService, ){}


  create(createCredencialDto: CreateCredencialDto) {
    return 'This action adds a new credencial';
  }

  findAll() {
    return `This action returns all credencial`;
  }

  findOne(id: number) {
    return `This action returns a #${id} credencial`;
  }

  update(id: number, updateCredencialDto: UpdateCredencialDto) {
    return `This action updates a #${id} credencial`;
  }

  async updateCbu(cbu: string, id: number) {  
    try {      
      const response:any = await this.prismaService.$queryRaw`
        EXEC sp_Personas_Cuentas_banco_CBU_AC @Personas_Id = ${id},
                              @cbu = ${cbu}                              
      `;    
      
      return response[0]
    } catch (error) {
      return error
    }
  }

  async getCbu(id:number) {
    try {      
      const response:any = await this.prismaService.$queryRaw`
        EXEC sp_Personas_Cuentas_banco_CBU_OU @Personas_Id = ${id}    
      `;    
      
      return response[0]
    } catch (error) {
      return error
    }
  }

  remove(id: number) {
    return `This action removes a #${id} credencial`;
  }
}
