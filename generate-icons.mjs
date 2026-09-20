import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Minimal pure-Node PNG generator
function createPNG(width, height, pixelFn) {
  const rowStride = width * 4 + 1; // 1 filter byte per row
  const rawBuffer = Buffer.alloc(rowStride * height);

  for (let y = 0; y < height; y++) {
    const rowStart = y * rowStride;
    rawBuffer[rowStart] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y, width, height);
      const pixelIndex = rowStart + 1 + x * 4;
      rawBuffer[pixelIndex] = r;
      rawBuffer[pixelIndex + 1] = g;
      rawBuffer[pixelIndex + 2] = b;
      rawBuffer[pixelIndex + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawBuffer);

  function crc32(buf) {
    let table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);

    const chunkBody = Buffer.concat([typeBuf, data]);
    const crcVal = crc32(chunkBody);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crcVal, 0);

    return Buffer.concat([lenBuf, chunkBody, crcBuf]);
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Draw a stylized Crescent Moon + ZZZ / Clock icon in vibrant violet / cyan gradient
function iconPixelShader(x, y, w, h) {
  const nx = (x / w) * 2 - 1; // -1 to 1
  const ny = (y / h) * 2 - 1; // -1 to 1

  // Rounded squircle background
  const p = 4; // squircle power
  const squircle = Math.pow(Math.abs(nx), p) + Math.pow(Math.abs(ny), p);

  if (squircle > 1.05) {
    return [0, 0, 0, 0]; // transparent
  }

  // Smooth antialiased edge
  let alpha = 255;
  if (squircle > 0.88) {
    alpha = Math.floor(255 * (1.05 - squircle) / (1.05 - 0.88));
    alpha = Math.max(0, Math.min(255, alpha));
  }

  // Gradient background: Deep indigo to sleek electric purple (#1e1b4b -> #6366f1)
  const t = (ny + 1) / 2; // 0 (top) to 1 (bottom)
  let bgR = Math.floor(25 + 74 * t);
  let bgG = Math.floor(18 + 84 * t);
  let bgB = Math.floor(75 + 166 * t);

  // Crescent moon coordinates
  const c1x = nx - (-0.08);
  const c1y = ny - (-0.05);
  const d1 = Math.sqrt(c1x * c1x + c1y * c1y);

  const c2x = nx - 0.16;
  const c2y = ny - (-0.22);
  const d2 = Math.sqrt(c2x * c2x + c2y * c2y);

  const isMoon = (d1 <= 0.54) && (d2 >= 0.38);

  if (isMoon) {
    // Glowing cyan to energetic amber/gold moon
    const moonGrad = (nx + 0.5) / 1.0;
    const mr = Math.floor(99 + 156 * moonGrad);
    const mg = Math.floor(220 + 20 * moonGrad);
    const mb = Math.floor(240 - 80 * moonGrad);
    return [mr, mg, mb, alpha];
  }

  // Little snooze star / sparkle at top right
  const sx = nx - 0.45;
  const sy = ny - (-0.45);
  const sDist = Math.abs(sx) + Math.abs(sy);
  if (sDist < 0.2) {
    return [255, 255, 255, Math.floor(alpha * (0.2 - sDist) / 0.2)];
  }

  return [bgR, bgG, bgB, alpha];
}

const outDir = path.join(__dirname, 'icons');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

[16, 32, 48, 128].forEach(size => {
  const pngBuf = createPNG(size, size, iconPixelShader);
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), pngBuf);
  console.log(`Generated icon${size}.png (${size}x${size})`);
});
