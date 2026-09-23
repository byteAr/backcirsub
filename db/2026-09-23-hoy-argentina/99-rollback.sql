/*
  Vuelve las cuatro funciones a como estaban el 23/09/2026, antes de 01-aplicar.sql.
  Definiciones tomadas de sys.sql_modules ese día.

  Ojo: al volver atrás vuelve también el problema, o sea el día UTC entre las
  21:00 y la medianoche de Argentina.
*/

SET NOCOUNT ON;
GO

CREATE OR ALTER FUNCTION [dbo].[fn_en_fecha]
(
    @desde date,
    @hasta date
)
RETURNS bit
AS
BEGIN
    DECLARE @hoy date = CONVERT(date, GETDATE());

    -- Tratar '1900-01-01' como NULL (sin fecha válida)
    DECLARE @desde_eff date = NULLIF(@desde, '19000101');
    DECLARE @hasta_eff date = NULLIF(@hasta, '19000101');

    RETURN
    (
        SELECT CASE
                 WHEN @desde_eff IS NULL THEN 0
                 WHEN @hoy < @desde_eff THEN 0
                 WHEN @hasta_eff IS NOT NULL AND @hoy > @hasta_eff THEN 0
                 ELSE 1
               END
    );
END;
GO

CREATE OR ALTER FUNCTION [dbo].[fn_vigente]
(
    @desde     date,
    @hasta     date = NULL
)
RETURNS bit
AS
BEGIN
    DECLARE @hoy date = GETDATE();

    RETURN
    (
        SELECT CASE
            WHEN @desde IS NULL THEN NULL
            WHEN @desde <= @hoy
                 AND ( @hasta IS NULL OR @hasta >= @hoy ) THEN 1
            ELSE 0
        END
    );
END;
GO

CREATE OR ALTER FUNCTION [dbo].[fn_fecha_siguiente]
(
    @fecha_inicial DATE,
    @periodicidad INT
)
RETURNS DATE
AS

