import { IsDate, IsInt, IsString } from "class-validator";

export class createResponsableDto {
    @IsInt()
    idTramite: number;
    @IsInt()
    idResposable: number;
    @IsString()
    emailResponsable: string;
    @IsString()
    fechaAvisoEmail: string
}