> **NO SE APLICARON.** El 23/09/2026 a las 14:28 se resolvió cambiando la zona del
> contenedor de SQL Server a hora argentina, no con estos scripts. Quedan acá porque
> siguen siendo correctos: `dbo.fn_hoy_ar()` da el día argentino sin depender del reloj
> del contenedor. Ver `docs/fechas-y-zona-horaria.md`.

# "Hoy" en hora argentina (23/09/2026)

El contenedor de SQL Server corre en UTC, y cuatro funciones calculaban el día con
`GETDATE()`. Entre las 21:00 y la medianoche de Argentina ese día ya es el siguiente, así
que en esa franja de tres horas:

- `fn_en_fecha` y `fn_vigente` daban por vigente algo que arranca mañana, y por vencido
  algo que vence hoy;
- `fn_fecha_siguiente` y `fn_fecha_siguiente_tramite` devolvían `NULL` o corrían un día
  el cálculo del próximo vencimiento;
- `Tramites_Cumplimentar_Estado_general` dejaba fuera del contador
  `TramitesACumplimentarEnFecha` los que vencen hoy.

El arreglo no toca ningún dato guardado: sólo cambia cómo se calcula "hoy", que ahora sale
de `dbo.fn_hoy_ar()`. La base sigue guardando en UTC a propósito
(ver [`docs/fechas-y-zona-horaria.md`](../../docs/fechas-y-zona-horaria.md)).

## Archivos

| Archivo | Qué hace |
|---|---|
| `01-aplicar.sql` | Crea `dbo.fn_hoy_ar()` y actualiza las cuatro funciones y el procedimiento. |
| `02-verificar.sql` | Comprobaciones. No cambia nada, se puede correr cuando sea. |
| `99-rollback.sql` | Deja las funciones como estaban el 23/09/2026. |

## Cómo aplicarlo

Guardá la contraseña en una variable para que no quede en el historial:

```bash
read -rs SQLPW
```

**Primero en la instancia de pruebas** (contenedor `sqlserver_testing`, puerto 1435):

```bash
docker exec -i sqlserver_testing /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SQLPW" -C -d CIRSUB -b -i /dev/stdin < 01-aplicar.sql
```

Verificá:

```bash
docker exec -i sqlserver_testing /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SQLPW" -C -d CIRSUB -i /dev/stdin < 02-verificar.sql
```

Lo que tiene que dar:

- la zona `Argentina Standard Time` existe, con offset `-03:00`;
- `fn_hoy_ar` coincide con `hoy_argentina`;
- los cuatro casos de vigencia dan `0, 1, 1, 0`;
- ninguno de los objetos corregidos menciona ya `GETDATE`.

Recién después, lo mismo contra producción (contenedor `sqlserver`, puerto 1433). No hace
falta reiniciar nada: las funciones se reemplazan en caliente y la aplicación las toma en
la siguiente consulta.

Si algo sale mal, `99-rollback.sql` por la misma vía.

## Lo que queda afuera a propósito

El resto de los objetos que usan `GETDATE()` (`sp_Login`, `sp_Perfil_*`,
`sp_Personas_Cuentas_banco_CBU_AC`, `sp_Personas_foto_IN`, los `sp_mig_*`) sólo estampan
la fecha de un movimiento. Guardar esas marcas en UTC es correcto y consistente con los
19 meses de historia que ya hay. Lo que hay que hacer es convertir **al leer**, con el
patrón de `docs/fechas-y-zona-horaria.md`.
