import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException, UnauthorizedException  } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

import { PrismaService } from '../prisma/prisma.service';
import { User } from './interfaces/getUser.interface';
import { RedisService } from 'src/redis/redis.service';
import { passwordUser } from './dto/password-user.dto';

import * as bcrypt from 'bcrypt';

import { JwtPayload } from './interfaces/jwt-payload.interface';

@Injectable()
export class AuthService {
  

  private readonly OTP_EXPIRATION_SECONDS = 20 * 60;

  private readonly logger = new Logger(AuthService.name);
  
  constructor(private prismaService:PrismaService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService
   ){}

  async login(loginUserDto: LoginUserDto){

    const {dni, password } = loginUserDto;

    if(!dni) return;
          
      const User: any[] = await this.prismaService.$queryRaw`
        EXEC dbo.sp_Perfil_Login @Documento = ${dni};
      `;

      const userLogin = User[0];
      const userLoginB = userLogin["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"];
      const userBParseado = JSON.parse(userLoginB)
      
    
      if (User && User.length > 0 && userBParseado.Login[0]) {      
        /* await this.perfilCompleto(dni); */
          const perfilCompletoUser: any[] = await this.prismaService.$queryRaw`
            EXEC sp_Perfil_completo @Documento = ${dni};
          `;

          const semiParseado = perfilCompletoUser[0];
          const userParseado = semiParseado["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"]
          const parseado = JSON.parse(userParseado);         

          const isMatch = bcrypt.compareSync(password, userBParseado.Login[0].Pass_Hash);            

          if(isMatch) {             
            const token = this.getJWT({id:  userBParseado.Login[0].Personas_Id, dni: dni});
            return {
              ok: true,
              token,
              user: userBParseado.Login[0],
              userData: parseado
            }
          } else {     
            throw new UnauthorizedException({
              ok:false,
              message: 'Credenciales inválidas'
            });    
         
        }   
    };
  }


  async perfilCompleto(Documento: string) {
    const userCompleto = await this.prismaService.$queryRaw`
          EXEC sp_Perfil_completo @Documento = ${Documento};
        `;
        const userComplete = userCompleto[0]
        const userParseado = userComplete["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"]

        const userParseadoJson = JSON.parse(userParseado)

        return userParseadoJson   
  }

  private getJWT( payload: JwtPayload) {
    const token = this.jwtService.sign( payload );
    return token;
  }
  
 

