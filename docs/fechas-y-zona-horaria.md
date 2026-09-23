# Fechas y zona horaria

## La regla

**La base guarda en UTC. La conversión a hora argentina se hace al leer, nunca al guardar.**

El contenedor de SQL Server corre en UTC y así se queda. Esto no es un descuido: todo el
histórico se guardó con ese criterio. Si se cambiara la zona del contenedor, las filas
nuevas quedarían en hora argentina y las viejas en UTC, **en la misma columna y sin nada
que las distinga**. Cualquier consulta por rango de fechas que cruce esa frontera daría
mal, y no habría forma de arreglarlo después.

Comprobación rápida de que la base sigue en UTC:

```sql
SELECT GETDATE() AS local, GETUTCDATE() AS utc;  -- tienen que dar lo mismo
```

## Cómo convertir en SQL Server

```sql
SELECT Fecha_Creacion AT TIME ZONE 'UTC' AT TIME ZONE 'Argentina Standard Time' AS fecha_local
FROM dbo.Tramites;
```

Se lee así: "este dato está en UTC" y después "pasalo a hora argentina". Los dos pasos son
necesarios, porque una columna `datetime` no guarda de qué zona es.

El nombre de la zona se puede verificar en la instancia:

```sql
SELECT name, current_utc_offset FROM sys.time_zone_info WHERE name LIKE '%Argentina%';
```

### El caso que más rompe: "lo de hoy"

Entre las 21:00 y la medianoche de Argentina, en UTC ya es el día siguiente. Un
procedimiento que filtre por `CAST(GETDATE() AS date)` deja afuera lo cargado en esa
franja, o lo cuenta en el día equivocado.

```sql
-- MAL: "hoy" en UTC
WHERE CAST(Fecha_Creacion AS date) = CAST(GETDATE() AS date)

-- BIEN: "hoy" en Argentina
DECLARE @hoy date = CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'Argentina Standard Time' AS date);
WHERE CAST(Fecha_Creacion AT TIME ZONE 'UTC' AT TIME ZONE 'Argentina Standard Time' AS date) = @hoy
```

Ojo con el rendimiento: convertir la columna en el `WHERE` impide usar el índice. Para
tablas grandes conviene convertir al revés, calculando los límites del rango en UTC una
sola vez y comparando la columna tal cual:

```sql
DECLARE @desde datetime2 = CAST(@hoy AS datetime2) AT TIME ZONE 'Argentina Standard Time' AT TIME ZONE 'UTC';
WHERE Fecha_Creacion >= @desde AND Fecha_Creacion < DATEADD(day, 1, @desde)
```

## Cómo se hace en esta aplicación

- **Front, marcas de tiempo de la base** (`Fecha_Creacion`, `ULTIMA_MODIFICACION_`):
  `{{ valor | date:'dd/MM/yyyy HH:mm':'-0300' }}`. Argentina no tiene horario de verano
  desde 2009, así que el desplazamiento fijo es correcto y no depende del reloj del
  visitante.
- **Front, fechas elegidas en un calendario** (`Fecha_Inicio`, `Fecha_Fin`): se muestran
  **sin hora y en UTC** (`date:'dd/MM/yyyy':'UTC'`). En esas columnas la hora no significa
  nada, y convertirlas podría correrlas un día según qué sistema las haya cargado.
- **Backend**: la zona va siempre explícita, con `timeZone: 'America/Argentina/Buenos_Aires'`
  en `Intl`, aunque el contenedor ya corra en `-03`. Ver `common/gestion-api-key.ts`,
  `reintegros.service.ts`, `descuentos.service.ts` y `tramites.service.ts`.

Un antecedente que justifica la insistencia: la API de gestión (`gestion.cirsubgn.org.ar`)
espera una clave que incluye la fecha del día en Argentina. Cuando se armaba con el reloj
del proceso, después de las 21:00 salía con la fecha del día siguiente y respondía 401.

## Contexto de infraestructura

Desde el 23/09/2026 el servidor de la aplicación, sus contenedores y la VM de la base
están en `America/Argentina/Buenos_Aires`. **El contenedor de SQL Server sigue en UTC**,
que es lo que documenta este archivo.
