/*
  Corrige el "hoy" de las funciones de fechas.

  La base corre en UTC (ver docs/fechas-y-zona-horaria.md), así que
  CONVERT(date, GETDATE()) devuelve el día UTC. Entre las 21:00 y la
  medianoche de Argentina ese día ya es el siguiente, y en esa franja:

    - fn_en_fecha y fn_vigente daban por vigente algo que arranca mañana, y
      por vencido algo que vence hoy;
    - fn_fecha_siguiente y fn_fecha_siguiente_tramite devolvían NULL o corrían
      un día el cálculo del próximo vencimiento.

  La solución no toca ni un dato guardado: sólo cambia cómo se calcula "hoy".
  Se concentra en dbo.fn_hoy_ar() para que el día que Argentina vuelva a tener
  horario de verano haya un solo lugar que revisar.

  Aplicar primero en la instancia de pruebas (puerto 1435). El rollback está en
  99-rollback.sql, con las definiciones tal como estaban el 23/09/2026.
*/

SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------------------
   1. El "hoy" de Argentina, en un solo lugar
   --------------------------------------------------------------------------- */
CREATE OR ALTER FUNCTION [dbo].[fn_hoy_ar]()
RETURNS date
AS
BEGIN
    -- SYSDATETIMEOFFSET() trae el instante con su offset, así que alcanza con
    -- pasarlo a la zona de Argentina. GETDATE() no sirve acá: no dice de qué
    -- zona es, y en este servidor es UTC.
    RETURN CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Argentina Standard Time' AS date);
END;
GO

/* ---------------------------------------------------------------------------
   2. Funciones que dependían del día UTC
   --------------------------------------------------------------------------- */

CREATE OR ALTER FUNCTION [dbo].[fn_en_fecha]
(
    @desde date,
    @hasta date
)
RETURNS bit
AS
BEGIN
    DECLARE @hoy date = dbo.fn_hoy_ar();

    -- Tratar '1900-01-01' como NULL (sin fecha válida)
    DECLARE @desde_eff date = NULLIF(@desde, '19000101');
    DECLARE @hasta_eff date = NULLIF(@hasta, '19000101');

    RETURN
    (
        SELECT CASE
                 -- si no hay fecha desde válida => no vigente
                 WHEN @desde_eff IS NULL THEN 0

                 -- todavía no empezó la vigencia
                 WHEN @hoy < @desde_eff THEN 0

                 -- si hay fecha hasta y ya la pasó => no vigente
                 WHEN @hasta_eff IS NOT NULL AND @hoy > @hasta_eff THEN 0

                 -- en cualquier otro caso, está vigente
                 ELSE 1
               END
    );
END;
GO

CREATE OR ALTER FUNCTION [dbo].[fn_vigente]
(
    @desde     date,
    @hasta     date = NULL   -- NULL = abierto (sin fecha de fin)
)
RETURNS bit
AS
BEGIN
    DECLARE @hoy date = dbo.fn_hoy_ar();

    RETURN
    (
        SELECT CASE
            WHEN @desde IS NULL THEN NULL            -- ajusta a 0 si lo prefieres
            WHEN @desde <= @hoy
                 AND ( @hasta IS NULL OR @hasta >= @hoy ) THEN 1
            ELSE 0
        END
    );
END;
GO

/*
    Nombre: fn_fecha_siguiente
    Tipo: Función Escalar
    Descripción: devuelve la siguiente fecha calculada a partir de una fecha y perioricidad dada.

    Parámetros:
        @fecha_inicial (DATE): fecha a partir de la cual calcular la siguiente fecha.
        @perioricidad (int):
                        10=diario
                        20=semanal
                        30=quincenal
                        40=mensual
                        50=bimestral
                        60=semestral
                        70=anual

    Retorno:
        Devuelve fecha calculada segun fecha de inicio y perioricidad solicitada.

    Ejemplo:
        -- Llamada a la función con parámetros válidos
        SELECT * FROM dbo.fn_fecha_siguiente('01/05/2025', 40);
                --devuelve '01/06/2025'

    Notas:
        - Si @fecha_inicial no es una fecha válida devuelve NULL.
        - Si @perioricidad no es válida devuelve NULL.
        - "Hoy" sale de dbo.fn_hoy_ar(): el servidor corre en UTC y usar
          GETDATE() adelantaba el día entre las 21:00 y la medianoche.
*/
CREATE OR ALTER FUNCTION [dbo].[fn_fecha_siguiente]
(
    @fecha_inicial DATE,
    @periodicidad INT
)
RETURNS DATE
AS

