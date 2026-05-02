import {
  Body,
  Controller,
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
import { GetUser } from '../auth/decorators/get-user.decorator';

@Controller('admin-notifications')
export class AdminNotificationsController {
  constructor(private readonly service: AdminNotificationsService) {}

  @Get('permissions/:dni')
  getPermission(@Param('dni') dni: string) {
    return this.service.getPermission(dni);
  }

  @Post('permissions')
  @UseGuards(AuthGuard())
  addPermission(
    @GetUser() user: { id: number; dni: string },
    @Body('dni') dni: string,
  ) {
    return this.service.addPermission(dni, user.dni);
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
