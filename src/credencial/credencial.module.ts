import { Module } from '@nestjs/common';
import { CredencialService } from './credencial.service';

import { HttpModule } from '@nestjs/axios';
import { CredencialController } from './credencial.controller';
import { PrismaModule } from 'src/prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports:[PrismaModule, AuthModule, HttpModule],
  controllers: [CredencialController],
  providers: [CredencialService],
})
export class CredencialModule {}
