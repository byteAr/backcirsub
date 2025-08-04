import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // 👈 Importa esto
import { AwsRekognitionService } from './aws-rekognition.service';

@Module({
  imports: [ConfigModule],
  providers: [AwsRekognitionService],
  exports: [AwsRekognitionService],
})
export class AwsModule {}