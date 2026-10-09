# Formato del catálogo de artículos (importación por CSV)

El catálogo es el inventario base de cada negocio. Las **listas de pantalla** se arman eligiendo artículos del catálogo, y la TV muestra esas listas.
Se importa desde el panel: **Catálogo de Artículos → Importar Artículos desde CSV**.

Archivo de ejemplo listo para usar: [`ejemplo-catalogo.csv`](ejemplo-catalogo.csv)

## Columnas

| Columna | ¿Obligatoria? | Qué es | Ejemplo |
|---|---|---|---|
| `nombre` | **Sí** | Nombre del artículo, tal como se verá en la TV | `Pizza Muzzarella` |
| `precio` | **Sí** | Precio del artículo (ver formatos aceptados abajo) | `9500` |
| `codigo_interno` | Recomendada | Tu código propio (único dentro de tu negocio) | `PIZ001` |
| `codigo_barra` | No | Código de barras (único dentro de tu negocio) | `7791813421007` |
| `descripcion` | No | Texto corto | `Salsa de tomate y muzzarella` |

La **primera fila** debe ser el encabezado. El orden de las columnas no importa.
Los encabezados son tolerantes con mayúsculas, tildes y espacios: `Nombre`, `PRECIO`, `Código Interno`, `codigo-barra` funcionan igual.
También se aceptan los nombres en inglés: `name`, `price`, `internalCode`, `barcode`, `description`.

## Formatos aceptados

- **Separador**: coma `,`, punto y coma `;` o tabulador. Se detecta solo, así que sirve el CSV que guarda **Excel en español** (que usa `;`).
- **Codificación**: UTF-8, con o sin BOM (el "CSV UTF-8" de Excel funciona). Las tildes y la ñ se leen bien.
- **Precio**, todas estas formas se entienden:

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

- **Actualiza o crea**: si el `codigo_interno` o el `codigo_barra` ya existe en tu catálogo, ese artículo **se actualiza** (nombre, precio y descripción); si no, se crea uno nuevo. Por eso conviene que cada artículo tenga `codigo_interno`.
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

- Para **corregir precios en masa**: volvé a importar el mismo archivo con los precios nuevos y los **mismos códigos**.
- Si algo no importa como esperás, probá abrir el archivo con el Bloc de notas: la primera línea debe verse como `codigo_interno;nombre;precio` (o con comas).

## Ejemplo mínimo

```csv
codigo_interno,nombre,precio
PIZ001,Pizza Muzzarella,9500
BEB001,Gaseosa 500 ml,2200
```
