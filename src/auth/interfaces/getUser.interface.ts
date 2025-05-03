export interface User {
    Id:                   number;
    Tipo_Documento:       number;
    Documento:            string;
    Apellido:             string;
    Nombre:               string;
    Fecha_Nacimiento:     Date;
    Activo:               boolean;
    ULTIMA_MODIFICACION_: Date;
    BORRADO_:             null;
    Personas_Contacto:    PersonasContacto[];
}

export interface PersonasContacto {
    Id:                   number;
    Personas_Id:          number;
    Contacto_Tipo:        number;
    Detalle:              string;
    Observaciones:        string;
    ULTIMA_MODIFICACION_: Date;
    BORRADO_:             null;
}