BEGIN
        DECLARE @fecha_siguiente DATE;
        set  @periodicidad = LOWER(@periodicidad)
    IF @fecha_inicial IS NULL
    BEGIN
        RETURN NULL;
    END

        IF @fecha_inicial > convert(DATE, GETDATE())
    BEGIN
        RETURN  NULL;
    END

    IF @periodicidad = 10 --'diario'
    BEGIN
        declare @dif_dias INT = (SELECT DATEDIFF(DAY, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente = (select DATEADD(DAY,@dif_dias+1, @fecha_inicial))
    END
        ELSE IF @periodicidad = 20 -- 'semanal'
    BEGIN
        declare @dif_semanal INT = (SELECT DATEDIFF(WEEK, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente  = (select DATEADD(WEEK,@dif_semanal+1, @fecha_inicial))
    END

    ELSE IF @periodicidad = 30 --'quincenal'
    BEGIN
                declare @dif_quincenal INT = (SELECT DATEDIFF(DAY, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente = (select DATEADD(DAY,@dif_quincenal+15, @fecha_inicial))

    END
    ELSE IF @periodicidad = 40 -- 'mensual'
    BEGIN
        declare @dif_mensual INT = (SELECT DATEDIFF(MONTH, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente = (select DATEADD(MONTH,@dif_mensual+1, @fecha_inicial))
    END
    ELSE IF @periodicidad = 50  --'bimestral'
    BEGIN
        declare @dif_bimestral INT = (SELECT DATEDIFF(MONTH, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente = (select DATEADD(MONTH,@dif_bimestral+2, @fecha_inicial))
    END
        ELSE IF @periodicidad = 60  --'semestral'
    BEGIN
                declare @dif_semestral INT = (SELECT DATEDIFF(MONTH, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente = (select DATEADD(MONTH,@dif_semestral+6, @fecha_inicial))
        END
    ELSE IF @periodicidad = 70 -- 'anual'
    BEGIN
                declare @dif_anual INT = (SELECT DATEDIFF(YEAR, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente = (select DATEADD(YEAR,@dif_anual+1, @fecha_inicial))
    END
    ELSE
    BEGIN
        SET @fecha_siguiente = NULL;
    END

    RETURN @fecha_siguiente;
END
GO

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
        set  @periodicidad = (select  t.Tipo_Perioricidad from Tramites t where t.id = @Tramites_Id and t.Activo=1  and t.BORRADO_ is null);

    IF @fecha_inicial IS NULL
    BEGIN
        RETURN NULL;
    END

        IF @fecha_inicial > convert(DATE, GETDATE())
    BEGIN
        RETURN  NULL;
    END

    IF @periodicidad = 10 --'diario'
    BEGIN
        declare @dif_dias INT = (SELECT DATEDIFF(DAY, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente = (select DATEADD(DAY,@dif_dias+1, @fecha_inicial))
    END
        ELSE IF @periodicidad = 20 -- 'semanal'
    BEGIN
        declare @dif_semanal INT = (SELECT DATEDIFF(WEEK, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente  = (select DATEADD(WEEK,@dif_semanal+1, @fecha_inicial))
    END

    ELSE IF @periodicidad = 30 --'quincenal'
    BEGIN
                declare @dif_quincenal INT = (SELECT DATEDIFF(DAY, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente = (select DATEADD(DAY,@dif_quincenal+15, @fecha_inicial))

    END
    ELSE IF @periodicidad = 40 -- 'mensual'
    BEGIN
        declare @dif_mensual INT = (SELECT DATEDIFF(MONTH, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente = (select DATEADD(MONTH,@dif_mensual+1, @fecha_inicial))
    END
    ELSE IF @periodicidad = 50  --'bimestral'
    BEGIN
        declare @dif_bimestral INT = (SELECT DATEDIFF(MONTH, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente = (select DATEADD(MONTH,@dif_bimestral+2, @fecha_inicial))
    END
        ELSE IF @periodicidad = 60  --'semestral'
    BEGIN
                declare @dif_semestral INT = (SELECT DATEDIFF(MONTH, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente = (select DATEADD(MONTH,@dif_semestral+6, @fecha_inicial))
        END
    ELSE IF @periodicidad = 70 -- 'anual'
    BEGIN
                declare @dif_anual INT = (SELECT DATEDIFF(YEAR, @fecha_inicial , GETDATE()));
                SET @fecha_siguiente = (select DATEADD(YEAR,@dif_anual+1, @fecha_inicial))
    END
    ELSE
    BEGIN
        SET @fecha_siguiente = NULL;
    END

    RETURN @fecha_siguiente;
END
GO

-- fn_hoy_ar queda sin uso. Se puede borrar, pero no molesta:
-- DROP FUNCTION IF EXISTS [dbo].[fn_hoy_ar];
GO

--SELECCIONA TODOS LOS "Tramites" EN FORMA DETALLADA
--SISTEMAS Feb  7 2025  3:28AM
CREATE OR ALTER PROCEDURE [dbo].[Tramites_Cumplimentar_Estado_general]
AS
BEGIN
    select t.Id, t.Detalle, tp.Detalle,
        (select top 1 p.Apellido + ', ' + p.Nombre
         from Personas p
         where p.Id = t.Persona_Id_Creacion) PersonaCreacionTramite,
        t.Fecha_Creacion, t.Fecha_Inicio, t.Fecha_Fin, t.Tipo_Perioricidad,
        t.Prioridad, t.Id_Tramites_Grupo, t.Activo, t.Fecha_Creacion,
        t.Persona_Id_Creacion, t.ULTIMA_MODIFICACION_,
        (select COUNT(*) from Tramites_Cumplimentar tc
         where tc.BORRADO_ is null and tc.Tramites_Id = t.Id) CantidadTramitesCumplimentar,
        (select COUNT(*) FROM Tramites_Cumplimentar tc
         where tc.Fecha_Cumplimiento > CONVERT(date,GETDATE())
           and tc.Tramites_Id = t.id and tc.BORRADO_ is null) TramitesACumplimentarEnFecha
    from Tramites t
    left join Tipo_Perioricidad tp on t.Tipo_Perioricidad = tp.Id
    where t.BORRADO_ is null
END;
GO
--[dbo].[Tramites_Cumplimentar_Estado_general]
--SELECT * FROM Tramites
