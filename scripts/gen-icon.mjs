// Rasterize the master brand SVG (build/icon.svg) into build/icon.png for
// electron-builder (it derives .icns/.ico from the 512px PNG).
// Run: node scripts/gen-icon.mjs
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'build/icon.svg'))

await sharp(svg, { density: 384 })
  .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile(join(root, 'build/icon.png'))

console.log('wrote build/icon.png (512x512)')
