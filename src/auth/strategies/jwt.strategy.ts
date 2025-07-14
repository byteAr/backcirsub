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
    ){
        super({
            secretOrKey: configService.get('JWT_SECRET'),
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()
        });
    }

   async validate(peyload: JwtPayload): Promise<any> {
    const {id, dni}  = peyload
    
    const User: any[] = await this.prismaService.$queryRaw`
        EXEC sp_Perfil_completo @Documento = ${dni};
      `;

      const userLogin = User[0];
      const userLoginB = userLogin["JSON_F52E2B61-18A1-11d1-B105-00805F49916B"];
      const userBParseado = JSON.parse(userLoginB)      

    if(!User) {
        throw new UnauthorizedException('Token not valid')
    }   
    
    return userBParseado
   }
}