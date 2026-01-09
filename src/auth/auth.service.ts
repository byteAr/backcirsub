import { BadRequestException, HttpException, Injectable, InternalServerErrorException, Logger, NotFoundException, UnauthorizedException  } from '@nestjs/common';
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

interface SpHashResponse {
  ok: boolean;
  codigo: number;
  mensaje: string;
  http: number;
  ts: string;
  id: number;
}

@Injectable()
export class AuthService {
  

  private readonly OTP_EXPIRATION_SECONDS = 20 * 60;

  private readonly logger = new Logger(AuthService.name);
  
  constructor(private prismaService:PrismaService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly awsRekognitionService: AwsRekognitionService,
   ){}

  async login(loginUserDto: LoginUserDto, ip?: string) {
    const { dni, password } = loginUserDto;

    try {
      // Validaciones básicas
      if (!dni || !password) {
        await this.registrarLog(
          'USUARIOS',
          'WARN',
          'Login usuario',
          `Intento de login con datos incompletos (dni o password vacío)`,
          null,
          ip,
        );
        throw new BadRequestException('DNI y contraseña son obligatorios');
      }

      // Llamada al SP de login
      const users: any[] = await this.prismaService.$queryRaw`
        EXEC sp_Login @Documento = ${dni};
      `;

      if (!users || users.length === 0) {
        await this.registrarLog(
          'USUARIOS',
          'WARN',
          'Login usuario',
          `Usuario no encontrado para documento ${dni}`,
          null,
          ip,
        );
        throw new UnauthorizedException({
          ok: false,
          message: 'Credenciales inválidas',
        });
      }

      const user = users[0];
      const passwordHasheado = user.Pass_Hash;

      // Comparación de password
      const isMatch = await bcrypt.compare(password, passwordHasheado);

      if (!isMatch) {
        await this.registrarLog(
          'USUARIOS',
          'ERROR',
          'Login usuario',
          `Password incorrecto para documento ${dni}`,
          null,
          ip,
        );
        throw new UnauthorizedException({
          ok: false,
          message: 'Credenciales inválidas',
        });
      }

      // Si el login es correcto, armamos el perfil
      const rawResponse = await this.perfilCompleto(dni);
      const userPosition = rawResponse[0];
      const userDataPre = userPosition['Json'];
      const userData = JSON.parse(userDataPre);

      const token = this.getJWT({
        id: userData.Persona[0].Id,
        dni,
      });

      // Log de éxito
      await this.registrarLog(
        'USUARIOS',
        'INFO',
        'Login usuario',
        `Login OK para documento ${dni}`,
        dni,
        ip,
      );

      return {
        ok: true,
        token,
        userData,
      };
    } catch (error: any) {
      // Si ya es una HttpException (BadRequest, Unauthorized, etc.), sólo logueamos y relanzamos
      if (error instanceof HttpException) {
        await this.registrarLog(
          'USUARIOS',
          'ERROR',
          'Login usuario',
          `Error controlado en login para documento ${dni}: ${error.message}`,
          dni ?? null,
          ip,
        );
        throw error;
      }

      // Error inesperado
      await this.registrarLog(
        'USUARIOS',
        'ERROR',
        'Login usuario',
        `Error inesperado en login para documento ${dni}: ${error?.message ?? error}`,
        dni ?? null,
        ip,
      );

      throw new InternalServerErrorException(
        'Ha ocurrido un error al intentar iniciar sesión',
      );
    }
  }

  /**
   * Envía el registro al SP de logging sp_sis_log_in
   */
  private async registrarLog(
    modulo: string,
    tipo: 'INFO' | 'WARN' | 'ERROR',
    accion: string,
    observacion: string,
    usuario?: string | null,
    ip?: string | null,
  ) {
    // Si no tenemos usuario o IP, dejamos que el SP los guarde como '' cuando recibe NULL
    const usuarioParam = usuario ?? null;
    const ipParam = ip ?? null;

    await this.prismaService.$executeRaw`
      EXEC dbo.sp_sis_log_in 
        @Modulo      = ${modulo},
        @Tipo        = ${tipo},
        @Accion      = ${accion},
        @Observacion = ${observacion},
        @Usuario     = ${usuarioParam},
        @Ip          = ${ipParam};
    `;
  }


  async perfilCompleto(Documento: string): Promise<any[]> {
    const userCompleto = await this.prismaService.$queryRaw<any[]>`
      EXEC sp_Perfil_completo_detallado @Documento = ${Documento};
    `;
    
    console.log('esto es lo que devuelve al consultar por el dni', userCompleto);

    return userCompleto;
  }

