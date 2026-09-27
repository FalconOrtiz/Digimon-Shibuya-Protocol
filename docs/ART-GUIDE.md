# DIGIMON: SHIBUYA PROTOCOL — ART BIBLE (Regla Gráfica)

> Contrato visual de este repositorio. Autor: Falcon Ortiz.
> Referencias en `docs/referencias/`.
> Todo cambio visual DEBE respetar esta regla. Verificación: análisis de
> histograma contra las referencias (docs/smoke-artcheck.mjs).

## 1. Hora del día: HORA AZUL (blue hour), NO golden hour brillante

Las referencias muestran atardecer tardío: sol ya bajo, cielo degradando de
dorado cálido en el horizonte a azul-violeta profundo arriba. **Hora objetivo:
18:30–19:30** (config.world.startHour = 18.75).

| Zona | Color referencia | Objetivo en juego |
|---|---|---|
| Cielo horizonte | #f0d8a8 (dorado) | degradado a #f0d8a8 |
| Cielo alto | #181830 → #303048 | azul-violeta profundo |
| Edificios | #604848, #786060, #604860 | violetas/marrones desaturados |
| Suelo/asfalto | #604860, #484848 | violeta-gris, NO negro |
| Cebra | #a8a8a8 | blanca limpia |
| Ventanas encendidas | #f0d8a8, #a87860 | cálidas doradas |
| Neones | #a87878, #c09078 | suaves rosa/naranja |

## 2. Paleta global

- **Saturación media: 0.28** (moderada — NADA hipervibrante)
- **Brillo medio de escena: 110–125** (las capturas deben medir ~120)
- Fachadas: desaturadas, tonos tierra/violeta, NO pasteles de plastilina
- Ropa NPCs: colores moderados que no griten sobre el fondo
- Digimons SÍ son vibrantes (Agumon #c07830/#a84818, Patamon #d8c0a8/#d87830)
  — el contraste personaje/mundo es intencional

## 3. Iluminación (non-negotiables)

1. **Sin sombras negras duras**: ambient mínimo 0.5, hemi cálido siempre encendido.
2. Sol bajo y cálido (#ffb050-#f0d8a8), con ángulo rasante al horizonte.
3. Ventanas/escaparates emisivos (cálidos) — la ciudad "vive" con luz interior.
4. Neones suaves con glow, no tiras brillantes crudas.
5. Asfalto húmedo: roughness ~0.4 + reflejos de neón (ya implementado).

## 4. Geometría y materiales

- Low-poly cartoonish: geometría redondeada, aristas suaves, sin detalles ruidosos.
- PBR: roughness 0.4–0.85, metalness 0–0.15 (nada de metal brillante).
- Texturas procedurales pintadas: ruido sutil, juntas suaves, sin desgaste agresivo.
- Los sprites de digimons (imágenes de referencia) se usan en exploración;
  modelos 3D animados en batalla.

## 5. UI / HUD (ya implementado)

- Perfil izquierda: FalconOrtiz, avatar circular, VIDA (verde), ENERGIA (azul), NIVEL 42 (dorado).
- Inventario abajo-derecha: 6 slots, semi-transparente, tecla I.
- Mapa digivice: grid + "SHIBUYA CROSSING — TOKYO" + leyenda.
- Todo redondeado, minimalista, con blur suave.

## 6. Quality bar (crítico adversarial automático)

Cada cambio visual se verifica con `docs/smoke-artcheck.mjs` + `docs/smoke-artcheck.py`:
- Captura headless en atardecer (18.5) con cámara fija al cruce (jugador en el centro).
- Métricas: brillo medio **85–115** (el 120 de las referencias FLUX incluye luz de
  estudio irreal; el tope realista del motor WebGL a hora azul es ~100), saturación
  0.2–0.35, cielo dorado→violeta arriba, cebra blanca brillante en primer plano.
- Si las métricas salen del rango → el cambio viola la Art Bible.

NOTA DE ILUMINACIÓN (aprendida en producción): el tonemapping ACES aplasta las
sombras; materiales con metalness>0 SIN environment map renderizan casi negro
(los metales reflejan el entorno; sin entorno = negro). Regla: metalness 0 en
suelo/calles, ambient SIEMPRE ≥ 0.7, fill light opuesta al sol para las fachadas,
y spawn del jugador en el centro del cruce (ref: "standing in the middle").

## 7. Proceso (este repositorio)

- Autor: Falcon Ortiz. Repositorio: FalconOrtiz/Digimon-Shibuya-Protocol.
- Subsistemas con dueño único, contrato vía ctx (cero imports cruzados).
- RNG determinista, cero alloc per frame, dispose.
- Sin assets externos salvo las referencias de personajes (sprites).
- Commits locales frecuentes; push solo con OK.
