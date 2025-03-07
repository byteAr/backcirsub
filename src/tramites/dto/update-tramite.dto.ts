import { PartialType } from '@nestjs/mapped-types';
import { CreateTramiteDto } from './create-tramite.dto';
import { Transform } from 'class-transformer';
import { IsString, IsDate, IsInt, IsBoolean, Min, IsOptional } from 'class-validator';

export class UpdateTramiteDto extends PartialType(CreateTramiteDto) {
    @IsString()
        detalle?: string;
    
        @IsOptional()
        @Transform(({ value }) => value ? new Date(value) : null)
        @IsDate()
        fechaInicio?: string;
    
        @IsOptional()
        @Transform(({ value }) => value ? new Date(value) : null)
        @IsDate() // Permite que sea opcional
        fechaFin?: string;
    
        @IsInt()
        @Min(1) // Asegura que sea un número positivo
        tipoPerioricidad?: number;
    
        @IsInt()
        @Min(1)
        prioridad?: number;
    
        @IsInt()
        @Min(1)
        idTramitesGrupo: number;
    
        @IsBoolean()
        activo?: boolean;
    
        @IsOptional()
        @Transform(({ value }) => value ? new Date(value) : null)
        @IsDate()
        fechaCreacion: string;
    
        @IsInt()
        @Min(1)
        personaIdCreacion: number;
}
