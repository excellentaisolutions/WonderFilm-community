# Automatizar WonderFilm

## Conectar

1. Abre WonderFilm y entra en **Ayuda → Integraciones IA** (también desde Inicio).
2. Activa **Permitir conexiones locales**.
3. Copia la configuración MCP al cliente de agentes. Incluye la ruta exacta de la
   instalación, `agents/entry.cjs`, `ELECTRON_RUN_AS_NODE=1` y el archivo de conexión.
4. Descubre las herramientas y consulta `capabilities_get`, después `project_get`.

El servidor escucha únicamente en 127.0.0.1, con puerto dinámico y token por perfil.
No es una API para exponer en Internet. La cuenta de Windows es la frontera de
confianza; `WONDERFILM_CLIENT` es una etiqueta de actividad, no una cuenta independiente.
Revocar desactiva el acceso y rota el token. La pasarela empieza desactivada en un
perfil nuevo y recuerda la elección del usuario.

## CLI JSON

Desde el código fuente, con Node instalado:

```powershell
$env:WONDERFILM_CONNECTION = 'RUTA_ABSOLUTA_DEL_PANEL\agent-connection.json'
$env:WONDERFILM_CLIENT = 'mi-agente'
node desktop/agents/entry.cjs --cli tools
node desktop/agents/entry.cjs --cli project.get
node desktop/agents/entry.cjs --cli project.create --file argumentos.json
```

El adaptador MCP funciona también empaquetado, usando el ejecutable Electron que
indica el panel y su entrypoint dentro de `resources/app.asar`. No requiere instalar
Node para MCP. No cambies manualmente el archivo de conexión ni publiques su token.

Ejemplo de `argumentos.json` para crear un proyecto:

```json
{"name":"Demo de producto","width":1920,"height":1080,"fps":{"num":25,"den":1},"discardChanges":false}
```

Cada llamada devuelve `result`; los errores CLI salen por stderr con código distinto
de cero. Para reintentar exactamente una llamada usa el mismo `--request-id UUID`.
La caché de idempotencia es acotada y vive durante esa ejecución de la aplicación.

## Receta: de una grabación a un vídeo montado

| Paso | Método CLI | Datos necesarios |
|---|---|---|
| Tener la grabación terminada | — | archivo de vídeo completo, de cualquier grabador |
| Crear montaje | `project.create` | nombre, resolución, fps |
| Importar | `media.import` | paths absolutos de vídeo/audio |
| Consultar ids | `project.get` | pistas y medios reales |
| Colocar medios | `clip.add` | mediaId, trackId, at, sourceIn, duration |
| Añadir título | `title.add` | pista visual, texto, inicio/duración |
| Ajustar | `clip.update` | volumen, fundidos, efectos, transformación |
| Guardar editable | `project.save` | ruta .wonderfilm nueva |
| Exportar | `export.start` | ruta, formato, calidad, useGpu |
| Esperar/verificar | `jobs.status` | hasta completed; revisar result |

Tiempos de entrada en **segundos**; estado de proyecto en **microsegundos**.
Las llamadas usan las mismas operaciones y deshacer que la interfaz. Los solapes
reemplazan contenido según las reglas del editor; el modo magnético puede cerrar
huecos. Inspecciona el estado después de cada montaje. No se aceptan ediciones
concurrentes durante un trabajo. `jobs.cancel` y el panel pueden cancelar exportación.
Guardar/exportar sobre un archivo existente requiere `overwrite: true` explícito.
Nunca se permite exportar encima de un medio original, incluso con overwrite.

## Alcance de la versión

29 herramientas: proyectos, importación, pistas, clips, títulos, transformaciones,
efectos, volumen/fundidos, historial, reproducción, captura y trabajos de exportación.
La skill portable se distribuye en `desktop/agents/skills/wonderfilm-control/SKILL.md`.

La versión 0.3 añade reproducción inversa de vídeo/audio con copia temporal de visor
(hasta 720p, eliminada al cerrar normalmente) y ganancia hasta 200 %. Exportar lee los
originales. El fundido cruzado, barrido, zoom, desplazamiento y desenfoque solapan
fotogramas de borde para conservar la duración de la línea de tiempo; también hay
fundido a negro. El visor no es una referencia de color profesional calibrada.

Para demos fieles conserva resolución y FPS del original, sin filtros de las pruebas.
No hay transcripción automática, generación audiovisual en nube ni
render distribuido. La codificación por GPU solo se ha probado en un equipo; si falla, la exportación vuelve a software.
La escucha y validación editorial final corresponden al operador.

## Pruebas reproducibles

Desde `desktop`: `node qa/agent-smoke.cjs` (perfil aislado, ventana oculta). Con
`WONDERFILM_QA_SOAK_MS=600000` añade el ensayo sostenido de diez minutos; en
PowerShell, `$env:WONDERFILM_QA_SOAK_MS='600000'`. Los temporales van a la carpeta
temporal del sistema (o a `WONDERFILM_QA_TEMP`) y se eliminan al terminar.
