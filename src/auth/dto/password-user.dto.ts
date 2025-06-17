import { IsNumber, IsString } from "class-validator";

export class passwordUser {

    @IsNumber()
    id: number;
    @IsString()
    password: string
}