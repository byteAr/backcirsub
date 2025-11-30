import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException, UnauthorizedException  } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

import { PrismaService } from '../prisma/prisma.service';
import { User } from './interfaces/getUser.interface';
import { RedisService } from 'src/redis/redis.service';
import { passwordUser } from './dto/password-user.dto';

import * as sql from 'mssql';

import * as bcrypt from 'bcrypt';

import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AwsRekognitionService } from 'src/aws/aws-rekognition.service';

const sqlConfig: sql.config = {
  user: 'marcos',
  password: 'Margen.25', // ponla literal
  server: '192.168.1.3',
  port: 1433,
  database: 'CIRSUB',
  options: {
    encrypt: false, // según tu imagen, no usas SSL
    trustServerCertificate: true, // según tu imagen está marcado
    enableArithAbort: true
  }
};

@Injectable()
export class AuthService {
  

  private readonly OTP_EXPIRATION_SECONDS = 20 * 60;

  private readonly logger = new Logger(AuthService.name);
  
  constructor(private prismaService:PrismaService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly awsRekognitionService: AwsRekognitionService,
   ){}

  async login(loginUserDto: LoginUserDto){

    const {dni, password } = loginUserDto;
    console.log(dni, password);
    

    if(!dni) return;
          
      const User: any[] = await this.prismaService.$queryRaw`
        EXEC sp_Login @Documento = ${dni};
      `;

      const passwordHasheado = User[0].Pass_Hash
    
      if (User.length <= 0) {
        console.log("usuario no encontrado")
        return
      }
        

      const rawResponse= await this.perfilCompleto(loginUserDto.dni);
      const userPosition = rawResponse[0];
      const userDataPre= userPosition["Json"];
      const userData = JSON.parse(userDataPre);

      console.log("esta es la respuesta parseada", userData);


      

      const isMatch = bcrypt.compareSync(password, passwordHasheado);

      if(isMatch) {             
        const token = this.getJWT({id:  userData.Persona[0].Id, dni: dni});
        return {
          ok: true,
          token,
          userData: userData
        }
      } else {     
        throw new UnauthorizedException({
          ok:false,
          message: 'Credenciales inválidas'
        });        
      }       
  }


  async perfilCompleto(Documento: string) {
    const userCompleto = await this.prismaService.$queryRaw`
          EXEC sp_Perfil_completo_detallado @Documento = ${Documento};
        `;
      console.log('esto es lo que devuelve al consultar por el dni', userCompleto)

        return userCompleto   
  }

