export interface LoginUser {
    Login:         Login[];
    LoginIntentos: LoginIntento[];
    LoginPermisos: LoginPermiso[];
}

export interface Login {
    Id:                 number;
    Personas_Id:        number;
    Pass_Hash:          string;
    Activo:             boolean;
    VALIDADO_:          boolean;
    Bloqueado:          boolean;
    Intentos_Fallidos:  number;
    Fecha_Creacion:     Date;
    Fecha_Cambio_Clave: Date;
}

export interface LoginIntento {
    sis_Usuarios_Id:   number;
    Intento_Fecha:     Date;
    Intento_IPAddress: string;
    Intento_ok:        boolean;
}

export interface LoginPermiso {
    sis_Modulos_Id:      number;
    sis_Permisos_id:     number;
    sis_Usuarios_id:     number;
    sis_Modulos_Detalle: string;
    Descripcion:         string;
}
