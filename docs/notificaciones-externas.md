# Notificaciones externas

Permite que otros sistemas de la mutual (gestión, panel de admin) les manden
notificaciones a los asociados que tienen la app.

El asociado recibe la notificación push en el celular (si las tiene activadas) y
además el mensaje le queda guardado en la app, firmado con el nombre del sistema
que lo mandó.

## Reglas

- **Se llama de servidor a servidor.** El backend de su sistema llama a la API; el
  navegador nunca. La clave en JavaScript del front queda a la vista de cualquiera.
- **La clave va en el header `X-API-KEY`.** Es una por sistema y la entrega quien
  administra CIRSUB. Guárdenla como cualquier secreto (variable de entorno, no en
  el código ni en el repositorio).
- **Siempre por HTTPS** a `https://api.cirsubgn.org.ar`, aunque estén en la misma red.
- Body en **JSON** (`Content-Type: application/json`).

## Enviar a un asociado

```
POST https://api.cirsubgn.org.ar/notificaciones-externas/enviar
X-API-KEY: <clave>
Content-Type: application/json

{ "dni": "30111222", "titulo": "Reintegro aprobado", "cuerpo": "Ya lo podés ver en Mis trámites." }
```

| Campo    | Reglas                                      |
|----------|---------------------------------------------|
| `dni`    | 7 u 8 dígitos. Se aceptan puntos.           |
| `titulo` | Obligatorio, hasta 80 caracteres.           |
| `cuerpo` | Obligatorio, hasta 300 caracteres.          |

Respuesta `201`:

```json
{ "ok": true, "pushed": true }
```

`pushed: false` **no es un error**: el mensaje quedó guardado y lo va a ver al
entrar a la app; sólo que no tenía las notificaciones activadas.

## Enviar a todos

Sólo si la clave tiene habilitado ese alcance. Llega a todos los asociados con la
app y **no se puede deshacer**.

```
POST https://api.cirsubgn.org.ar/notificaciones-externas/enviar-todos
X-API-KEY: <clave>
Content-Type: application/json

{ "titulo": "Asamblea", "cuerpo": "El viernes a las 18 en la sede." }
```

Contesta `202` enseguida y el envío sigue en segundo plano (con cientos de
asociados tarda varios minutos):

```json
{ "id": "2f1c…", "app": "gestion", "estado": "en-curso", "iniciado": "2026-09-30T14:00:00.000Z" }
```

El resultado se consulta con el `id`:

```
GET https://api.cirsubgn.org.ar/notificaciones-externas/envios/<id>
X-API-KEY: <clave>
```

```json
{ "estado": "terminado", "destinatarios": 812, "notificados": 640, "sinSuscripcion": 160, "fallidos": 12, … }
```

`estado` puede ser `en-curso`, `terminado` o `error` (con el motivo en `error`).

**No reintenten un envío a todos automáticamente.** Por seguridad:
- hay uno solo a la vez: si hay otro en curso, contesta `409`;
- el mismo título y texto se rechaza con `409` durante 10 minutos.

## Errores

| Código | Qué pasó                                                        |
|--------|-----------------------------------------------------------------|
| 400    | Algún campo no cumple las reglas. El motivo viene en `message`. |
| 401    | Falta la clave o no es válida.                                  |
| 403    | La clave no tiene habilitado ese tipo de envío.                 |
| 404    | El DNI no corresponde a un asociado.                            |
| 409    | Envío a todos repetido o ya hay uno en curso.                   |
| 429    | Más de 120 envíos por minuto. Esperen y reintenten.             |

## Ejemplo en PHP

```php
$clave = getenv('CIRSUB_NOTIF_KEY');

$ch = curl_init('https://api.cirsubgn.org.ar/notificaciones-externas/enviar');
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json', 'X-API-KEY: ' . $clave],
    CURLOPT_POSTFIELDS     => json_encode([
        'dni'    => '30111222',
        'titulo' => 'Reintegro aprobado',
        'cuerpo' => 'Ya lo podés ver en Mis trámites.',
    ]),
]);
$respuesta = curl_exec($ch);
$codigo = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($codigo !== 201) {
    error_log("CIRSUB notificación falló ($codigo): $respuesta");
}
```

## Alta de una clave (lo hace quien administra CIRSUB)

En `backcirsub/`:

```
npm run clave:notificaciones -- gestion "Sistema de gestión" uno,todos
```

Imprime la **clave** (se le pasa al sistema externo, no se vuelve a mostrar) y la
**entrada** para `NOTIF_EXTERNAS_CLAVES` en el `.env`, que sólo lleva el hash.
Varias apps se separan con `;`. Después de editar el `.env` hay que recrear el
contenedor del backend. Para revocar una clave, se borra su entrada.
