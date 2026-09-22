import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { CreateCredencialDto } from './dto/create-credencial.dto';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { UpdateCredencialDto } from './dto/update-credencial.dto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';
import { buildGestionApiKey } from '../common/gestion-api-key';

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

  /** Delega en el helper compartido con reintegros, para no duplicar la clave. */
  private buildApiKey(): string {
    const key = buildGestionApiKey();
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

    // Al navegador sólo le sirve saber si quedó hecho. Antes se devolvía
    // también la API key de gestión (debugKey) y la respuesta o el error crudo
    // del PHP, que en un error de axios trae los headers del pedido: otra vez
    // la key. El detalle queda en el log de arriba.
    return { ok, sqlServer: sqlOk, mariaDb: mariaOk };
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

    // Sin el mensaje del error: puede traer detalles de la base o del PHP.
    return {
      ok: false,
      message: 'Error inesperado durante la actualización de CBU',
    };
  }
}




  async getCbu(id: number) {
    try {
      const response: any = await this.prismaService.$queryRaw`
        EXEC sp_Personas_Cuentas_banco_CBU_OU @Personas_Id = ${id}
      `;

      return response[0];
    } catch (error) {
      // Antes devolvía el error tal cual, con detalles de la base, y con
      // status 200. Ahora se loguea y el cliente recibe un 500 genérico.
      console.error('Error al obtener el CBU de Personas_Id=' + id, error);
      throw new InternalServerErrorException('No pudimos obtener su CBU. Intente nuevamente en unos minutos.');
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
