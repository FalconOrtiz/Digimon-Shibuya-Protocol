# DIGIMON: SHIBUYA PROTOCOL — Art Direction Bible

**Todo agente lee este archivo antes de tocar algo visual. Ante la duda, iguala este
documento, no tu gusto.** Sustituye a `docs/ART-GUIDE.md` y a la biblia del fork
`D:\Digimon\game\ART_DIRECTION.md`.

## 1. Target: dos tomas gold, un solo mundo

El juego tiene un único mundo y un ciclo día/noche (`src/world/Atmosphere.ts`). Se valida
contra dos referencias; ambas tienen que pasar a la vez.

| Toma | Hora | Referencia | Lo que debe leerse |
|---|---|---|---|
| **GOLDEN** (principal) | 17:00 | `docs/referencias/assets/shibuya-fps-reference.jpg` | Cartoon Animal Crossing / Pokémon S-V: sol bajo cálido, fachadas claras con LED de color, asfalto húmedo que refleja el cielo, multitud chibi densa, árboles redondos |
| **NIGHT** (secundaria) | 21:30 | `docs/referencias/shibuya-night-hud.jpg` | Neones y pantallas LED como fuente principal de color, asfalto mojado con reflejos arrastrados, ventanas cálidas encendidas, cielo índigo |

Rasgos comunes:

- **Diorama tallado en jabón.** Nada tiene arista de 90°: todo volumen caja usa
  `roundedBox` (bevel ≥ 1.5 cm). Proporciones ~10% más rechonchas que la realidad.
- **Saturado pero anclado.** Asfalto, hormigón y acero son fríos y apagados; el color vive
  en LED, neón, rótulos, ropa de la multitud y los partners.
- **Denso a pie de calle, limpio a la altura de los ojos.** La cebra en X siempre legible.

## 2. Hard rules

1. **Sin aristas afiladas.** `roundedBox` / extruidos redondeados.
2. **Sin superficies sin textura.** Toda superficie usa un `MaterialMaps` de
   `src/core/TextureLab.ts` (albedo + normal + roughness de la misma base de ruido).
   Extiende TextureLab o `src/fx/materials/*`; no hornees texturas inline en `world/`.
3. **Sin negro ni blanco puro** en albedo: `#14141c` … `#f6efe4`. Los emisivos son luces.
4. **Todo proyecta y recibe sombra** salvo emisivos, billboards y geometría a > 60 m.
5. **Nada flota ni atraviesa el suelo.** Props asentados en `LAYOUT.SLAB_H` o 0.
6. **Sin z-fighting.** Coplanares con `polygonOffset` o ≥ 2 mm de offset.
7. **Silueta primero.** Si el edificio no se lee como silueta contra el cielo, está mal.
8. **El neón es material emisivo, nunca una luz.** Cero `PointLight` en el mundo.
9. **> 8 repeticiones = `InstancedMesh` o geometría fusionada** (multitud, farolas,
   bolardos, árboles, franjas de cebra, ventanas).
10. **Un solo dueño de luces:** `src/world/Atmosphere.ts` (key + hemi fill + bounce).
11. **Un solo tone-map:** ACES en el GradePass de `src/render/PostFX.ts`. El renderer
    va con `NoToneMapping`. Si algo se quema, se baja su albedo o emisivo.
12. **Presupuesto:** ≤ 300 draw calls de escena, ≤ 2.5 M triángulos, 60 fps a 1600×900
    en calidad `high`. `PostFX.sceneStats` lo reporta; `tools/visual-gate.mjs` lo comprueba.

## 3. Paleta

| Rol | Hex | Notas |
|---|---|---|
| Asfalto mojado | `#3A4450` | Base fría azulada |
| Asfalto seco | `#4A5560` | Bordes, carriles |
| Cebra | `#E8E4DC` | Pintura gastada, nunca blanco puro |
| Acera (baldosa) | `#B8ADA0` → `#D8CCBC` | Cálida, juntas oscuras |
| Ladrillo acera | `#9A5A48` | Franjas de pavimento rojizo (ref golden) |
| Hormigón | `#8A8E96` | Fachadas, nunca gris plano |
| Fachada clara | `#D8D2C8`, `#C8CCD4`, `#E0D0B8` | Torres golden hour |
| Fachada acento | `#C87870`, `#7088A8`, `#D8B070`, `#8A78A8` | Bloques medianos |
| Cristal | `#2A3A4E` | Muro cortina con reflejo del cielo |
| Acero oscuro | `#232733` | Postes, marcos |
| Neón cian | `#4DE1FF` | Emisivo |
| Neón magenta | `#FF4DC8` | Emisivo |
| Neón cálido | `#FFB070` | Comida, prácticos |
| Neón verde | `#5AFF7D` | Tsutaya / Starbucks |
| Follaje | `#3A7A48` → `#6AAA58` | Copas redondas |
| Agumon | `#E08030` | Ojos verdes `#2EC44A`, garras `#F4EFE6` |
| Patamon | `#F0E0C8` + `#E08030` | Ojos azules `#3A7AD8`, extremidades `#3A2A24` |
| Cielo golden | zenith `#6A7AB8` → horizonte `#FFC890` | 17:00 |
| Cielo noche | zenith `#141430` → horizonte `#3A3A68` | 21:30 |

