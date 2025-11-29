import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { JwtPayload } from "../interfaces/jwt-payload.interface";
import { PrismaService } from "src/prisma/prisma.service";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {

  constructor(
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService
  ) {
    super({
      secretOrKey: configService.get('JWT_SECRET'),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
    });
  }

  // ESTE MÉTODO SE EJECUTA EN CADA REQUEST PROTEGIDO
  async validate(payload: JwtPayload): Promise<any> {
    const { id, dni } = payload;

    // (Opcional) Verificás que el usuario exista / no esté bloqueado.
    // Si no te interesa chequear en BD, podés comentar todo este bloque.
    const user: any[] = await this.prismaService.$queryRaw`
      EXEC sp_Login @Documento = ${dni};
    `;

    if (!user || user.length === 0) {
      throw new UnauthorizedException('Token not valid');
    }

    // NO parseamos JSON aquí, devolvemos solo info mínima.
    // Esto es lo que llega como req.user en tus controladores.
    return {
      id,
      dni,
    };
  }
}
