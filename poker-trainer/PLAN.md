# Poker Trainer — Plan de la app

Este documento recoge el plan con el que se construyó la app: qué se quería, cómo se ha resuelto y en qué se aparta de la especificación original. El README técnico (cómo instalar, probar y compilar) está en [README.md](README.md).

## 1. Objetivo

Un entrenador de Texas Hold'em para un solo jugador:

- Mesa 6-max de cash (€0.02/€0.05, 100 BB) contra 5 bots con rangos creíbles.
- Antes de cada decisión el jugador escribe su razonamiento y elige la acción y el tamaño.
- Un coach con IA corrige la acción **y** el razonamiento, calle a calle, como lo haría un entrenador humano.
- Al final de cada mano, un scorecard por calles. Cada N manos (10 por defecto), una revisión de progreso con los leaks que quedan, ordenados por coste en €.
- Historial y estadísticas que se conservan entre sesiones.

Fuera de alcance: multijugador, dinero real y precisión de solver GTO. La estrategia de referencia es un TAG simplificado para micro-límites.

**Requisito clave:** la app tiene que poder abrirse como Artifact dentro de claude.ai.

## 2. Decisión principal: ejecutarla como Artifact

La especificación pedía un pequeño servidor Node con la API key de Anthropic para el coach. Dentro de un Artifact eso no hace falta: la página usa las capacidades que claude.ai le da.

| Necesidad | Spec original | Cómo se ha hecho |
|---|---|---|
| Coach | API de Anthropic detrás de un proxy local | Capacidad `sample`: la página pregunta a Claude con la cuenta de quien la abre. Sin API key ni servidor. |
| Historial y estadísticas | IndexedDB o fichero JSON | Capacidad `db`, en la carpeta privada del usuario (`data/users/<id>/`). Si no está disponible, `localStorage`. |
| Ajustes | `localStorage` | `localStorage`. |
| Exportar `.txt` / `.json` | Descarga normal | Capacidad `downloads` (el Artifact bloquea las descargas directas). |
| Sin conexión | El juego sigue; "Coach unavailable" | Igual. Las decisiones quedan registradas y se pueden volver a enviar al coach. El drill de preflop no necesita a Claude. |

Capacidades declaradas al publicar: `{ sample: {}, db: {}, user: {}, downloads: true }`.

Consecuencias:

- El coach usa el modelo que asigne claude.ai, no un modelo fijo, y consume de la cuenta de quien juega.
- La primera vez que habla el coach, claude.ai pide permiso.
- Fuera de claude.ai la app funciona, pero sin coach. El coach está detrás de una interfaz (`src/coach/client.ts`), así que se podría añadir un proxy propio sin tocar el resto.

## 3. Arquitectura

- **React + Vite + TypeScript**, compilado con `vite-plugin-singlefile` a un único HTML con todo el JS y el CSS dentro.
- `scripts/to-artifact.mjs` convierte ese HTML en la página que se publica como Artifact (claude.ai añade su propio `<html>`, `<head>` y `<body>`).
- **Motor puro en TypeScript**, sin dependencias de UI y con tests (Vitest). Todo el dinero va en céntimos enteros para evitar errores de redondeo.
- **Evaluador de manos propio** (7 cartas), sin librerías externas.
- **Una sola fuente de verdad para la estrategia:** `src/strategy/ranges.ts`. De ahí leen el chart, la corrección del drill, los bots y el prompt del coach.

```
poker-trainer/
  src/
    engine/    cartas, evaluador, mesa (ciegas, rondas, min-raise, all-in, botes
               secundarios, devolución de apuestas no igualadas, showdown), dinero, textos
    strategy/  ranges.ts (chart, outlines, 3-bet, tamaños, reglas, leaks)
               preflopAdvisor.ts (recomendación preflop para cualquier situación)
               drill.ts (preguntas del drill)
    bots/      fuerza de mano por categorías, textura del board, estilos limper/TAG/LAG
    coach/     construcción del prompt (sección 8 de la spec) y cliente de Claude
    store/     persistencia (db + localStorage), estadísticas, exportación
    ui/        mesa, panel de acción, coach, chart, drill, ajustes, progreso
  tests/       evaluador, mesa, rangos, bots, coach
```

## 4. Flujo de una mano

1. **Mano nueva estilo Zoom:** botón aleatorio (y por tanto posición del jugador aleatoria), estilos de bots aleatorios (35 % limper, 40 % TAG, 25 % LAG), stacks reiniciados y ciegas puestas.
2. Los bots actúan con una pequeña pausa hasta que le toca al jugador.
3. **Panel de acción:** línea de situación, caja de razonamiento (obligatoria salvo que se desactive), solo los botones legales y tamaños rápidos (3 BB, 3×, 4×, 1/3, 1/2, 2/3, bote, all-in) calculados sobre el bote actual.
4. **Enviar:** la acción se aplica siempre, aunque el coach no esté de acuerdo, y a la vez se manda al coach con el estado de la mano. Por defecto se espera su respuesta antes de seguir.
5. El coach responde en JSON: veredicto de la acción, veredicto del razonamiento, titular, mejor jugada, explicación, números (precio, outs, %) y códigos de leak.
6. **Fin de la mano:** scorecard por calles con el resultado en €. Las cartas de los rivales solo se enseñan en showdown; si el jugador se retira, no se muestran.
7. **Cada N manos:** revisión de progreso (qué está arreglado, qué queda por coste, qué no es problema, una instrucción para la próxima sesión).

