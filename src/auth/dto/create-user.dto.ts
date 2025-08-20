import { IsEmail, isNumber, IsNumber, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateUserDto {

    

    @IsString()
    email: string;


    @IsString()
    @MinLength(8)
    dni: string;

    @IsString()
    @MinLength(8)
    telefono: string

    @IsString()
    @MinLength(6)
    @MaxLength(50)
    @Matches(
        /(?:(?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
        message: 'The password must have a Uppercase, lowercase letter and a number'
    })
    password: string;
    

}