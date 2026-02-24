import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PushNotificationsService } from './push-notifications.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

@Controller('push')
export class PushNotificationsController {
  constructor(private readonly pushService: PushNotificationsService) {}

  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.pushService.getVapidPublicKey() };
  }

  @Post('subscribe')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard())
  subscribe(@Body() dto: SubscribePushDto) {
    return this.pushService.saveSubscription(dto);
  }

  @Post('send')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard())
  sendToUser(
    @Body('userId') userId: number,
    @Body('title') title: string,
    @Body('body') body: string,
    @Body('url') url?: string,
  ) {
    return this.pushService.sendPushToUser(userId, title, body, url);
  }
}