La interfaz nunca etiqueta la mano del jugador ("top pair", "proyecto de color"): debe leerla él. El coach sí puede nombrarla.

Para que el coach no se equivoque leyendo la mano, el prompt incluye datos calculados por el motor: jugada hecha, proyectos, outs aproximados, precio, SPR y la recomendación preflop del libro de reglas.

## 5. Bots

- **Preflop:** parten del mismo chart que el jugador, con ±10 % de manos de margen y un estilo:
  - *Limper:* limpea la mitad baja de su rango, paga subidas con parejas y manos del mismo palo, solo hace 3-bet con QQ+ y AK.
  - *TAG:* abre según el chart, 3-bet con la lista de la sección 6.3, 4-bet con AA/KK.
  - *LAG:* abre ~35 % desde posiciones tardías, 3-bet ~8 % con algunos faroles (A5s–A2s, KQo), defiende amplio desde la BB.
- **Postflop:** clasifican su mano (nada / proyecto débil / proyecto fuerte / pareja débil, media, top pair, overpair / doble pareja o mejor) y juegan con reglas simples: c-bet de 1/3 en boards secos heads-up, apuestas mayores con manos fuertes, pagan según el precio, farol ~15 % en el river y all-in solo con doble pareja o mejor. Todos los umbrales llevan ±10 % de aleatoriedad.

## 6. Pantallas

- **Mesa:** óvalo con 6 asientos, el jugador siempre abajo en el centro, posición, stack, apuesta delante, botón de dealer, bote en el centro y cartas comunitarias con animación. Baraja de 4 colores (opción de 2 colores).
- **Coach:** columna derecha (debajo de la mesa en móvil), con una tarjeta por decisión, el scorecard y el resumen de la sesión.
- **Chart:** panel lateral (pantalla completa en móvil) con la rejilla 13×13, colores de apertura, contornos rojo/amarillo/negro, leyenda, listas de 3-bet/4-bet y tamaños. Pista opcional sobre la mano actual, desactivada por defecto.
- **Drill de preflop:** posición + mano (+ "X subió desde Y"); se elige subir, pagar o tirar; corrección al instante; tandas de 8. Funciona sin Claude.
- **Historial:** registro tipo hand history; exportación PokerStars `.txt` y `.json`.
- **Progreso:** manos, decisiones, % de aciertos, resultado en €, conteo de leaks y revisiones anteriores.
- **Ajustes:** ciegas, stack inicial, reiniciar stacks, baraja de 4 colores, razonamiento obligatorio, esperar al coach, revisión cada N manos, pista en el chart, moneda, exportar y borrar datos.

## 7. Pasos seguidos

1. Clonar `GabDevOps/GabRepo` y crear la rama `claude/poker-trainer`; todo el código va en `poker-trainer/` para no tocar lo existente.
2. Motor, evaluador y tests.
3. `ranges.ts`, recomendaciones preflop, chart y drill.
4. Bots.
5. Interfaz de mesa, acción, historial y ajustes, adaptada a móvil.
6. Coach (prompt, `sample`, validación del JSON, scorecard, revisión), persistencia y exportación.
7. `npm run build` y publicación como Artifact con las capacidades.
8. Commit y push a `claude/poker-trainer`.

## 8. Verificación

- `npm test`: 21 tests (categorías y orden de manos, botes con all-in y botes secundarios, devolución de apuestas, min-raise y acciones legales, 169 manos del chart, recomendaciones preflop, 300 manos solo de bots sin acciones ilegales y con las fichas cuadradas, prompt y respuesta del coach).
- Prueba en Chromium sobre la página compilada, fuera de claude.ai: 12 manos y 40 decisiones sin errores, chart, drill, progreso y pantalla de móvil sin scroll horizontal. Fuera de claude.ai el coach sale como "no disponible", lo que comprueba el modo sin conexión.
- Pendiente de comprobar dentro de claude.ai: las respuestas reales del coach y que el historial se conserva al recargar.

## 9. Estado

- App publicada como Artifact en claude.ai (privada).
- Código en la rama `claude/poker-trainer` de `GabDevOps/GabRepo`, sin fusionar en `master`.

## 10. Posibles mejoras

- Ver manos antiguas del historial con su scorecard dentro de la app.
- Elegir el estilo de los rivales para practicar contra un tipo concreto.
- Modo de entrenamiento postflop (spots fijos, como el drill de preflop).
- Proxy opcional para usar el coach fuera de claude.ai con una API key propia.