BEGIN
        DECLARE @fecha_siguiente DATE;
        DECLARE @hoy DATE = dbo.fn_hoy_ar();
        set  @periodicidad = LOWER(@periodicidad)
    -- Verificar si la fecha inicial es válida
    IF @fecha_inicial IS NULL
    BEGIN
        -- Si la fecha no es válida, devolver NULL
        RETURN NULL;
    END

        IF @fecha_inicial > @hoy
    BEGIN
        -- Si la fecha inicial es mayor a la fecha actual, devolver NULL
        RETURN  NULL;
    END

    -- Evaluamos la periodicidad y calculamos la siguiente fecha
    IF @periodicidad = 10 --'diario'
    BEGIN
        declare @dif_dias INT = (SELECT DATEDIFF(DAY, @fecha_inicial , @hoy));
                SET @fecha_siguiente = (select DATEADD(DAY,@dif_dias+1, @fecha_inicial))
    END
        ELSE IF @periodicidad = 20 -- 'semanal'
    BEGIN
        -- Sumar 7 días
        declare @dif_semanal INT = (SELECT DATEDIFF(WEEK, @fecha_inicial , @hoy));
                SET @fecha_siguiente  = (select DATEADD(WEEK,@dif_semanal+1, @fecha_inicial))
    END

    ELSE IF @periodicidad = 30 --'quincenal'
    BEGIN
        -- Sumar 15 días
                declare @dif_quincenal INT = (SELECT DATEDIFF(DAY, @fecha_inicial , @hoy));
                SET @fecha_siguiente = (select DATEADD(DAY,@dif_quincenal+15, @fecha_inicial))

    END
    ELSE IF @periodicidad = 40 -- 'mensual'
    BEGIN
        -- Sumar un mes
        declare @dif_mensual INT = (SELECT DATEDIFF(MONTH, @fecha_inicial , @hoy));
                SET @fecha_siguiente = (select DATEADD(MONTH,@dif_mensual+1, @fecha_inicial))
    END
    ELSE IF @periodicidad = 50  --'bimestral'
    BEGIN
        -- Sumar dos meses
        declare @dif_bimestral INT = (SELECT DATEDIFF(MONTH, @fecha_inicial , @hoy));
                SET @fecha_siguiente = (select DATEADD(MONTH,@dif_bimestral+2, @fecha_inicial))
    END
        ELSE IF @periodicidad = 60  --'semestral'
    BEGIN
        -- Sumar seis meses
                declare @dif_semestral INT = (SELECT DATEDIFF(MONTH, @fecha_inicial , @hoy));
                SET @fecha_siguiente = (select DATEADD(MONTH,@dif_semestral+6, @fecha_inicial))
        END
    ELSE IF @periodicidad = 70 -- 'anual'
    BEGIN
        -- Sumar un año
                declare @dif_anual INT = (SELECT DATEDIFF(YEAR, @fecha_inicial , @hoy));
                SET @fecha_siguiente = (select DATEADD(YEAR,@dif_anual+1, @fecha_inicial))
    END
    ELSE
    BEGIN
        -- Si la periodicidad no es válida, devolvemos NULL
        SET @fecha_siguiente = NULL;
    END

    -- Devolvemos la siguiente fecha calculada

    RETURN @fecha_siguiente;
END
GO

