import { Injectable, Logger  } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

import { PrismaService } from '../prisma/prisma.service';
import { User } from './interfaces/getUser.interface';
import { RedisService } from 'src/redis/redis.service';

@Injectable()
export class AuthService {

  private readonly OTP_EXPIRATION_SECONDS = 20 * 60;

  private readonly logger = new Logger(AuthService.name);
  
  constructor(private prismaService:PrismaService,
    private readonly redisService: RedisService
   ){}

  login(loginUserDto: LoginUserDto) {
    return loginUserDto;
  }
 

  async register(dni: string) {
    this.logger.log(`Intentando buscar persona con DNI: ${dni}`);

    const persona = await this.prismaService.personas.findFirst({
      where: {
        Documento: dni,
      },
      include: {
        // AHORA Personas_Contacto debe ser un objeto para que puedas anidar el 'select' y 'where'
        Personas_Contacto: {
          select: {
            Id: true,
            Detalle: true, // Esto es el valor del contacto (ej: el número de teléfono)
            // Aquí 'Tipo_Contacto' es la propiedad de navegación a la tabla Tipo_Contacto
            Tipo_Contacto: { // Confirmo que este nombre es correcto según tu schema.prisma
              select: {
                Detalle: true, // Este es el nombre del tipo de contacto (ej: "Celular")
              },
            },
          },
          where: {
            // Aquí 'Tipo_Contacto' es la propiedad de navegación a la tabla Tipo_Contacto para el filtro
            Tipo_Contacto: { // Confirmo que este nombre es correcto según tu schema.prisma
              Detalle: 'Celular', // Puedes cambiar 'Celular' por el tipo de contacto que busques
            }
          }
        },
        // sis_Usuarios: true, // Si quieres incluir sis_Usuarios, descomenta esta línea.
      },
    });

    this.logger.log(`Resultado de la búsqueda de persona: ${JSON.stringify(persona, null, 2)}`);

    return persona;
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

  generateOtp(): string {
    const otp = Math.floor(1000 + Math.random() * 9000).toString(); // Genera un número de 4 dígitos
    return otp;
  }

  async saveOtp(phoneNumber: string, otp: string): Promise<void> {
    const key = `otp:${phoneNumber}`;
    await this.redisService.set(key, otp, this.OTP_EXPIRATION_SECONDS);
    this.logger.log(`OTP ${otp} guardada para ${phoneNumber} en Redis con ${this.OTP_EXPIRATION_SECONDS}s de expiración.`);
  }

  async verifyOtp(phoneNumber: string, otp: string): Promise<boolean> {
    const key = `otp:${phoneNumber}`;
    const storedOtp = await this.redisService.get(key);

    if (storedOtp === otp) {
      await this.redisService.del(key); // Elimina la OTP después de usarla
      return true;
    }
    return false;
  }

  
}
