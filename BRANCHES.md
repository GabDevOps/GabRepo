# Ramas de GabRepo

Qué es cada rama, en qué estado está y cómo trabajamos. **Este archivo se actualiza en cada push.**

## Reglas de trabajo

- **`master` es la versión estable.** Solo entra código probado, siempre mediante un Pull Request que aprueba Gabriel.
- **Las ramas `claude/...` son trabajo en curso.** Se hace push de cada avance para no perderlo (la sesión de Claude es temporal). Subir a una rama no publica nada ni toca `master`.
- **Corrección de errores:** mientras la rama no se haya fusionado, las correcciones van en la misma rama. Después de fusionar, cada corrección nueva va en una rama nueva creada desde `master`.
- **Cada push actualiza este archivo:** estado de la rama y una línea en su historial.

## Ramas

| Rama | Para qué es | Estado | Último commit |
|---|---|---|---|
| [`master`](https://github.com/GabDevOps/gabrepo/tree/master) | Web original: `index.html`, `landing.html`, `aboutus.html`, `Mission.html`, `gay.html`. Todavía sin Poker Trainer. | Estable | `b188688` |
| [`claude/poker-trainer`](https://github.com/GabDevOps/gabrepo/tree/claude/poker-trainer) | Poker Trainer (carpeta `poker-trainer/`): entrenador de Hold'em 6-max con coach IA, ejecutable como Artifact de claude.ai. | **En pruebas (v2)**. Pendiente de PR a `master`. | ver historial |

## Historial de `claude/poker-trainer`

| Commit | Fecha | Contenido | ¿Probado? |
|---|---|---|---|
| `cadb621` | 2026-10-28 | v1 de la app completa. | Tests automáticos OK. Probado en navegador fuera de claude.ai. |
| `bdeee80` | 2026-10-28 | `poker-trainer/PLAN.md` con el plan de la app. | Solo documentación. |
| `530e52e` | 2026-10-28 | v2: razonamiento opcional, la mesa no espera al coach, reparto automático tras un fold, manos interesantes, corrección instantánea ("quick check"), coach más rápido. | Tests automáticos OK (28). Probado en navegador. **Pendiente de prueba de Gabriel en claude.ai.** |
| (este commit) | 2026-10-28 | `BRANCHES.md` (este archivo). | Solo documentación. |

## Dónde se prueba

- **Artifact:** https://claude.ai/artifact/UhYSBet95KAcunZyNmUWUJ (privado). Ahora mismo muestra la **v2** (commit `530e52e`).
- Para regenerarlo desde el código: en `poker-trainer/`, `npm install` y `npm run build`; se publica `dist/poker-trainer.html` en la misma URL.

## Siguiente paso

Cuando Gabriel confirme que la v2 funciona en claude.ai: abrir un Pull Request `claude/poker-trainer` → `master`.