Los colores de HUD (VIDA `#3DBF6A`, ENERGÍA `#4D9FFF`, NIVEL `#F0C14A`, panel `#2A3040`)
son **exclusivos de la UI** y no aparecen en geometría.

## 4. Luz (`src/world/Atmosphere.ts`)

- Key `DirectionalLight` con VSM y `fitShadowFrustum` sobre `PLAY_AREA`; el color y la
  intensidad salen de `DAY_PHASES`.
- Fill `HemisphereLight` lila/asfalto; bounce direccional cálido sin sombra.
- PMREM del mismo `SkyShader` que la cúpula → los reflejos del asfalto y el cristal
  coinciden siempre con el cielo visible.
- `scene.userData.nightFactor` (0 día → 1 noche) escala todos los emisivos registrados
  en `NeonMaterials`. Nadie más toca luces.
- `scene.userData.dayNight.setHour(h)` congela la hora para capturas.

## 5. Materiales (`src/fx/materials/`)

| Dominio | Archivo | Presets TextureLab |
|---|---|---|
| Suelo | `TerrainMaterials.ts` | `wetAsphaltMaps`, `zebraPaintMaps`, `sidewalkTileMaps`, `brickPaverMaps` |
| Edificios | `BuildingMaterials.ts` | `facadeWindowGridMaps`, `glassCurtainMaps`, `concretePanelMaps`, `tileFacadeMaps` |
| Props | `PropMaterials.ts` | `metalPanelMaps`, `barkMaps`, follaje |
| Emisivos | `NeonMaterials.ts` | `ledScreenTexture`, rótulos canvas |
| Criaturas | `CreatureMaterials.ts` | `creatureSkin` (wrap diffuse + rim fresnel + clearcoat) |

- **Asfalto mojado:** `MeshPhysicalMaterial`, roughness de mapa (charcos 0.05–0.15,
  seco 0.55–0.7), clearcoat 0.35, `envMapIntensity` ~1.2.
- **Fachadas:** retícula de ventanas horneada (normal con marcos rehundidos), interior
  falso emisivo por celda que se enciende con `nightFactor`. UV en metros por fachada.
- **Cristal:** `MeshPhysicalMaterial` metalness 0.6, roughness 0.08, env 1.4, montantes
  en normal/roughness; interior cálido tenue en emisivo.
- **Acero:** metalness 0.8, roughness 0.35 con env map (si no, lee como plástico).
- **Partners:** SDF `metaSurface` + `creatureSkin`, facetado low-poly (`flatShading`)
  para igualar `agumon01.png` / `patamon01.png`.

## 6. Composición del cruce

Cruce en (0,0); norte = −Z. Manzanas a ±48 m.

- NO Scramble Square (torre más alta, LED vertical, remate de la vista norte)
- NE QFRONT (pantalla LED gigante de fachada)
- SO Shibuya 109 (cilindro con rótulo)
- SE Hikarie (cristal, torre luminosa)
- N Tsutaya (rótulo verde), SE-lejano Starbucks
- O Hachiko (estatua, salida de estación)
- Anillo de skyline de fondo (manzanas 2.º y 3.º anillo) para que el horizonte sea ciudad.

## 7. Densidad

Ningún parche de acera > 3 m² vacío: farolas, bolardos, semáforos, árboles en alcorque,
máquinas expendedoras, papeleras, bancos. Multitud de 120–200 peatones chibi instanciados
(cabeza grande, ropa de color de la paleta, marcha animada), nunca en filas.

## 8. Post-proceso (`src/render/PostFX.ts`)

Render (HDR, MSAA) → GBuffer compartido → GTAO → Bloom → Grade (DOF lejano + ACES +
split-tone + vignette + grain) → SMAA. Los ajustes del grade se interpolan entre GOLDEN y
NIGHT con `nightFactor`:

| | GOLDEN | NIGHT |
|---|---|---|
| exposure | 1.08 | 1.12 |
| saturation | 1.12 | 1.15 |
| liftShadow | `0.02,0.025,0.05` | `0.03,0.02,0.07` |
| gainHighlight | `1.06,1.0,0.92` | `1.0,0.98,1.04` |
| bloom strength / threshold | 0.35 / 1.2 | 0.75 / 1.0 |

## 9. Política de assets

- **Superficies = procedurales.** Mundo y criaturas usan exclusivamente TextureLab.
- **Contenido de pantalla = permitido.** Los JPG/MP4 de `public/assets/imagine/` solo
  pueden aparecer como *contenido* de pantallas LED (`NeonMaterials`) e iconos de HUD/
  Digivice. Nunca como material de fachada, suelo o criatura.
- Retratos PNG de partners: solo HUD/Digivice.

## 10. Qué significa "aprobado"

Una toma pasa solo si:

- Asfalto ≠ acera ≠ hormigón ≠ cristal ≠ acero ≠ neón ≠ partner a simple vista.
- Hay sombra de contacto (GTAO) bajo todo objeto y reflejos legibles en el asfalto.
- Hay variación de color *dentro* de cada superficie.
- Sin tiling visible en fachadas grandes, sin instancias idénticas en fila.
- Profundidad: primer plano (props), medio (cruce, partner), fondo (torres, cielo).
- De noche: la cebra, los semáforos y el partner se leen sin esfuerzo.
- `node tools/visual-gate.mjs` pasa (capturas + presupuesto + 0 errores de consola).