/*
    Nombre: fn_fecha_siguiente_tramite
    Tipo: Función Escalar
    Descripción: devuelve la siguiente fecha calculada a partir de un TRAMITE dado.

    Parámetros:
        @Tramite_Id (INT): ID de TRAMITES.
    Retorno:
        Devuelve fecha calculada segun fecha de inicio y perioricidad del TRAMITE.

    Ejemplo:
        -- Llamada a la función con parámetros válidos
        SELECT * FROM dbo.fn_fecha_siguiente_tramite(5);


    Notas:
        - Si @Tramites_Id es 0 devuelve NULL.
        - "Hoy" sale de dbo.fn_hoy_ar(): el servidor corre en UTC y usar
          GETDATE() adelantaba el día entre las 21:00 y la medianoche.
*/
CREATE OR ALTER FUNCTION [dbo].[fn_fecha_siguiente_tramite]
(
    @Tramites_Id int
)
RETURNS DATE
AS

BEGIN
        DECLARE @fecha_inicial DATE =  (select  t.Fecha_Inicio from Tramites t where t.id = @Tramites_Id and t.Activo=1  and t.BORRADO_ is null);
        DECLARE @fecha_siguiente DATE;
        DECLARE @periodicidad INT;
        DECLARE @hoy DATE = dbo.fn_hoy_ar();
        set  @periodicidad = (select  t.Tipo_Perioricidad from Tramites t where t.id = @Tramites_Id and t.Activo=1  and t.BORRADO_ is null);

    IF @fecha_inicial IS NULL
    BEGIN
        -- Si la fecha no es válida, devolver NULL
        RETURN NULL;
    END

        IF @fecha_inicial > @hoy
    BEGIN
        -- Si la fecha inicial es mayor a la fecha actual, devolver NULL
        RETURN  NULL;
    END

    -- Evaluamos la periodicidad y calculamos la siguiente fecha
    IF @periodicidad = 10 --'diario'
    BEGIN
        declare @dif_dias INT = (SELECT DATEDIFF(DAY, @fecha_inicial , @hoy));
                SET @fecha_siguiente = (select DATEADD(DAY,@dif_dias+1, @fecha_inicial))
    END
        ELSE IF @periodicidad = 20 -- 'semanal'
    BEGIN
        -- Sumar 7 días
        declare @dif_semanal INT = (SELECT DATEDIFF(WEEK, @fecha_inicial , @hoy));
                SET @fecha_siguiente  = (select DATEADD(WEEK,@dif_semanal+1, @fecha_inicial))
    END

    ELSE IF @periodicidad = 30 --'quincenal'
    BEGIN
        -- Sumar 15 días
                declare @dif_quincenal INT = (SELECT DATEDIFF(DAY, @fecha_inicial , @hoy));
                SET @fecha_siguiente = (select DATEADD(DAY,@dif_quincenal+15, @fecha_inicial))

    END
    ELSE IF @periodicidad = 40 -- 'mensual'
    BEGIN
        -- Sumar un mes
        declare @dif_mensual INT = (SELECT DATEDIFF(MONTH, @fecha_inicial , @hoy));
                SET @fecha_siguiente = (select DATEADD(MONTH,@dif_mensual+1, @fecha_inicial))
    END
    ELSE IF @periodicidad = 50  --'bimestral'
    BEGIN
        -- Sumar dos meses
        declare @dif_bimestral INT = (SELECT DATEDIFF(MONTH, @fecha_inicial , @hoy));
                SET @fecha_siguiente = (select DATEADD(MONTH,@dif_bimestral+2, @fecha_inicial))
    END
        ELSE IF @periodicidad = 60  --'semestral'
    BEGIN
        -- Sumar seis meses
                declare @dif_semestral INT = (SELECT DATEDIFF(MONTH, @fecha_inicial , @hoy));
                SET @fecha_siguiente = (select DATEADD(MONTH,@dif_semestral+6, @fecha_inicial))
        END
    ELSE IF @periodicidad = 70 -- 'anual'
    BEGIN
        -- Sumar un año
                declare @dif_anual INT = (SELECT DATEDIFF(YEAR, @fecha_inicial , @hoy));
                SET @fecha_siguiente = (select DATEADD(YEAR,@dif_anual+1, @fecha_inicial))
    END
    ELSE
    BEGIN
        -- Si la periodicidad no es válida, devolvemos NULL
        SET @fecha_siguiente = NULL;
    END

    -- Devolvemos la siguiente fecha calculada

    RETURN @fecha_siguiente;
END
GO
