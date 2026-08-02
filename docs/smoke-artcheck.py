# smoke-artcheck.py — crítico adversarial de la Art Bible (análisis de píxeles)
# Uso: python docs/smoke-artcheck.py docs/artcheck-shot.png
# Compara la captura del juego contra los rangos de docs/ART-GUIDE.md.
import sys
from PIL import Image
from collections import Counter

im = Image.open(sys.argv[1] if len(sys.argv) > 1 else 'docs/artcheck-shot.png').convert('RGB')
W, H = im.size
px = im.load()

def zone(y0, y1):
    c = Counter()
    for y in range(y0, y1, 4):
        for x in range(0, W, 4):
            r, g, b = px[x, y]
            c[(r//24*24, g//24*24, b//24*24)] += 1
    return c

# métricas globales
bright_vals, sat_vals = [], []
for y in range(0, H, 6):
    for x in range(0, W, 6):
        r, g, b = px[x, y]
        bright_vals.append((r+g+b)/3)
        mx, mn = max(r,g,b), min(r,g,b)
        sat_vals.append((mx-mn)/max(1,mx))
bright = sum(bright_vals)/len(bright_vals)
sat = sum(sat_vals)/len(sat_vals)

sky = zone(0, H//5)
ground = zone(4*H//5, H)
mid = zone(H//3, 2*H//3)

def has_color(counter, target, tol=30):
    tr, tg, tb = target
    for (r,g,b), n in counter.items():
        if abs(r-tr) <= tol and abs(g-tg) <= tol and abs(b-tb) <= tol:
            return True
    return False

checks = []
def check(name, ok, detail):
    checks.append((name, ok, detail))
    print(f'{"PASS" if ok else "FAIL"}  {name}: {detail}')

check('brillo medio 85-115', 85 <= bright <= 115, f'{bright:.0f}')
check('saturacion 0.20-0.35', 0.20 <= sat <= 0.35, f'{sat:.2f}')
check('cielo azul-violeta arriba', has_color(sky, (0x48,0x48,0x60), 30), f'top={sky.most_common(1)[0][0] if sky else None}')
check('suelo violeta-gris abajo', has_color(ground, (0x48,0x48,0x48), 36), f'bot={ground.most_common(1)[0][0] if ground else None}')
check('ventanas calidas en fachadas', has_color(mid, (0xf0,0xd8,0xa8), 60), f'mid={mid.most_common(2)}')

fails = [c for c in checks if not c[1]]
print(f'\nRESULTADO: {len(checks)-len(fails)}/{len(checks)} PASS')
sys.exit(1 if fails else 0)
