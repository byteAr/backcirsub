# Fechas y zona horaria

## Lo primero que hay que saber

**El 23/09/2026 a las 14:28 (hora argentina) el contenedor de SQL Server pasó de UTC a
`America/Argentina/Buenos_Aires`.** Desde entonces `GETDATE()` devuelve la hora de acá.

Eso parte el historial en dos, y no hay nada en el dato que lo indique:

| Cuándo se guardó | En qué zona está |
|---|---|
| hasta el 23/09/2026 14:28 | UTC (3 horas adelantada) |
| desde el 23/09/2026 14:28 | hora argentina |

Una columna `datetime` no guarda de qué zona es, así que **la fecha de corte es el único
dato que permite interpretar una fila vieja**. Si algún día hay que normalizar el
historial, el `UPDATE` sería restarle 3 horas a todo lo anterior al corte; conviene
hacerlo con el backup `CIRSUB_pre_tz.bak` a mano y probándolo antes en la instancia de
pruebas.

## Cómo mostrar fechas

Como lo guardado es hora argentina, **no hay que convertir nada**: se muestra el valor tal
cual. La trampa es que los drivers entregan una columna `datetime` como si fuera UTC, así
que hay que pedir el formato en UTC justamente para que no se desplace.

- **Front, marcas de tiempo de la base** (`Fecha_Creacion`, `ULTIMA_MODIFICACION_`):
  `{{ valor | date:'dd/MM/yyyy HH:mm':'UTC' }}`.
- **Front, fechas elegidas en un calendario** (`Fecha_Inicio`, `Fecha_Fin`): sin hora,
  `date:'dd/MM/yyyy':'UTC'`. Ahí la hora no significa nada y mostrarla confunde.
- **Backend**: `timeZone: 'UTC'` en `Intl` por la misma razón. Ver `tramites.service.ts`.

Las filas anteriores al corte se ven 3 horas adelantadas. Es esperable.

## Lo que sí se calcula en hora argentina

Estas fechas **no** salen de la base, y siguen fijando la zona a mano. No tocarlas:

- `common/gestion-api-key.ts`: la clave que espera el PHP de gestión incluye la fecha del
  día en Argentina. Cuando se armaba con el reloj del proceso, después de las 21:00 salía
  con la fecha del día siguiente y la API respondía 401. Costó encontrarlo.
- `reintegros.service.ts`: el nombre de los archivos de documentación lleva la marca de
  tiempo argentina.
- `descuentos.service.ts`: el mes en curso.

La regla: **si el valor viaja a otro sistema o queda en el nombre de un archivo, la zona va
explícita en el código**, aunque el entorno ya esté en `-03`.

## En SQL Server

Con el contenedor en hora argentina, `GETDATE()` y `CAST(GETDATE() AS date)` ya dan lo que
uno espera, y no hace falta convertir nada para lo nuevo.

Para consultas que crucen la fecha de corte, el valor viejo se convierte así:

```sql
SELECT Fecha_Creacion AT TIME ZONE 'UTC' AT TIME ZONE 'Argentina Standard Time'
FROM dbo.Tramites
WHERE Fecha_Creacion < '2026-09-23T14:28:00';
```

En `db/2026-09-23-hoy-argentina/` quedaron unos scripts que resuelven lo mismo desde las
funciones (`dbo.fn_hoy_ar()`), pensados para cuando la base estaba en UTC. **No se
aplicaron**, porque se eligió cambiar la zona del contenedor. Siguen siendo correctos y no
dependen de la zona del servidor, así que están ahí por si alguna vez se quiere volver a
un criterio independiente del reloj del contenedor.

## Infraestructura

Desde el 23/09/2026 están todos en `America/Argentina/Buenos_Aires`: el servidor de la
aplicación (192.168.1.2), sus contenedores, la VM de la base (192.168.1.3) y el contenedor
`sqlserver`.

**El contenedor `sqlserver_testing` (puerto 1435) sigue en UTC.** Si se usa para probar
algo que dependa de fechas, tenerlo en cuenta.