  async register(createUserDto: CreateUserDto): Promise<any> {
    try {
      const rawResponse: any[] = await this.prismaService.$queryRaw`
        EXEC dbo.sp_Perfil_Login @Documento = ${createUserDto.dni};        
      `              
    
      if (rawResponse && rawResponse.length > 0) {

        const loginResponse = rawResponse[0];          
        
        const jsonLogin = loginResponse["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"]; 

        
        const responseLOginParseado = JSON.parse(jsonLogin)

        const { password } = createUserDto;

        const passwordHash = bcrypt.hashSync(password, 10);        

        const register = await this.prismaService.$queryRaw`
          EXEC dbo.sis_Usuarios_IN
             @Personas_Id = ${responseLOginParseado.Login[0].Personas_Id},
             @Usuario = ${createUserDto.dni},
             @Pass_Hash = ${passwordHash}
        `

        const token = this.getJWT({
          id: responseLOginParseado.Login[0].Personas_Id,
          dni: createUserDto.dni
        })

        const contactInCelular = await this.prismaService.$queryRaw`
          EXEC Personas_Contacto_IN
             @Personas_Id = ${responseLOginParseado.Login[0].Personas_Id},
             @Tipo_Contacto_Id = ${2},
             @Personas_Contacto_Detalle = ${createUserDto.telefono},
             @Observaciones = ''
        `
        const contactInEmail = await this.prismaService.$queryRaw`
          EXEC Personas_Contacto_IN
             @Personas_Id = ${responseLOginParseado.Login[0].Personas_Id},
             @Tipo_Contacto_Id = ${3},
             @Personas_Contacto_Detalle = ${createUserDto.email},
             @Observaciones = ''
        `

        return {
          ok: true,
          token,
          userData: await this.perfilCompleto(createUserDto.dni)
        }              
        
      } else {
        // Si no se devuelve ninguna fila (ej. no se encontró el documento, o error interno del SP antes del SELECT final)
        return {
          message: "no se encontro usuario con ese dni"
        }; // O lanzar una excepción específica
      }

    } catch (error) {
      throw new  BadRequestException(`Usuario no encontrado: ${error}`)
    }
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

  async obtenerPersonaPorDni(dni: string): Promise<any> {
    const result: any[] = await this.prismaService.$queryRaw`EXEC dbo.sp_Perfil_Login @Documento = ${dni};`;

    const userLogin = result[0];
    const userLoginB = userLogin["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"];
    const userBParseado = JSON.parse(userLoginB)

    if (result && result.length > 0 && userBParseado.Login[0]) {
      return {
        ok: true,
        userId : userBParseado.Login[0].Personas_Id
      } 
    } else {
      return {
        ok: false
      }
    }

                               
  }


  async prueba(Documento: string){
    const documentoInt = parseInt(Documento);
    const response =  await this.prismaService.$executeRaw`EXEC sp_Perfil_completo @Documento = ${Documento}`;
    return response

  }

  async getContactUser(id: number){
   const result: any[] = await this.prismaService.$queryRaw`EXEC Personas_Contacto_OU @Id = ${id};`;

    /* const userLogin = result[0];
    const userLoginB = userLogin["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"];
    const userBParseado = JSON.parse(userLoginB); */

    return result;

    

  }

  async saveImage(file: Express.Multer.File, personasId: number){
    if (!file) {
      throw new BadRequestException('No se recibió archivo.');
    }
  

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('El archivo debe ser una imagen.');
    }
  
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('La imagen no puede superar los 5MB.');
    }
  
    try {
      const fotoBuffer = file.buffer;
  
      const result = await this.prismaService.$executeRaw`
        EXEC Personas_foto_IN @Personas_Id = ${personasId}, @Foto_1 = ${fotoBuffer};
      `;
  
      return {
        message: 'Imagen guardada correctamente',
        dbResponse: result,
      };
    } catch (error) {
      this.logger.error('Error al guardar imagen:', error);
      throw new InternalServerErrorException('No se pudo guardar la imagen.');
    }
  }
  async updateImage(file: Express.Multer.File, personasId: number){
    if (!file) {
      throw new BadRequestException('No se recibió archivo.');
    }
  

    if (!file.mimetype.startsWith('image/')) {
      throw new BadRequestException('El archivo debe ser una imagen.');
    }
  
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('La imagen no puede superar los 5MB.');
    }
  
    try {
      const fotoBuffer = file.buffer;
  
      const result = await this.prismaService.$executeRaw`
        EXEC Personas_foto_AC @Personas_Id = ${personasId}, @Foto_1 = ${fotoBuffer};
      `;
  
      return {
        message: 'Imagen guardada correctamente',
        dbResponse: result,
      };
    } catch (error) {
      this.logger.error('Error al guardar imagen:', error);
      throw new InternalServerErrorException('No se pudo guardar la imagen.');
    }
  }

  async checkAuthStatus(user: any) {    
    
    
    
    
    const User: any[] = await this.prismaService.$queryRaw`
        EXEC dbo.sp_Perfil_Login @Documento = ${user.Persona[0].Documento};
      `;

      const userLogin = User[0];
      const userLoginB = userLogin["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"];
      const userBParseado = JSON.parse(userLoginB)

      
      

        
    return {
      ok: true,
      token: this.getJWT({id: user.Id, dni: user.Persona[0].Documento}),
      user: userBParseado.Login[0],
      userData: user,
    }
  }

  async getProfileImage(id: number): Promise<Buffer> {
    const sql = `EXEC Personas_foto_OU @Id = ${id}`;
const result = await this.prismaService.$queryRawUnsafe(sql) as any[];


    if (!result || result.length === 0 || !result[0].Foto_1) {
      throw new NotFoundException('Imagen no encontrada');
    }

    return result[0].Foto_1;
  }
          
  

  
}
