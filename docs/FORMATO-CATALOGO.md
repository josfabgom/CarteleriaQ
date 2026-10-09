# Formato del catálogo de artículos (importación por CSV)

El catálogo es el inventario base de cada negocio. Las **listas de pantalla** se arman eligiendo artículos del catálogo, y la TV muestra esas listas.
Se importa desde el panel: **Catálogo de Artículos → Importar Artículos desde CSV**.

Archivos de ejemplo listos para usar: [`ejemplo-catalogo.csv`](ejemplo-catalogo.csv) (gastronomía, separador coma) y [`ejemplo-carniceria.csv`](ejemplo-carniceria.csv) (carnicería con precio por kg, separador punto y coma como lo guarda Excel).

## Columnas

| Columna | ¿Obligatoria? | Qué es | Ejemplo |
|---|---|---|---|
| `nombre` | **Sí** | Nombre del artículo, tal como se verá en la TV | `Asado de tira` |
| `precio` | **Sí** | Precio del artículo (ver formatos aceptados abajo) | `12900` |
| `codigo_interno` | Recomendada | Tu código propio (único dentro de tu negocio) | `V01` |
| `codigo_barra` | No | Código de barras (único dentro de tu negocio) | `7791813421007` |
| `descripcion` | No | Texto corto | `Corte tradicional` |
| `categoria` | No | Rubro o sección, libre. Sirve para agrupar en pantalla y para ajustar precios por categoría | `Vacuno` |
| `unidad` | No | Unidad de venta, libre: se muestra junto al precio ("$12.900 / kg"). Si es `unidad` no se muestra | `kg`, `100 g`, `litro`, `docena` |
| `precio_anterior` | No | Precio de antes, se muestra **tachado** si es mayor al precio actual | `14500` |
| `etiqueta` | No | Cartelito sobre el artículo (hasta 24 caracteres) | `OFERTA`, `NUEVO` |
| `disponible` | No | `si` / `no`. Con `no` se muestra atenuado como AGOTADO (o se oculta, según la lista) | `no` |

La **primera fila** debe ser el encabezado. El orden de las columnas no importa.
Los encabezados son tolerantes con mayúsculas, tildes y espacios: `Nombre`, `PRECIO`, `Código Interno` funcionan igual.
También se aceptan los nombres en inglés (`name`, `price`, `category`, `unit`, `badge`, `available`…) y `rubro` como sinónimo de `categoria`.

> **Sirve para cualquier rubro**: gastronomía, carnicería, verdulería, ferretería, farmacia, librería… Solo cambian las categorías y las unidades de venta que cargues.

**Importante al actualizar:** una columna que no está en el archivo **no se toca**. Por ejemplo, un CSV con solo `codigo_interno,nombre,precio` actualiza precios sin borrar la categoría, la unidad ni la etiqueta que ya tenían los artículos. Para vaciar un dato, incluí la columna y dejá la celda vacía.

La **foto** del artículo no se importa por CSV: se elige desde el panel (Catálogo de Artículos → Editar → Foto).

## Formatos aceptados

- **Separador**: coma `,`, punto y coma `;` o tabulador. Se detecta solo, así que sirve el CSV que guarda **Excel en español** (que usa `;`).
- **Codificación**: UTF-8, con o sin BOM (el "CSV UTF-8" de Excel funciona). Las tildes y la ñ se leen bien.
- **Precios** (`precio` y `precio_anterior`), todas estas formas se entienden:

  | Escribís | Se lee como |
  |---|---|
  | `9500` | 9500 |
  | `9500.50` / `9500,50` | 9500,5 |
  | `9.500` / `9,500` | 9500 (punto o coma seguidos de 3 dígitos = miles) |
  | `12.500,75` / `12,500.75` | 12500,75 |
  | `$ 9.500` / `$9500` | 9500 |
  | `0,5` / `0.500` | 0,5 |

  Un precio que no es un número (por ejemplo `gratis`) hace que esa fila se rechace.

## Reglas importantes

- **Actualiza o crea**: si el `codigo_interno` o el `codigo_barra` ya existe en tu catálogo, ese artículo **se actualiza**; si no, se crea uno nuevo. Por eso conviene que cada artículo tenga `codigo_interno`.
- **Sin código = duplicados**: un artículo sin `codigo_interno` ni `codigo_barra` se crea de nuevo cada vez que importás el archivo. No hay forma de reconocerlo por nombre.
- **Códigos repetidos en el archivo**: la segunda fila con el mismo código actualiza a la primera.
- **Filas inválidas** (sin nombre, o con precio que no es número) se omiten; las demás se importan igual.
- Los códigos no se comparten entre negocios: cada negocio tiene su propio catálogo y puede repetir códigos de otro.
- Si un texto lleva el separador, ponelo entre comillas: `"Carne 200 g, cheddar y huevo"`.
- Tamaño máximo del archivo: **5 MB**.

## Qué muestra el panel al importar

Un resumen con los artículos **nuevos** y **actualizados**, y la lista de las **filas rechazadas con el motivo**, por ejemplo:

```
Importación terminada: 3 nuevos, 0 actualizados, 2 fila(s) rechazada(s).
 • Fila 5: falta el nombre
 • Fila 6 (Plato raro): precio inválido "gratis"
```

El número de fila es el que ves en Excel (la fila 1 es el encabezado).
Si el archivo no tiene una columna `nombre` o está vacío, no se importa nada y el panel explica qué falta.

## Consejos

- Para **corregir precios en masa** sin planilla: usá *Ajuste de precios* en el panel (ver [AJUSTE-DE-PRECIOS.md](AJUSTE-DE-PRECIOS.md)). También podés volver a importar el mismo archivo con los precios nuevos y los **mismos códigos**.
- Si algo no importa como esperás, probá abrir el archivo con el Bloc de notas: la primera línea debe verse como `codigo_interno;nombre;precio` (o con comas).

## Ejemplo mínimo

```csv
codigo_interno,nombre,precio
V01,Asado de tira,12900
B01,Gaseosa 500 ml,2200
```
