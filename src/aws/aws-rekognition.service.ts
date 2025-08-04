import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LandmarkType } from '@aws-sdk/client-rekognition';
import {
  RekognitionClient,
  DetectFacesCommand,
  DetectFacesCommandOutput,
} from '@aws-sdk/client-rekognition';

@Injectable()
export class AwsRekognitionService {
  private rekognitionClient: RekognitionClient;

  constructor(private readonly configService: ConfigService) {
    this.rekognitionClient = new RekognitionClient({
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.configService.get<string>('aws.rekognitionAccessKey'),
        secretAccessKey: this.configService.get<string>('aws.rekognitionSecretKey'),
      },
    });
  }

  // Método reutilizable
   async detectFaces(imageBuffer: Buffer): Promise<DetectFacesCommandOutput> {
    const command = new DetectFacesCommand({
      Image: { Bytes: imageBuffer },
      Attributes: ['ALL'],
    });
    return await this.rekognitionClient.send(command);
  }

  // Método más específico si solo quieres verificar 1 rostro
  async validateSingleFace(imageBuffer: Buffer): Promise<boolean> {
    const result = await this.detectFaces(imageBuffer);
    return (result.FaceDetails?.length || 0) === 1;
  }

  async validateSingleFaceVisible(imageBuffer: Buffer): Promise<boolean> {
  const result = await this.detectFaces(imageBuffer);
  if (!result.FaceDetails || result.FaceDetails.length !== 1) return false;

  const face = result.FaceDetails[0];

  // Confianza básica
  if ((face.Confidence ?? 0) < 90) return false;

  // Cantidad mínima de landmarks detectados
  if ((face.Landmarks?.length || 0) < 10) return false;

  // Nitidez y brillo
  if ((face.Quality?.Sharpness ?? 0) < 80) return false;
  if ((face.Quality?.Brightness ?? 0) < 60) return false;

  // Rechazar caras mal orientadas
  const { Roll = 0, Yaw = 0, Pitch = 0 } = face.Pose || {};
  if (Math.abs(Roll) > 20 || Math.abs(Yaw) > 20 || Math.abs(Pitch) > 20) return false;

  return true;
}

}
