import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from 'src/prisma/prisma.module';

import { RedisModule } from '../redis/redis.module';
import { TwilioModule } from '../twilio/twilio.module';
import { JwtStrategy } from './strategies/jwt.strategy';

import { MulterModule } from '@nestjs/platform-express';
import { AwsModule } from '../aws/aws.module';;

@Module({
  imports:[PrismaModule, RedisModule, TwilioModule, ConfigModule, AwsModule,
     PassportModule.register( {defaultStrategy: 'jwt'} ),
     JwtModule.registerAsync({
      imports:[ ConfigModule],
      inject:[],
      useFactory: () => {
        
        return {
          secret: process.env.JWT_SECRET,
          signOptions: {
            expiresIn: '2h'
          }
        }
      }
     }),
     MulterModule.register({
      limits: { fileSize: 10 * 1024 * 1024 }, // 5MB, opcional
    }),
    //  JwtModule.register({
    //   secret: process.env.JWT_SECRET,
    //   signOptions: {
    //     expiresIn: '2h'
    //   }
    //  })
    ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtStrategy, PassportModule, JwtModule],
})
export class AuthModule {}
