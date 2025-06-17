import { Injectable, Logger, NotFoundException  } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

import { PrismaService } from '../prisma/prisma.service';
import { User } from './interfaces/getUser.interface';
import { RedisService } from 'src/redis/redis.service';
import { passwordUser } from './dto/password-user.dto';

import * as bcrypt from 'bcrypt';

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

  async verifyDni(dni: string) {
    const persona = await this.prismaService.personas.findFirst({
      where: {
        Documento: dni,
      },
      include: {
        Personas_Contacto: {
          select: {
            Id: true,
            Detalle: true, // Esto es el valor del contacto (ej: el numero de telefono)
            Tipo_Contacto: { // 'Tipo_Contacto' es la propiedad de navegacion a la tabla Tipo_Contacto
              select: {
                Detalle: true, // Esta es el nombre del tipo de contacto (ej: "Celular")
              },
            },
          },
          where: {
            // Aqui 'Tipo_Contacto' es la propiedad de navegacion a la tabla Tipo_Contacto para el filtro
            Tipo_Contacto: {
              Detalle: 'Celular', // Puedes cambiar 'Celular' por el tipo de contacto que busques
            },
          },
        },
        // Incluir la relación con sis_Usuarios
        sis_Usuarios: {
          select: {
            // Incluir la relación con sis_Usuarios_Roles
            sis_Usuarios_Roles: {
              select: {
                // Incluir la relación con sis_Roles para obtener el detalle del rol
                sis_Roles: {
                  select: {
                    Detalle: true, // Selecciona el detalle del rol
                  },
                },
              },
              where: {
                  BORRADO_: null, // Asegúrate de traer solo roles no borrados si aplica
              }
            },
          },
        },
        // Si quieres incluir mas usuarios, descomenta esta linea.
        // sis_Roles: true, // Object literal may only specify known properties, and 'sis_Roles' does not exist in type 'PersonasIncludeDefinitionArgs'.
        // Esta línea sis_Roles: true, en el comentario original es incorrecta porque sis_Roles no es una propiedad directa de Personas.
        // Los roles están relacionados a través de sis_Usuarios y sis_Usuarios_Roles.
      },
    });
  
    // Aquí puedes procesar la 'persona' para extraer los roles.
    // Si persona.sis_Usuarios existe y tiene roles, los puedes mapear.
    const roles = persona?.sis_Usuarios?.sis_Usuarios_Roles.map(
      (userRole) => userRole.sis_Roles?.Detalle
    ).filter(Boolean); // Filtrar valores nulos o indefinidos
  
    console.log("Roles del usuario:", roles);
  
    return persona;

  }
 

  async register(createUserDto: CreateUserDto) {
    const { dni, email, password, phoneNumber } = createUserDto
    this.logger.log(`Intentando buscar persona con DNI: ${dni}`);

    
    

    

    
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

  async resetOrCreatePassword(passwordUserDto: passwordUser): Promise<any> {
    const { password, id: personasId } = passwordUserDto; // Renombramos 'id' a 'personasId' para mayor claridad

    try {
      const saltRounds = 10;
      const salt = await bcrypt.genSalt(saltRounds);
      const hashedPassword = await bcrypt.hash(password, salt);

      // 1. Intentar encontrar un usuario existente en sis_Usuarios para este Personas_Id
      let existingUser = await this.prismaService.sis_Usuarios.findUnique({
        where: {
          Personas_Id: personasId,
        },
      });

      let updatedOrCreatedUser;

      if (existingUser) {
        // 2. Si el usuario ya existe, actualizar su contraseña
        updatedOrCreatedUser = await this.prismaService.sis_Usuarios.update({
          where: {
            Personas_Id: personasId,
          },
          data: {
            Pass_Hash: hashedPassword,
            Pass_Salt: salt,
            Fecha_Cambio_Clave: new Date(),
            ULTIMA_MODIFICACION_: new Date(),
            Bloqueado: false,     // Desbloquear
            Intentos_Fallidos: 0, // Resetear intentos
            Activo: true,         // Activar
          },
          select: {
            Id: true,
            Usuario: true,
            Fecha_Cambio_Clave: true,
            ULTIMA_MODIFICACION_: true,
            Personas_Id: true,
          },
        });
        console.log(`Contraseña actualizada para el usuario ${updatedOrCreatedUser.Usuario} (Personas_Id: ${updatedOrCreatedUser.Personas_Id})`);

      } else {
        // 3. Si el usuario NO existe, primero debemos verificar que la Persona sí exista
        const personaExists = await this.prismaService.personas.findUnique({
          where: {
            Id: personasId,
          },
        });

        if (!personaExists) {
          // Si la Persona ni siquiera existe, lanzar un error.
          throw new NotFoundException(`La Persona con ID ${personasId} no fue encontrada en la base de datos.`);
        }

        // Crear un nombre de usuario por defecto o basado en alguna lógica (ej. DNI, email)
        // Esto es CRUCIAL. El campo 'Usuario' en sis_Usuarios es @unique y NOT NULL.
        // Necesitas una forma de generar un 'Usuario' si no existe.
        // Por ejemplo, podrías usar el DNI de la persona o un email.
        // Si el DNI es String, puedes usarlo directamente. Si es numérico, convertirlo.
        const personaDni = personaExists.Documento; // Asumiendo que el Documento de Persona es el DNI
        const defaultUsername = `user_${personaDni}`; // O alguna otra lógica para el nombre de usuario

        // Verificar si el nombre de usuario por defecto ya existe para evitar errores UNIQUE
        const usernameExists = await this.prismaService.sis_Usuarios.findUnique({
            where: {
                Usuario: defaultUsername
            }
        });

        // Si el username por defecto ya existe, puedes generar uno diferente
        // o lanzar un error pidiendo un username explícito.
        // Para simplificar, aquí generaremos uno con timestamp si ya existe.
        let finalUsername = defaultUsername;
        if (usernameExists) {
            finalUsername = `${defaultUsername}_${Date.now()}`;
        }


        // Ahora, crear el nuevo registro en sis_Usuarios
        updatedOrCreatedUser = await this.prismaService.sis_Usuarios.create({
          data: {
            Personas_Id: personasId, // Vincula al Id de la tabla Personas
            Usuario: finalUsername, // Se necesita un nombre de usuario. Define una lógica para esto.
            Pass_Hash: hashedPassword,
            Pass_Salt: salt,
            Fecha_Creacion: new Date(),
            Fecha_Cambio_Clave: new Date(),
            Activo: true,
            Bloqueado: false,
            Intentos_Fallidos: 0,
            ULTIMA_MODIFICACION_: new Date(),
          },
          select: {
            Id: true,
            Usuario: true,
            Fecha_Creacion: true,
            Fecha_Cambio_Clave: true,
            ULTIMA_MODIFICACION_: true,
            Personas_Id: true,
          },
        });
        console.log(`Nuevo usuario creado y contraseña establecida para ${updatedOrCreatedUser.Usuario} (Personas_Id: ${updatedOrCreatedUser.Personas_Id})`);
      }

      return updatedOrCreatedUser;

    } catch (error) {
      console.error('Error en AuthService.resetOrCreatePassword:', error);
      // PrismaClientKnownRequestError con código P2025 es el que esperabas para 'update'
      // Ahora este error debería ser menos frecuente si el flujo es "crear si no existe".
      if (error.code === 'P2025') {
        // Este caso solo debería ocurrir si el Personas_Id no se encontrara en el 'update'
        // después de que findUnique lo haya encontrado, lo cual sería muy inusual.
        // Si Personas_Id no es único en sis_Usuarios, entonces findUnique/findFirst es problemático.
        // Según tu schema, Personas_Id ES único en sis_Usuarios.
        throw new NotFoundException(`No se pudo encontrar el registro de usuario asociado al ID de Persona ${personasId}.`);
      }
      // Re-lanzar el error para que el controlador lo maneje
      throw error; // Lanza el error original (ej. NotFoundException o error genérico)
    }
  }


  async verifyPassword(usuario: string, plainPasswordAttempt: string): Promise<boolean> {
    const user = await this.prismaService.sis_Usuarios.findUnique({
      where: { Usuario: usuario },
      select: { Pass_Hash: true, Pass_Salt: true, Bloqueado: true }
    });
  
    if (!user || user.Bloqueado) {
      // Usuario no encontrado o bloqueado
      return false;
    }
  
    // Compara la contraseña en texto plano con el hash guardado, usando el salt guardado
    const isMatch = await bcrypt.compare(plainPasswordAttempt, user.Pass_Hash!); // Asume que Pass_Hash no será null aquí
  
    // Si no coincide, podrías incrementar Intentos_Fallidos aquí
    if (!isMatch) {
        // Lógica para manejar intentos fallidos, quizás actualizar Intentos_Fallidos en la DB
    }
  
    return isMatch;
  }
          
  

  
}
