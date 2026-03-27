import { Injectable } from '@nestjs/common';
import { CreateCredencialDto } from './dto/create-credencial.dto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { UpdateCredencialDto } from './dto/update-credencial.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';

@Injectable()
export class CredencialService {

  constructor( private prismaService:PrismaService,
    private readonly httpService: HttpService
   ){}


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

  private buildApiKey(): string {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    }).formatToParts(now);

    const dd = parts.find(p => p.type === 'day')!.value;
    const mm = parts.find(p => p.type === 'month')!.value;
    const yy = parts.find(p => p.type === 'year')!.value;

    const key = `api-key-tk-${dd}${mm}${yy}`;
    console.log('API KEY generada:', key);
    return key;
  }

async updateCbu(
  cbu: string | null,
  id: number,
  usuario?: string | null,
  ip?: string | null,
) {
  const apiUrl =
    'https://gestion.cirsubgn.org.ar/Cirsub/CirsubApp/Migrante/funciones/api-cbu.php';

  console.log('--- Iniciando actualización de CBU ---');
  console.log('ID Persona:', id);
  console.log('CBU recibido:', cbu);

  try {
    const [sqlResult, phpResult] = await Promise.allSettled([
      this.prismaService.$queryRaw`
        EXEC sp_Personas_Cuentas_banco_CBU_AC
          @Personas_Id = ${id},
          @cbu         = ${cbu}
      `,
      firstValueFrom(
        this.httpService.post(
          apiUrl,
          { userId: id, cbu: cbu ?? '' },
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-KEY': this.buildApiKey(),
            },
          },
        ),
      ),
    ]);

    // --------- SQL Server ----------
    const sqlOk = sqlResult.status === 'fulfilled';

    // --------- PHP / MariaDB ----------
    let mariaOk = false;
    let phpData: any = null;
    let phpError: any = null;

    if (phpResult.status === 'fulfilled') {
      const axiosRes = phpResult.value;

      // 👀 LOG COMPLETO DE LO QUE DEVUELVE PHP
      console.log('Respuesta PHP status:', axiosRes.status);
      console.log('Respuesta PHP headers:', axiosRes.headers);
      console.log('Respuesta PHP data:', axiosRes.data);

      phpData = axiosRes.data;
      // acá es donde decidimos si lo tomamos como OK
      mariaOk = phpData?.ok === 1 || phpData?.ok === true;
    } else {
      // 👀 LOG DEL ERROR SI FALLA LA REQUEST
      console.error('Error en request PHP/MariaDB:', phpResult.reason);
      phpError = phpResult.reason;
    }

    console.log('Resultado SQL Server ->', sqlOk);
    console.log('Resultado PHP/MariaDB ->', mariaOk);

    // ---------- LOG SQL Server ----------
    await this.registrarLog(
      'CBU',
      sqlOk ? 'INFO' : 'ERROR',
      'Actualización en SQL Server',
      sqlOk
        ? `OK actualizado CBU para ID=${id}`
        : `ERROR SQL Server -> ${
            sqlResult.status === 'rejected'
              ? String(sqlResult.reason)
              : 'Error desconocido'
          }`,
      usuario ?? null,
      ip ?? null,
    );

    // ---------- LOG PHP / MariaDB ----------
    await this.registrarLog(
      'CBU',
      mariaOk ? 'INFO' : 'ERROR',
      'Actualización en MariaDB',
      mariaOk
        ? `OK actualización remota PHP/MariaDB ID=${id}`
        : `ERROR PHP -> ${
            phpError
              ? String(phpError)
              : phpData
              ? JSON.stringify(phpData)
              : 'Sin datos de respuesta'
          }`,
      usuario ?? null,
      ip ?? null,
    );

    // ---------- RESULTADO FINAL ----------
    const ok = sqlOk && mariaOk;

    await this.registrarLog(
      'CBU',
      ok ? 'INFO' : 'WARN',
      'Resultado final actualización',
      ok
        ? `Actualización correcta en ambas bases para ID=${id}`
        : `Actualización incompleta. SQL=${sqlOk}, MariaDB=${mariaOk}`,
      usuario ?? null,
      ip ?? null,
    );

    // 👀 DEVOLVEMOS TAMBIÉN LO QUE VINO DE PHP PARA VERLO EN EL FRONT SI QUERÉS
    return {
      ok,
      sqlServer:
        sqlOk && sqlResult.status === 'fulfilled'
          ? Array.isArray(sqlResult.value)
            ? sqlResult.value[0]
            : sqlResult.value
          : null,
      mariaDb: phpData ?? phpError, // <- acá va literal lo que respondió o el error
      debugKey: this.buildApiKey(),
    };
  } catch (error: any) {
    console.error('❌ Error inesperado en updateCbu:', error);

    await this.registrarLog(
      'CBU',
      'ERROR',
      'Error inesperado',
      error?.message ?? 'Error desconocido',
      usuario ?? null,
      ip ?? null,
    );

    return {
      ok: false,
      message: 'Error inesperado durante la actualización de CBU',
      error: error?.message ?? error,
    };
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
}
