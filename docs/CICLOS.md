# Ciclos de escenas

Una pantalla puede rotar varias **escenas** en bucle. El conjunto de escenas es un **ciclo**.

## Ciclos reutilizables
- Se arman en el menú **Ciclos** y se asignan a una o varias pantallas desde **Pantallas** (selector de ciclo).
- Cambiar el ciclo actualiza todas las pantallas que lo usan.
- La **Configuración rápida** de una pantalla crea un ciclo propio (privado) sin tocar los compartidos.
- Plantillas de inicio: solo precios, precios + ofertas, completo.

## Tipos de escena
| Tipo | Qué muestra |
|---|---|
| Precios | Una lista de precios (estilo lista / foto / tarjetas), con filtro de categorías y promos al costado. |
| Ofertas | Artículos con precio anterior mayor o etiqueta oferta/promo. Diseño **destacada** (uno grande) o **grilla**. Automática (todas las ofertas vigentes, ordenadas por descuento) o manual. Calcula el `-NN%`. |
| Imagen / video | Uno o varios archivos de la biblioteca. |
| Anuncio de texto | Título y subtítulo con 6 temas de color. |

Cada escena tiene duración propia (3 a 600 s), se puede desactivar y reordenar. Máximo 30 escenas por ciclo y 100 ciclos por negocio.

## Comportamiento
- Lo que muestra la TV se calcula en vivo en cada sincronización: si una oferta termina, desaparece sola.
- Las escenas vacías (por ejemplo, ofertas automáticas sin ofertas hoy) se omiten.
- Si no hay ciclo asignado, la TV muestra el fondo de espera.
- Borrar un archivo quita solo las escenas que lo usan.
- Los ciclos con el formato antiguo se convierten solos al arrancar el servidor.
- El reproductor se actualiza por OTA; no hace falta reinstalar el APK.