  private getJWT( payload: JwtPayload) {
    const token = this.jwtService.sign( payload );
    return token;
  } 

async register(createUserDto: CreateUserDto): Promise<any> {  

  const{dni, password} = createUserDto  
  
  try {
    const rawResponse= await this.perfilCompleto(createUserDto.dni);
      const userPosition = rawResponse[0];
      const userDataPre= userPosition["Json"];
      const userData = JSON.parse(userDataPre);
      const {dni, password} = createUserDto
    
    if (userData.Persona[0].Documento === dni) {       
      
      const id = userData.Persona[0].Id;
      const { password } = createUserDto;
      const passwordHash = bcrypt.hashSync(password, 10); 
      const register = await this.prismaService.$queryRaw`
        EXEC sp_sis_Usuarios_Hash_AC
            @Personas_Id = ${id},
            @Pass_Hash = ${passwordHash}
        `
           
      const token = this.getJWT({
        id: id,
        dni: createUserDto.dni
      })      
              
      return {
        ok: true,
        token,
        userData
      }                      
    } else {
      // Si no se devuelve ninguna fila (ej. no se encontró el documento, o error interno del SP antes del SELECT final)
      return {
        message: "verifique los datos ingresados"
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

  async obtenerPersonaPorDni(dni: string, email:string, telefono:string): Promise<any> {
    const rawResponse: any = await this.perfilCompleto(dni);
      const userPosition = rawResponse[0];
      const userDataPre= userPosition["Json"];
      const userData = JSON.parse(userDataPre);     

      console.log('esta es la respuesta al obtener persona por dni',userData);

      const loginVacio =
  !Array.isArray(userData.Login) || userData.Login.length === 0;

const usuarioNoRegistrado =
  userData.Login?.[0]?.Usuario_Registrado === false;

console.log('Login vacío:', loginVacio);
console.log('Usuario no registrado:', usuarioNoRegistrado);

if (loginVacio) {
  return {
    ok: true,
    userData,
  };
}

if (
  usuarioNoRegistrado &&
  userData.Login?.[0]?.login_email === email &&
  userData.Login?.[0]?.celular === telefono
) {
  return {
    ok: true,
    userData,
  };
}

return { ok: false }; 
  }

  async postEncuesta(id: number, servicio: number, atencion: number) {
    console.log(id, servicio, atencion);
    
    try {
      const response:any = await this.prismaService.$queryRaw`
        EXEC log_Encuesta_IN
                               @Personas_Id = ${id},
                              @califica_servicio = ${servicio}, 
                              @califica_atencion =${atencion}
      `;
      return { ok:true }      
    } catch (error) {
      console.log(error);
      return new BadRequestException(error);      
    }
  }

  async obtenerPersonaPorDniRecoveryPass(dni: string, email:string, telefono:string): Promise<any> {
    const rawResponse: any = await this.perfilCompleto(dni);
      const userPosition = rawResponse[0];
      const userDataPre= userPosition["Json"];
      const userData = JSON.parse(userDataPre);     

      if (userData.Login[0]?.login_email === email && userData.Login[0]?.celular === telefono) {         
         return {
          ok: true,
          userData
         }
      }
      return { 
        ok:false          
      };      
  }

  async resetPass(id: number, password: string) {
      const passHash = await bcrypt.hash(password, 10);
      console.log("password hasheado", passHash, id);

        const rows = await this.prismaService.$queryRaw<any[]>`
          EXEC dbo.sp_sis_Usuarios_Hash_AC
            @Personas_Id = ${id},
            @Pass_Hash   = ${passHash}
        `;

        const row = rows?.[0];
        if (!row) return { ok: false, code: null, message: 'Sin filas del SP' };

        // toma el primer valor de la fila (la columna no tiene nombre)
        let val: unknown = Object.values(row)[0];
        if (val instanceof Buffer) val = val.toString('utf8');

        let str = String(val ?? '').trim().replace(/^\uFEFF/, ''); // quita BOM

        // des-escapa si viene entrecomillado (puede necesitar 1 o 2 pasadas)
        for (let i = 0; i < 2; i++) {
          if (str.startsWith('"') && str.endsWith('"')) {
            try { str = JSON.parse(str); } catch { break; }
          }
        }

        // si es el fragmento sin llaves, envuélvelo
        if (str && !/^\s*\{/.test(str) && /"Codigo"\s*:/.test(str)) {
          str = `{${str}}`;
        }

        let payload: any = null;
        try { payload = JSON.parse(str); } catch { /* sigue abajo */ }

        if (!payload) {
          // último intento: extraer con regex
          const codeM = /"Codigo"\s*:\s*"?(?<code>-?\d+)/i.exec(str);
          const msgM  = /"Mensaje"\s*:\s*"(?<msg>[^"]*)/i.exec(str);
          const code  = codeM ? Number(codeM.groups!.code) : null;
          const msg   = msgM ? msgM.groups!.msg : '';
          return { ok: code != null ? code > 0 : false, code, message: msg, raw: str };
        }

        const code = Number(payload.Codigo ?? payload.codigo ?? payload.Code ?? payload.code);
        const message = String(payload.Mensaje ?? payload.mensaje ?? payload.Message ?? payload.message ?? '');

        return {
          ok: Number.isFinite(code) ? code > 0 : false,
          code: Number.isFinite(code) ? code : null,
          message,
        };

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

  async saveImage(file: Express.Multer.File, personasId: number) {
  const pool = await sql.connect(sqlConfig);

  try {
    // ✅ Verificación de rostro visible, completo y confiable
    const isValid = await this.awsRekognitionService.validateSingleFaceVisible(file.buffer);
    

    if (!isValid) {
      return {
        ok: false,
        status: 'error',
        message: 'Intente nuevamente. La imagen debe mostrar su rostro completo, claro y sin obstrucciones.',
      };
    }

    // ✅ Guardar imagen en la base de datos
    const request = pool.request();
    request.input('Personas_Id', sql.Int, personasId);
    request.input('Foto_1', sql.VarBinary(sql.MAX), file.buffer);
    request.input('Activo', sql.Bit, true);

    const result = await request.execute('sp_Personas_foto_IN');
    console.log("Este es lo que devuelve el procedimiento al hacer foto", result)

    return {
      ok: true,
      message: 'Imagen guardada correctamente',
      dbResponse: result.recordset,
    };
  } catch (err) {
    console.error('Error al guardar la imagen con mssql:', err);
    throw new Error('No se pudo guardar la imagen.');
  } finally {
    await pool.close();
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

  async checkAuthStatus(user: { id: number; dni: string }) {
  const rawResponse = await this.perfilCompleto(user.dni);
  const userPosition = rawResponse[0];
  const userDataPre = userPosition["Json"];
  const userData = JSON.parse(userDataPre);

  return {
    ok: true,
    token: this.getJWT({ id: user.id, dni: user.dni }),
    userData,
  };
}

  // En tu auth.service.ts
// En tu auth.service.ts
async getProfileImage(id: number): Promise<Buffer> {
   // Usa $queryRaw con template literals etiquetados
     const result = await this.prismaService.$queryRaw`
      EXEC sp_Personas_foto_OU @Personas_Id = ${id};
   ` as any[];
   if (!result || result.length === 0 || !result[0].Foto) {
   throw new NotFoundException('Imagen no encontrada');
   }
   return result[0].Foto;
}
          
  

  
}