  private getJWT( payload: JwtPayload) {
    const token = this.jwtService.sign( payload );
    return token;
  } 



async register(createUserDto: CreateUserDto): Promise<any> {
  const { dni, password } = createUserDto;

  try {
    if (!dni || !password) {
      await this.registrarLog(
        'USUARIOS',
        'WARN',
        'Registro usuario',
        'Intento de registro con datos incompletos (dni o password vacío)',
        null,
        null,
      );
      throw new BadRequestException('DNI y contraseña son obligatorios');
    }

    const rawResponse = await this.perfilCompleto(dni);

    if (!rawResponse || rawResponse.length === 0) {
      await this.registrarLog(
        'USUARIOS',
        'WARN',
        'Registro usuario',
        `No se encontró información de persona en perfilCompleto para documento ${dni}`,
        dni,
        null,
      );
      throw new NotFoundException('Usuario no encontrado');
    }

    const userPosition = rawResponse[0];
    const userDataPre = userPosition['Json'];

    if (!userDataPre) {
      await this.registrarLog(
        'USUARIOS',
        'ERROR',
        'Registro usuario',
        `La respuesta de perfilCompleto no contiene el campo Json para documento ${dni}`,
        dni,
        null,
      );
      throw new InternalServerErrorException(
        'Error al obtener los datos del usuario',
      );
    }

    let userData: any;
    try {
      userData = JSON.parse(userDataPre);
    } catch (e) {
      await this.registrarLog(
        'USUARIOS',
        'ERROR',
        'Registro usuario',
        `Error parseando Json de perfilCompleto para documento ${dni}: ${(e as Error).message}`,
        dni,
        null,
      );
      throw new InternalServerErrorException(
        'Error al procesar los datos del usuario',
      );
    }

    if (
      !userData.Persona ||
      !Array.isArray(userData.Persona) ||
      userData.Persona.length === 0
    ) {
      await this.registrarLog(
        'USUARIOS',
        'ERROR',
        'Registro usuario',
        `Datos de persona inválidos para documento ${dni} (Persona vacío o inexistente)`,
        dni,
        null,
      );
      throw new InternalServerErrorException(
        'Los datos de la persona no están disponibles',
      );
    }

    const persona = userData.Persona[0];

    if (!persona.Documento || persona.Documento !== dni) {
      await this.registrarLog(
        'USUARIOS',
        'WARN',
        'Registro usuario',
        `El documento de persona (${persona.Documento}) no coincide con el DNI ingresado (${dni})`,
        dni,
        null,
      );
      throw new BadRequestException('Verifique los datos ingresados');
    }

    const id = persona.Id;

    // 1) Hashear password
    const passwordHash = await bcrypt.hash(password, 10);

    // 2) Llamar al SP que guarda el hash
    const registerResult: any[] = await this.prismaService.$queryRaw`
      EXEC sp_sis_Usuarios_Hash_AC
        @Personas_Id = ${id},
        @Pass_Hash   = ${passwordHash};
    `;

    console.log('Esto es lo que devuelve sp_sis_Usuarios_Hash_AC', registerResult);

    if (!registerResult || registerResult.length === 0) {
      await this.registrarLog(
        'USUARIOS',
        'ERROR',
        'Registro usuario',
        `sp_sis_Usuarios_Hash_AC no devolvió filas para documento ${dni}`,
        dni,
        null,
      );
      throw new InternalServerErrorException(
        'Error al registrar el usuario (sin respuesta de base de datos)',
      );
    }

    // La fila tiene una columna con nombre raro ('') que contiene el JSON:
    // { '': '{"ok":false,"codigo":-1,"mensaje":"Usuario no encontrado o dado de baja.",...}' }
    const firstRow = registerResult[0] as Record<string, any>;
    const firstColumnKey = Object.keys(firstRow)[0]; // suele ser ''
    const spJsonString = firstRow[firstColumnKey] as string;

    let spResponse: SpHashResponse;
    try {
      spResponse = JSON.parse(spJsonString) as SpHashResponse;
    } catch (e) {
      await this.registrarLog(
        'USUARIOS',
        'ERROR',
        'Registro usuario',
        `Error parseando respuesta de sp_sis_Usuarios_Hash_AC para documento ${dni}: ${(e as Error).message}`,
        dni,
        null,
      );
      throw new InternalServerErrorException(
        'Error al procesar la respuesta de base de datos',
      );
    }

    // 3) Analizar respuesta del SP (ok true/false)
    if (!spResponse.ok) {
      // Loguear error con el mensaje de la base
      await this.registrarLog(
        'USUARIOS',
        'ERROR',
        'Registro usuario',
        `Error al registrar hash para documento ${dni}. Mensaje BD: ${spResponse.mensaje} (código: ${spResponse.codigo})`,
        dni,
        null,
      );
      
      throw new InternalServerErrorException(spResponse.mensaje);
    }

    // Si ok === true -> éxito, logueamos registro correcto
    await this.registrarLog(
      'USUARIOS',
      'INFO',
      'Registro usuario',
      `Usuario registrado correctamente para documento ${dni}`,
      dni,
      null,
    );

    // 4) Generar token
    const token = this.getJWT({
      id,
      dni,
    });

    return {
      ok: true,
      token,
      userData,
    };
  } catch (error: any) {
    if (error instanceof HttpException) {
      await this.registrarLog(
        'USUARIOS',
        'ERROR',
        'Registro usuario',
        `Error controlado en registro para documento ${dni}: ${error.message}`,
        dni ?? null,
        null,
      );
      throw error;
    }

    await this.registrarLog(
      'USUARIOS',
      'ERROR',
      'Registro usuario',
      `Error inesperado en registro para documento ${dni}: ${
        error?.message ?? error
      }`,
      dni ?? null,
      null,
    );

    throw new InternalServerErrorException(
      'Ha ocurrido un error al intentar registrar el usuario',
    );
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

  async obtenerPersonaPorDni(dni: string, telefono:string): Promise<any> {
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

  async obtenerPersonaPorDniRecoveryPass(dni: string, telefono:string): Promise<any> {
    const rawResponse: any = await this.perfilCompleto(dni);
      const userPosition = rawResponse[0];
      const userDataPre= userPosition["Json"];
      const userData = JSON.parse(userDataPre);     

      if (userData.Login[0]?.celular === telefono) {         
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
