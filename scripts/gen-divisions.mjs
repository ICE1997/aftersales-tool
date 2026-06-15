import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

// china-division ships dist/pca-code.json: array of provinces
//   { code, name, children: [ { code, name, children: [ { code, name } ] } ] }
const pkgPath = require.resolve('china-division/dist/pca-code.json')
const provinces = JSON.parse(readFileSync(pkgPath, 'utf-8'))
const out = []
for (const p of provinces) {
  out.push({ code: p.code, name: p.name, parent: '' })
  for (const c of p.children ?? []) {
    out.push({ code: c.code, name: c.name, parent: p.code })
    for (const d of c.children ?? []) {
      out.push({ code: d.code, name: d.name, parent: c.code })
    }
  }
}
writeFileSync('src/renderer/china-divisions.json', JSON.stringify(out))
console.log('wrote', out.length, 'regions')
