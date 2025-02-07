import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginUserDto } from './dto/login-user.dto';

@Injectable()
export class AuthService {

  login(loginUserDto: LoginUserDto) {
    return loginUserDto;
  }

  register(createUserDto: CreateUserDto) {
    return `This action returns all auth`;
  }

  
}
