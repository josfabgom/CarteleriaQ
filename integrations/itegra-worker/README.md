# Worker de Itegra → CarteleriaQ

Programa que se instala **en la PC donde corre Itegra**. Lee la base de Itegra y sube los artículos a la nube de forma automática:
**código, nombre, precio y unidad**. La categoría se asigna sola la primera vez (por palabras clave del nombre).

## Qué hace y qué no hace

- **Solo lee** la tabla de artículos (`PLUS`) de `Datos.script` (+ `Datos.log` si existe, para tomar los cambios más recientes). No abre la base de Itegra, no la modifica ni la bloquea. Nunca lee clientes, usuarios, ventas ni stock.
- **Solo se conecta hacia afuera** (HTTPS). No abre puertos en la PC ni en el router.
- Sube únicamente los artículos de tipo **P** (pesables → `kg`) y **N** (por unidad → `unidad`). Los tipos **R** y **X** (con precio 0) no se suben.
- Itegra manda sobre **código, nombre, precio y unidad**. La **categoría, foto, etiqueta y precio anterior** que cargues en el panel no se pisan.
- Un artículo que deja de existir en Itegra queda **sin stock** en la nube (no se borra). Si vuelve, se repone.
- Un artículo cargado a mano en el panel con el mismo código **no se toca**: se avisa como conflicto.
- Si una lectura viene incompleta (faltan muchos artículos de golpe), **no se aplica** y se avisa.

## Cómo sabe a qué cliente actualizar

Cada cliente tiene su propia **clave de integración** (se genera en el panel, sección *Integración Itegra*). El servidor decide el negocio por esa clave: el worker no elige. Además la clave queda atada a la **identidad de la base de Itegra** en el primer uso, así que no sirve si se copia a otra PC con otra base.

## Instalación en la PC del cliente

1. Instalar **Node.js** (versión LTS, 18 o más nueva) desde https://nodejs.org
2. Copiar esta carpeta (`itegra-worker`) a la PC, por ejemplo a `C:\CarteleriaQ\itegra-worker`.
3. En el panel del cliente → **Integración Itegra** → *Generar clave*. Copiar el archivo de configuración que aparece y guardarlo como `worker.config.json` dentro de la carpeta. Ajustar `rutaBase` a la carpeta de la base de Itegra (la que contiene `Datos.script`).
4. Abrir una consola (cmd) en la carpeta y ver qué se cargaría, sin aplicar nada:
   ```
   node worker.js --previsualizar
   ```
   Debe decir `VISTA PREVIA con "NOMBRE DEL NEGOCIO"`: **verificar que sea el negocio correcto**.
5. Si está bien, hacer la primera carga real:
   ```
   node worker.js --aplicar
   ```
6. Dejarlo funcionando solo: ejecutar `instalar-tarea.bat` **como administrador**. Queda como tarea de Windows que arranca con la PC y revisa cada pocos minutos.

Para quitarlo: `desinstalar-tarea.bat`.

## Configuración (`worker.config.json`)

| Campo | Qué es |
|---|---|
| `servidor` | Dirección de la nube, por ejemplo `https://carteleriaq.soporteq.tech` |
| `claveIntegracion` | La clave del panel (empieza con `itg_`) |
| `rutaBase` | Carpeta de la base de Itegra (con `Datos.script`) o la ruta directa al archivo |
| `cadaMinutos` | Cada cuánto revisa (por defecto 5) |
| `tiposDeArticulo` | Tipos de Itegra que se suben (por defecto `["P", "N"]`) |

**La clave es secreta**: no se sube al repositorio ni se comparte. Si se pierde o se filtra, se revoca en el panel y se genera otra.

## Comandos

| Comando | Qué hace |
|---|---|
| `node worker.js --previsualizar` | Muestra qué cambiaría, sin aplicar nada |
| `node worker.js --aplicar` | Primera carga real; después funciona solo |
| `node worker.js` | Modo normal: revisa cada X minutos y sube solo las diferencias |
| `node worker.js --una-vez` | Una sola revisión |
| `--forzar` | Salta las protecciones (lectura incompleta). Usar solo si el cambio es real |

Hasta que se ejecuta `--aplicar` por primera vez, el worker **solo previsualiza**. Una vez al día hace una revisión completa (es la que marca sin stock los artículos que ya no existen).

## Archivos que genera (junto a la configuración)

- `worker.log` — registro de lo que hizo (se rota solo a los 2 MB).
- `estado.json` — recuerda si ya se confirmó la primera carga y qué envió por última vez.

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| `No encuentro la base de Itegra` | Revisar `rutaBase`. |
| `La clave de integración no es válida o fue revocada` | Generar una nueva en el panel y actualizar la configuración. |
| `Esta clave ya está vinculada a otra base de Itegra` | Cambió la base (PC nueva o Itegra reinstalado): en el panel, *Desvincular base*. |
| `Parece un error de lectura` | Revisar que Itegra no esté en medio de una importación; si el cambio es real, usar `--forzar`. |
| Sin señal en el panel | La PC está apagada o sin internet. Al volver la conexión se pone al día sola. |

## Importante: la base de Itegra

Itegra guarda los cambios recientes en `Datos.log` hasta que cierra o guarda la base en `Datos.script`. Por eso `rutaBase` debe apuntar a la **carpeta completa** (con `Datos.script` y `Datos.log`), no a una copia suelta del `.script`: con una copia puede quedar desactualizado.

## Pruebas

```
node test-db.js          # lector de la base (incluye una base sintética)
cd ..\..\backend-api && node scripts/test-integrations.js   # servidor + worker completo
```
