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
| Cartelera completa | Una sola pantalla con todo junto (ver abajo). |

Cada escena tiene duración propia (3 a 600 s), se puede desactivar y reordenar. Máximo 30 escenas por ciclo y 100 ciclos por negocio.

## Comportamiento
- Lo que muestra la TV se calcula en vivo en cada sincronización: si una oferta termina, desaparece sola.
- Las escenas vacías (por ejemplo, ofertas automáticas sin ofertas hoy) se omiten.
- Si no hay ciclo asignado, la TV muestra el fondo de espera.
- Borrar un archivo quita solo las escenas que lo usan.
- Los ciclos con el formato antiguo se convierten solos al arrancar el servidor.
- El reproductor se actualiza por OTA; no hace falta reinstalar el APK.

## Cartelera completa
Una escena que arma la pantalla entera, pensada para locales donde se quiere ver todo a la vez:
- **Cabecera:** nombre del negocio (o el título que elijas), subtítulo y fecha/hora en vivo.
- **Lista de precios** a la izquierda, con categorías, etiquetas de oferta y precio anterior tachado. Si es larga, la letra se achica y, si aun así no entra, se desplaza sola.
- **Fotos o video** arriba a la derecha, que rotan solos.
- **Oferta destacada** abajo a la derecha, rotando entre las ofertas (automáticas o elegidas), con el descuento calculado en un círculo.
- **Franja de avisos** inferior con mensajes en movimiento (hasta 10).
- 5 estilos: oscuro, vino, azul, verde y claro.

Si no hay fotos elegidas o no hay ofertas hoy, ese recuadro se oculta y el resto ocupa el espacio. Se crea desde Ciclos → "Empezar con: Cartelera completa" o agregando la escena a un ciclo existente. Hay un prototipo de diseño en `docs/prototipo/cartelera.html`.

## Vista previa
Se puede ver cómo queda en la TV sin ir a la TV: es el **mismo reproductor** en un cuadro 16:9 dentro del panel.
- **Pantallas → «👁 Vista previa de la pantalla»**: muestra el ciclo que tiene asignada esa pantalla.
- **Ciclos → «👁 Ver»** (en la lista) o **«👁 Vista previa»** (dentro del editor): muestra el ciclo. En el editor se ven también los **cambios sin guardar**.
- **«👁 Ver»** en una escena: muestra solo esa escena.
- Controles: anterior, pausa/continuar, siguiente, pantalla completa y un botón por cada escena para saltar a ella. Los videos se ven sin sonido.
- La vista previa usa la versión más reciente del reproductor; una TV puede tardar unos minutos en actualizarse por aire.
