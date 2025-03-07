import { Transform } from 'class-transformer';
import { IsString, IsDate, IsInt, IsBoolean, Min, IsOptional } from 'class-validator';

export class CreateTramiteDto {
    @IsString()
    detalle: string;

    @IsString()
    fechaInicio: string;

    @IsOptional()
    @IsString() // Permite que sea opcional
    fechaFin?: string;

    @IsInt()
    @Min(1) // Asegura que sea un número positivo
    tipoPerioricidad: number;

    @IsInt()
    @Min(1)
    prioridad: number;

    @IsInt()
    @Min(1)
    idTramitesGrupo: number;

    @IsBoolean()
    activo: boolean;

    @IsString()
    fechaCreacion: string;

    @IsInt()
    @Min(1)
    personaIdCreacion: number;
}
