import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AdminNotificationsService } from './admin-notifications.service';
import { SendAdminNotifDto } from './dto/send-admin-notif.dto';
import { SendAllAdminNotifDto } from './dto/send-all-admin-notif.dto';
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('admin-notifications')
export class AdminNotificationsController {
  constructor(private readonly service: AdminNotificationsService) {}

  @Get('permissions/:dni')
  getPermission(@Param('dni') dni: string) {
    return this.service.getPermission(dni);
  }

  @Get('permissions')
  @UseGuards(AuthGuard())
  listPermissions() {
    return this.service.listPermissions();
  }

  @Post('permissions')
  @UseGuards(AuthGuard())
  addPermission(
    @GetUser() user: { id: number; dni: string },
    @Body('dni') dni: string,
    @Body('nombre') nombre: string,
    @Body('apellido') apellido: string,
  ) {
    return this.service.addPermission(dni, user.dni, nombre ?? '', apellido ?? '');
  }

  @Delete('permissions/:dni')
  @UseGuards(AuthGuard())
  removePermission(
    @GetUser() user: { id: number; dni: string },
    @Param('dni') dni: string,
  ) {
    return this.service.removePermission(dni, user.dni);
  }

  @Get('search')
  @UseGuards(AuthGuard())
  searchByDni(@Query('dni') dni: string) {
    return this.service.searchByDni(dni);
  }

  @Post('send')
  @UseGuards(AuthGuard())
  sendNotification(
    @GetUser() user: { id: number; dni: string },
    @Body() dto: SendAdminNotifDto,
  ) {
    return this.service.sendNotification(dto, user.dni);
  }

  /** Cuánta gente recibiría un envío masivo, para mostrarlo antes de mandar. */
  @Get('audiencia')
  @UseGuards(AuthGuard())
  contarAudiencia() {
    return this.service.contarAudiencia();
  }

  /** Envío a todos los asociados con la app. Sólo super admins. */
  @Post('send-all')
  @UseGuards(AuthGuard())
  sendToAll(
    @GetUser() user: { id: number; dni: string },
    @Body() dto: SendAllAdminNotifDto,
  ) {
    return this.service.sendNotificationToAll(dto, user.dni);
  }

  @Get('messages/:userId')
  @UseGuards(AuthGuard())
  getMessages(@Param('userId', ParseIntPipe) userId: number) {
    return this.service.getMessages(userId);
  }

  @Post('messages/:userId/mark-read')
  @UseGuards(AuthGuard())
  markRead(@Param('userId', ParseIntPipe) userId: number) {
    return this.service.markRead(userId);
  }
}
