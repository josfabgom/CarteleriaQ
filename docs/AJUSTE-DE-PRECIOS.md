# Ajuste de precios, fotos y estilos de menú

Pensado para cualquier negocio que muestre precios en pantalla: carnicería, verdulería, ferretería, panadería, gastronomía, etc.

## El catálogo es la fuente de verdad

Cada artículo del catálogo tiene: nombre, descripción, **precio**, **unidad de venta** (kg, unidad, 100 g, litro…), **categoría**, **precio anterior** (tachado), **etiqueta** (OFERTA, NUEVO…), **stock** (sí/no) y **foto**.

Las listas de pantalla se arman **enlazando** artículos del catálogo (*Listas para Pantallas → + Del catálogo*, con búsqueda y selección múltiple). Un artículo enlazado muestra siempre los datos vivos del catálogo: si cambia su precio, su foto o su stock, **todas las pantallas se actualizan solas**, sin tocar las listas.

También se puede agregar un artículo **manual** (*+ Manual*): tiene su propio precio, independiente del catálogo (útil para precios especiales de una lista). Los manuales no se actualizan solos.

Opciones por lista:
- **Agrupar por categoría**: la pantalla muestra un título por cada categoría.
- **Ocultar los sin stock**: si está apagado, los artículos sin stock se ven atenuados con la etiqueta AGOTADO.

## Estilos de menú en la pantalla

Se elige al asignar contenido a una pantalla (*Pantallas → Asignar contenido → Estilo de la lista*):

| Estilo | Qué muestra |
|---|---|
| **Lista** | Nombre, etiqueta, precio y unidad. Es la más compacta. |
| **Lista con fotos** | Una fila por artículo con miniatura, nombre, descripción y precio. |
| **Tarjetas con fotos** | Grilla de tarjetas con foto grande. Las columnas se adaptan a la cantidad de artículos. |

Si la lista no entra en el alto de la pantalla, el reproductor primero prueba con más columnas (tarjetas) y achica la letra (hasta 70 %); si aun así no entra, se **desplaza sola** de arriba hacia abajo. Un artículo sin foto muestra la inicial de su nombre. Las fotos también se guardan en el dispositivo para funcionar sin internet.

Los cambios de diseño del reproductor llegan a las TVs por actualización por aire (ver README): no hay que reinstalar el APK.

## Ajuste masivo de precios

*Ajuste de precios* en el menú. Siempre hay **vista previa** antes de aplicar.

1. **Qué cambio**: *Subir* o *Bajar*, un valor, y si es **porcentaje** o **monto fijo**. Opcional: **redondeo** a múltiplos de $1, 5, 10, 50, 100, 500 o 1000 (al más cercano, hacia arriba o hacia abajo).
2. **A qué artículos**: todo el catálogo, solo algunas categorías (incluida "sin categoría") o artículos elegidos uno por uno. Con "todo el catálogo" se pueden incluir también los ítems manuales de las listas.
3. **Cuándo**: ahora, o **programado** para una fecha y hora (hasta un año; el servidor lo aplica solo a esa hora, aunque no tengas el panel abierto).

Ejemplos: "+8 % a la categoría Vacuno, redondeado hacia arriba a $100", "−10 % a todo el catálogo el sábado a las 8:00", "+$200 a 5 artículos elegidos".

Reglas de seguridad:
- Porcentaje entre −90 % y +1000 %. Ningún precio baja de $0.
- El **precio anterior (tachado)** no se modifica con el ajuste: si el nuevo precio supera al "anterior", deja de mostrarse tachado.
- Un cambio programado se puede **cancelar** mientras no se haya aplicado. Hasta 50 programados a la vez por negocio.

### Historial y deshacer

Cada cambio queda registrado con su detalle (artículo, precio antes y después). *Deshacer* restaura los precios anteriores, **pero solo de los artículos que siguen con el precio que puso ese ajuste**: si alguien editó un artículo después, no se pisa su trabajo (el resumen indica cuántos se restauraron y cuántos se omitieron). Un cambio se puede deshacer una sola vez.

Es **atómico**: o se aplican todos los precios del ajuste o ninguno.
