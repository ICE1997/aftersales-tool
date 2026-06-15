import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'

const OUT = 'src/renderer/geo'
mkdirSync(OUT, { recursive: true })

const divisions = JSON.parse(readFileSync('src/renderer/china-divisions.json', 'utf-8'))
const toAdcode = (code) => (code.length >= 6 ? code.slice(0, 6) : code.padEnd(6, '0'))
const provinces = divisions.filter((r) => r.parent === '')
const provinceCodes = new Set(provinces.map((p) => p.code))
const cities = divisions.filter((r) => provinceCodes.has(r.parent))

// download the "_full" GeoJSON of: national + every province (→its cities) + every city (→its districts)
const targets = new Set(['100000'])
for (const p of provinces) targets.add(toAdcode(p.code))
for (const c of cities) targets.add(toAdcode(c.code))

const url = (adcode) => `https://geo.datav.aliyun.com/areas_v3/bound/${adcode}_full.json`

let ok = 0, fail = 0, reachable = false
for (const adcode of targets) {
  const dest = `${OUT}/${adcode}.json`
  if (existsSync(dest)) { ok++; reachable = true; continue }
  try {
    const res = await fetch(url(adcode))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    reachable = true
    if (!json || json.type !== 'FeatureCollection') throw new Error('not a FeatureCollection')
    writeFileSync(dest, JSON.stringify(json))
    ok++
  } catch (e) {
    fail++
    if (fail <= 5) console.warn('skip', adcode, String(e))
  }
  await sleep(120)
}
console.log(`done: ${ok} ok, ${fail} failed, ${targets.size} targets, reachable=${reachable}`)
if (!reachable) { console.error('DataV unreachable — BLOCKED'); process.exit(2) }
