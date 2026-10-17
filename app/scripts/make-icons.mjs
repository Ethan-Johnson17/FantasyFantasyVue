// Draws the app icons (the shield-and-star emblem from the sign-in screen) as PNGs, with no
// dependencies: polygon scanline fill at 4x, downsampled for smooth edges. Run: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const INK = [0x14, 0x12, 0x1a]
const GOLD = [0xe3, 0xb9, 0x64]
const SUPERSAMPLE = 4

// Shapes on the emblem's 64x64 grid (see SignInView.vue), with curves flattened.
function cubic(p0, p1, p2, p3, steps = 24) {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / steps
    const u = 1 - t
    return [
      u ** 3 * p0[0] + 3 * u ** 2 * t * p1[0] + 3 * u * t ** 2 * p2[0] + t ** 3 * p3[0],
      u ** 3 * p0[1] + 3 * u ** 2 * t * p1[1] + 3 * u * t ** 2 * p2[1] + t ** 3 * p3[1]
    ]
  })
}
const outerShield = [[32, 5], [54, 13], [54, 29], ...cubic([54, 29], [54, 43], [44.5, 52], [32, 59]), ...cubic([32, 59], [19.5, 52], [10, 43], [10, 29]), [10, 13]]
const innerShield = [[32, 11], [49, 17], [49, 29], ...cubic([49, 29], [49, 40], [41.7, 47.3], [32, 53]), ...cubic([32, 53], [22.3, 47.3], [15, 40], [15, 29]), [15, 17]]
const star = [[32, 20], [35.4, 27], [43, 27.9], [37.4, 33.1], [38.9, 40.7], [32, 37], [25.1, 40.7], [26.6, 33.1], [21, 27.9], [28.6, 27]]

/** Coverage (0..1) of a polygon on a size x size grid, the emblem scaled to `scale` of the icon and centered. */
function coverage(polygon, size, scale) {
  const big = size * SUPERSAMPLE
  const unit = (big * scale) / 54 // the shield spans 54 grid units tall (y 5..59)
  const offsetX = big / 2 - 32 * unit
  const offsetY = big / 2 - 32 * unit
  const points = polygon.map(([x, y]) => [x * unit + offsetX, y * unit + offsetY])
  const hits = new Uint8Array(big * big)
  for (let row = 0; row < big; row++) {
    const y = row + 0.5
    const crossings = []
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i]
      const [x2, y2] = points[(i + 1) % points.length]
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1))
    }
    crossings.sort((a, b) => a - b)
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      for (let col = Math.max(0, Math.ceil(crossings[i] - 0.5)); col < Math.min(big, Math.ceil(crossings[i + 1] - 0.5)); col++) hits[row * big + col] = 1
    }
  }
  const out = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0
      for (let dy = 0; dy < SUPERSAMPLE; dy++) {
        for (let dx = 0; dx < SUPERSAMPLE; dx++) sum += hits[(y * SUPERSAMPLE + dy) * big + x * SUPERSAMPLE + dx]
      }
      out[y * size + x] = sum / SUPERSAMPLE ** 2
    }
  }
  return out
}

/** Ink background, gold shield ring, gold star. `scale` is the emblem's height as a share of the icon. */
function drawIcon(size, scale) {
  const layers = [
    [coverage(outerShield, size, scale), GOLD],
    [coverage(innerShield, size, scale), INK],
    [coverage(star, size, scale), GOLD]
  ]
  const rgba = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    let color = INK
    for (const [cover, layer] of layers) color = color.map((c, k) => c + (layer[k] - c) * cover[i])
    rgba.set([...color.map(Math.round), 255], i * 4)
  }
  return png(size, rgba)
}

// Minimal PNG writer: RGBA, no filtering.
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}
function png(size, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8) // 8-bit RGBA
  const rows = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const outDir = new URL('../public/icons/', import.meta.url)
mkdirSync(outDir, { recursive: true })
const icons = [
  ['icon-192.png', 192, 0.78],
  ['icon-512.png', 512, 0.78],
  // Maskable: launchers crop to a circle or squircle, so keep the emblem inside the central safe zone.
  ['icon-maskable-512.png', 512, 0.58],
  // iOS rounds the corners itself and wants no transparency.
  ['apple-touch-icon.png', 180, 0.72]
]
for (const [name, size, scale] of icons) {
  writeFileSync(new URL(name, outDir), drawIcon(size, scale))
  console.log('wrote', name)
}
