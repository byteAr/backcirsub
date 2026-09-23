/*
  Comprobaciones. No cambia nada; se puede correr antes y después de aplicar.
*/
SET NOCOUNT ON;

-- 1. La zona tiene que existir en esta instancia (en Linux también se usan los
--    nombres estilo Windows).
SELECT name, current_utc_offset
FROM sys.time_zone_info
WHERE name = 'Argentina Standard Time';

-- 2. Qué día es "hoy" para cada criterio. Entre las 21:00 y la medianoche de
--    Argentina estos dos valores tienen que DIFERIR: ahí está el problema que
--    se corrige. En cualquier otro horario dan igual.
SELECT
    CAST(GETDATE() AS date)                                                     AS hoy_utc_viejo,
    CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Argentina Standard Time' AS date)    AS hoy_argentina,
    SYSDATETIMEOFFSET()                                                          AS instante;

-- 3. Después de aplicar, fn_hoy_ar tiene que coincidir con hoy_argentina.
SELECT dbo.fn_hoy_ar() AS fn_hoy_ar;

-- 4. Casos de borde de las funciones de vigencia, con fechas relativas al hoy
--    argentino. Esperado: 0, 1, 1, 0.
DECLARE @hoy date = dbo.fn_hoy_ar();
SELECT
    dbo.fn_en_fecha(DATEADD(day,  1, @hoy), NULL)                   AS empieza_manana_esperado_0,
    dbo.fn_en_fecha(@hoy,                   @hoy)                   AS empieza_y_termina_hoy_esperado_1,
    dbo.fn_vigente (DATEADD(day, -1, @hoy), @hoy)                   AS vence_hoy_esperado_1,
    dbo.fn_vigente (DATEADD(day, -5, @hoy), DATEADD(day, -1, @hoy)) AS vencio_ayer_esperado_0;

-- 5. Las cuatro funciones ya no deben mencionar GETDATE.
SELECT o.name,
       CASE WHEN m.definition LIKE '%GETDATE%' THEN 'TODAVIA USA GETDATE' ELSE 'ok' END AS estado
FROM sys.sql_modules m
JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name IN ('fn_en_fecha', 'fn_vigente', 'fn_fecha_siguiente', 'fn_fecha_siguiente_tramite', 'fn_hoy_ar')
ORDER BY o.name;
