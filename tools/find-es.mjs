import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const es = /[áéíóúñ¡¿ÁÉÍÓÚÑ]|\b(VIDA|ENERGIA|NIVEL|HUIR|PUNTER|Necesitas|salvaj|Bienvenid|nivel|vida|huevo|Huevo|equipo|Cerrar|Usar|usar|sin|con|para|del|los|las|una|Tu|tu|el|la|de|en|al|se|Sin|Nada|nada|Ataque|ataque|Defensa|Velocidad|Objetos|Mapa|Perfil|Salir|Pulsa|pulsa|Clic|clic|Esquiva|esquiva|Bloquea|Salta|Fallo|Pausa|Cargando|Continuar|Tipo|Etapa|Evoluci|Digievol|digievol|Rival|Ganaste|Perdiste|Victoria|Derrota|Huiste|huye|Escapaste|recupera|restaura|Poci|Baja|Media|Alta)\b/;
const lit = /'([^'\\\n]|\\.)*'|"([^"\\\n]|\\.)*"|`([^`\\]|\\.)*`/g;
for (const f of walk('src').filter((f) => /\.(ts|css)$/.test(f))) {
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    const code = line.replace(/\/\/.*$/, '');
    for (const m of code.matchAll(lit)) if (es.test(m[0]) && !/^['"`]\.\.?\//.test(m[0])) console.log(`${f}:${i + 1}: ${m[0].slice(0, 140)}`);
  });
}
