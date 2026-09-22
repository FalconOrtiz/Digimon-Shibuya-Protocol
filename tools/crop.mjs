import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
const [src, out, x0, y0, w, h, s] = process.argv.slice(2);
const A = PNG.sync.read(readFileSync(src));
const S = +s || 2, W = +w, H = +h;
const B = new PNG({ width: W * S, height: H * S });
for (let y = 0; y < H * S; y++) for (let x = 0; x < W * S; x++) {
  const si = ((+y0 + ((y / S) | 0)) * A.width + (+x0 + ((x / S) | 0))) * 4, di = (y * W * S + x) * 4;
  for (let k = 0; k < 4; k++) B.data[di + k] = A.data[si + k];
}
writeFileSync(out, PNG.sync.write(B));
