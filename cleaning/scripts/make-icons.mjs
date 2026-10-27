import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const name = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])), 0);
  return Buffer.concat([length, name, data, crc]);
}

function encodePNG(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function blend(pixels, width, height, x, y, color, cover) {
  if (cover <= 0 || x < 0 || y < 0 || x >= width || y >= height) return;
  const i = (y * width + x) * 4;
  const a = Math.min(1, cover);
  const dstA = pixels[i + 3] / 255;
  const outA = a + dstA * (1 - a);
  const mix = (src, dst) => (outA === 0 ? 0 : Math.round((src * a + dst * dstA * (1 - a)) / outA));
  pixels[i] = mix(color[0], pixels[i]);
  pixels[i + 1] = mix(color[1], pixels[i + 1]);
  pixels[i + 2] = mix(color[2], pixels[i + 2]);
  pixels[i + 3] = Math.round(outA * 255);
}

function fill(pixels, width, height, color) {
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = color[0];
    pixels[i * 4 + 1] = color[1];
    pixels[i * 4 + 2] = color[2];
    pixels[i * 4 + 3] = 255;
  }
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function fillPoly(pixels, width, height, poly, color) {
  const xs = poly.map((point) => point[0]);
  const ys = poly.map((point) => point[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const x1 = Math.min(width - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (pointInPoly(x + 0.5, y + 0.5, poly)) blend(pixels, width, height, x, y, color, 1);
    }
  }
}

function fillRoundRect(pixels, width, height, x, y, w, h, radius, color) {
  const r = Math.min(radius, w / 2, h / 2);
  for (let py = Math.floor(y); py < Math.ceil(y + h); py += 1) {
    for (let px = Math.floor(x); px < Math.ceil(x + w); px += 1) {
      const cx = Math.min(Math.max(px + 0.5, x + r), x + w - r);
      const cy = Math.min(Math.max(py + 0.5, y + r), y + h - r);
      const dist = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
      const cover = r - dist + 0.5;
      if (px + 0.5 >= x + r && px + 0.5 <= x + w - r && py + 0.5 >= y && py + 0.5 <= y + h) {
        blend(pixels, width, height, px, py, color, 1);
      } else if (py + 0.5 >= y + r && py + 0.5 <= y + h - r && px + 0.5 >= x && px + 0.5 <= x + w) {
        blend(pixels, width, height, px, py, color, 1);
      } else if (cover > 0) {
        blend(pixels, width, height, px, py, color, Math.min(1, cover));
      }
    }
  }
}

function drawHouse(size, scale) {
  const pixels = Buffer.alloc(size * size * 4);
  const teal = [20, 96, 86];
  const cream = [255, 248, 239];
  const gold = [224, 177, 92];
  const glass = [20, 78, 72];
  fill(pixels, size, size, teal);
  const cx = size / 2;
  const cy = size * 0.56;
  const w = size * 0.4 * scale;
  const h = size * 0.3 * scale;
  const left = cx - w / 2;
  const right = cx + w / 2;
  const top = cy - h * 0.15;
  const bottom = cy + h * 0.7;
  fillPoly(
    pixels,
    size,
    size,
    [
      [cx, top - h * 0.55],
      [right + w * 0.14, top + h * 0.08],
      [left - w * 0.14, top + h * 0.08],
    ],
    cream,
  );
  for (let y = Math.floor(top); y <= Math.ceil(bottom); y += 1) {
    for (let x = Math.floor(left); x <= Math.ceil(right); x += 1) {
      blend(pixels, size, size, x, y, cream, 1);
    }
  }
  const doorW = w * 0.24;
  const doorH = (bottom - top) * 0.48;
  fillRoundRect(pixels, size, size, cx - doorW / 2, bottom - doorH, doorW, doorH, doorW * 0.18, gold);
  const win = w * 0.18;
  const winY = top + (bottom - top) * 0.18;
  fillRoundRect(pixels, size, size, left + w * 0.14, winY, win, win, win * 0.2, glass);
  fillRoundRect(pixels, size, size, right - w * 0.14 - win, winY, win, win, win * 0.2, glass);
  return pixels;
}

function downsample(src, size, target) {
  const dst = Buffer.alloc(target * target * 4);
  const scale = size / target;
  for (let y = 0; y < target; y += 1) {
    for (let x = 0; x < target; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      const x0 = Math.floor(x * scale);
      const x1 = Math.floor((x + 1) * scale);
      const y0 = Math.floor(y * scale);
      const y1 = Math.floor((y + 1) * scale);
      for (let py = y0; py < y1; py += 1) {
        for (let px = x0; px < x1; px += 1) {
          const i = (py * size + px) * 4;
          r += src[i];
          g += src[i + 1];
          b += src[i + 2];
          a += src[i + 3];
          count += 1;
        }
      }
      const o = (y * target + x) * 4;
      dst[o] = Math.round(r / count);
      dst[o + 1] = Math.round(g / count);
      dst[o + 2] = Math.round(b / count);
      dst[o + 3] = Math.round(a / count);
    }
  }
  return dst;
}

mkdirSync(join(root, "icons"), { recursive: true });
const large = drawHouse(1024, 1);
const mask = drawHouse(1024, 0.72);
const files = [
  ["icons/icon-512.png", downsample(large, 1024, 512)],
  ["icons/icon-maskable-512.png", downsample(mask, 1024, 512)],
  ["icons/icon-192.png", downsample(large, 1024, 192)],
  ["icons/icon-180.png", downsample(large, 1024, 180)],
  ["favicon-32.png", downsample(large, 1024, 32)],
];
for (const [name, pixels] of files) {
  const size = name.includes("32") ? 32 : name.includes("180") ? 180 : name.includes("192") ? 192 : 512;
  writeFileSync(join(root, name), encodePNG(size, size, pixels));
}
