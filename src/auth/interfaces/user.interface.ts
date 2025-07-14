export interface UserData {
    Persona:     Persona[];
    Socio:       any[];
    Personal:    Personal[];
    GpoFamiliar: any[];
    Beneficios:  Beneficio[];
}

export interface Beneficio {
    Id:                         number;
    afi_Tipo_Beneficio_Detalle: string;
    Beneficio?:                 number;
    Activo?:                    boolean;
}

export interface Persona {
    Id:        number;
    Documento: string;
    Apellido:  string;
    Nombre:    string;
}

export interface Personal {
    Id:                 number;
    Tipo_Area:          number;
    Tipo_Cargo:         number;
    Filial_Id:          number;
    Filial_Detalle:     string;
    Tipo_Cargo_Detalle: string;
    es_Encargado_Area:  boolean;
}
