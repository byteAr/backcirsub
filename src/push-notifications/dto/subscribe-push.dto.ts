import { Type } from 'class-transformer';
import { IsInt, IsObject, IsString, ValidateNested } from 'class-validator';

class PushKeysDto {
  @IsString()
  p256dh: string;

  @IsString()
  auth: string;
}

export class SubscribePushDto {
  @IsInt()
  userId: number;

  @IsString()
  endpoint: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  @IsObject()
  keys: PushKeysDto;
}
