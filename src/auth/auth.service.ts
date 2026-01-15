import { BadRequestException, HttpException, Injectable, InternalServerErrorException, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
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
  password: 'Margen.25',
  server: '192.168.1.3',
  port: 1433,
  database: 'CIRSUB',
  options: {
    encrypt: false,
    trustServerCertificate: true,
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

  constructor(
    private prismaService: PrismaService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
    private readonly awsRekognitionService: AwsRekognitionService,
  ) { }

  // --- MÉTODOS DE LOGIN Y REGISTRO (CON VALIDACIONES DE SEGURIDAD) ---

  async login(loginUserDto: LoginUserDto, ip?: string) {
    const { dni, password } = loginUserDto;

    try {
      if (!dni || !password) throw new BadRequestException('DNI y contraseña son obligatorios');

      const users: any[] = await this.prismaService.$queryRaw`EXEC sp_Login @Documento = ${dni};`;

      if (!users || users.length === 0) {
        await this.registrarLog('USUARIOS', 'WARN', 'Login usuario', `Usuario no encontrado: ${dni}`, null, ip);
        throw new UnauthorizedException({ ok: false, message: 'Credenciales inválidas' });
      }

      const user = users[0];
      const passwordHasheado = user.Pass_Hash;

      if (!passwordHasheado) throw new UnauthorizedException({ ok: false, message: 'El usuario no tiene contraseña' });

      const isMatch = await bcrypt.compare(password, passwordHasheado);
      if (!isMatch) {
        await this.registrarLog('USUARIOS', 'ERROR', 'Login usuario', `Password incorrecto: ${dni}`, null, ip);
        throw new UnauthorizedException({ ok: false, message: 'Credenciales inválidas' });
      }

      const rawResponse = await this.perfilCompleto(dni);
      if (!rawResponse || rawResponse.length === 0 || !rawResponse[0]['Json']) {
        throw new NotFoundException('No se encontraron datos de perfil detallados');
      }

      const userData = JSON.parse(rawResponse[0]['Json']);
      const token = this.getJWT({ id: userData.Persona[0].Id, dni });

      await this.registrarLog('USUARIOS', 'INFO', 'Login usuario', `Login OK: ${dni}`, dni, ip);

      return { ok: true, token, userData };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Error Login: ${error.message}`);
      throw new InternalServerErrorException('Error al iniciar sesión');
    }
  }

  async register(createUserDto: CreateUserDto): Promise<any> {
    const { dni, password } = createUserDto;
    try {
      const rawResponse = await this.perfilCompleto(dni);
      if (!rawResponse?.length || !rawResponse[0]['Json']) throw new NotFoundException('DNI no registrado');

      const userData = JSON.parse(rawResponse[0]['Json']);
      const persona = userData.Persona[0];
      const passwordHash = await bcrypt.hash(password, 10);

      const registerResult: any[] = await this.prismaService.$queryRaw`
        EXEC sp_sis_Usuarios_Hash_AC @Personas_Id = ${persona.Id}, @Pass_Hash = ${passwordHash};
      `;

      if (!registerResult?.length) throw new InternalServerErrorException('Error BD Registro');

      const firstRow = registerResult[0];
      const spResponse = JSON.parse(firstRow[Object.keys(firstRow)[0]]) as SpHashResponse;

      if (!spResponse.ok) throw new BadRequestException(spResponse.mensaje);

      return { ok: true, token: this.getJWT({ id: persona.Id, dni }), userData };
    } catch (error: any) {
      if (error instanceof HttpException) throw error;
      throw new InternalServerErrorException('Error en registro');
    }
  }

  // --- MÉTODOS RESTAURADOS (Los que daban error en el Controller) ---

  async resetPass(id: number, password: string) {
    const passHash = await bcrypt.hash(password, 10);
    const rows = await this.prismaService.$queryRaw<any[]>`
      EXEC dbo.sp_sis_Usuarios_Hash_AC @Personas_Id = ${id}, @Pass_Hash = ${passHash}
    `;

    const row = rows?.[0];
    if (!row) return { ok: false, message: 'Sin respuesta de base de datos' };

    let val: any = Object.values(row)[0];
    if (val instanceof Buffer) val = val.toString('utf8');
    let str = String(val ?? '').trim().replace(/^\uFEFF/, '');

    try {
        const payload = JSON.parse(str);
        const code = Number(payload.Codigo ?? payload.codigo ?? 0);
        return { ok: code > 0, code, message: payload.Mensaje || payload.mensaje };
    } catch {
        return { ok: false, message: 'Error parseando respuesta del SP' };
    }
  }

  async prueba(Documento: string) {
    return await this.prismaService.$executeRaw`EXEC sp_Perfil_completo @Documento = ${Documento}`;
  }

  async getContactUser(id: number) {
    return await this.prismaService.$queryRaw`EXEC Personas_Contacto_OU @Id = ${id};`;
  }

  async obtenerPersonaPorDniRecoveryPass(dni: string, telefono: string): Promise<any> {
    const rawResponse = await this.perfilCompleto(dni);
    if (!rawResponse?.length || !rawResponse[0]['Json']) return { ok: false };
    const userData = JSON.parse(rawResponse[0]["Json"]);

    if (userData.Login?.[0]?.celular === telefono) {
      return { ok: true, userData };
    }
    return { ok: false };
  }

  async updateImage(file: Express.Multer.File, personasId: number) {
    if (!file) throw new BadRequestException('No se recibió archivo.');
    try {
      const result = await this.prismaService.$executeRaw`
        EXEC Personas_foto_AC @Personas_Id = ${personasId}, @Foto_1 = ${file.buffer};
      `;
      return { message: 'Imagen guardada correctamente', dbResponse: result };
    } catch (error) {
      throw new InternalServerErrorException('No se pudo actualizar la imagen.');
    }
  }

  // --- OTROS MÉTODOS DE APOYO ---

  async perfilCompleto(Documento: string): Promise<any[]> {
    return await this.prismaService.$queryRaw<any[]>`EXEC sp_Perfil_completo_detallado @Documento = ${Documento};`;
  }

  private async registrarLog(modulo: string, tipo: 'INFO' | 'WARN' | 'ERROR', accion: string, observacion: string, usuario?: string | null, ip?: string | null) {
    try {
      await this.prismaService.$executeRaw`EXEC dbo.sp_sis_log_in @Modulo=${modulo}, @Tipo=${tipo}, @Accion=${accion}, @Observacion=${observacion}, @Usuario=${usuario}, @Ip=${ip};`;
    } catch {}
  }

  private getJWT(payload: JwtPayload) { return this.jwtService.sign(payload); }

  async createPersona(persona: any) {
    const { nombre, apellido, dni, fechaNacimiento, tipodni } = persona;
    return await this.prismaService.$queryRaw`EXEC dbo.Personas_IN @Tipo_Documento=${tipodni.Id}, @Documento=${dni}, @Apellido=${apellido}, @Nombre=${nombre}, @Fecha_Nacimiento=${fechaNacimiento}, @Activo=${false}`;
  }

  generateOtp(): string { return Math.floor(1000 + Math.random() * 9000).toString(); }

  async saveOtp(phoneNumber: string, otp: string): Promise<void> {
    await this.redisService.set(`otp:${phoneNumber}`, otp, this.OTP_EXPIRATION_SECONDS);
  }

  async verifyOtp(phoneNumber: string, otp: string): Promise<boolean> {
    const key = `otp:${phoneNumber}`;
    const storedOtp = await this.redisService.get(key);
    if (storedOtp === otp) { await this.redisService.del(key); return true; }
    return false;
  }

  async obtenerPersonaPorDni(dni: string, telefono: string): Promise<any> {
    const rawResponse = await this.perfilCompleto(dni);
    if (!rawResponse.length) return { ok: false };
    const userData = JSON.parse(rawResponse[0]["Json"]);
    const loginVacio = !Array.isArray(userData.Login) || userData.Login.length === 0;
    const usuarioNoRegistrado = userData.Login?.[0]?.Usuario_Registrado === false;

    if (loginVacio || (usuarioNoRegistrado && userData.Login?.[0]?.celular === telefono)) {
      return { ok: true, userData };
    }
    return { ok: false };
  }

  async postEncuesta(id: number, servicio: number, atencion: number) {
    await this.prismaService.$queryRaw`EXEC log_Encuesta_IN @Personas_Id=${id}, @califica_servicio=${servicio}, @califica_atencion=${atencion}`;
    return { ok: true };
  }

  async saveImage(file: Express.Multer.File, personasId: number) {
    const pool = await sql.connect(sqlConfig);
    try {
      const isValid = await this.awsRekognitionService.validateSingleFaceVisible(file.buffer);
      if (!isValid) return { ok: false, message: 'Rostro no detectado' };
      const request = pool.request();
      request.input('Personas_Id', sql.Int, personasId).input('Foto_1', sql.VarBinary(sql.MAX), file.buffer).input('Activo', sql.Bit, true);
      const result = await request.execute('sp_Personas_foto_IN');
      return { ok: true, dbResponse: result.recordset };
    } finally { await pool.close(); }
  }

  async getProfileImage(id: number): Promise<Buffer> {
    const result = await this.prismaService.$queryRaw`EXEC sp_Personas_foto_OU @Personas_Id = ${id};` as any[];
    if (!result?.length || !result[0].Foto) throw new NotFoundException('Imagen no encontrada');
    return result[0].Foto;
  }

  async checkAuthStatus(user: { id: number; dni: string }) {
    const rawResponse = await this.perfilCompleto(user.dni);
    const userData = JSON.parse(rawResponse[0]["Json"]);
    return { ok: true, token: this.getJWT({ id: user.id, dni: user.dni }), userData };
  }
}