/** Normalize a GB region code to a 6-digit adcode (right-pad with 0). */
export function toAdcode(code: string): string {
  return code.length >= 6 ? code.slice(0, 6) : code.padEnd(6, '0')
}

interface Feature { properties: { adcode: number | string; name: string } }

/** Build echarts map data (name→value by adcode, 0 when missing) + the max value. */
export function mapData(
  features: Feature[],
  counts: Record<string, number>
): { rows: { name: string; value: number }[]; max: number } {
  const rows = features.map((f) => ({
    name: f.properties.name,
    value: counts[String(f.properties.adcode)] ?? 0,
  }))
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0)
  return { rows, max }
}

type GeoModules = Record<string, () => Promise<{ default: unknown }>>

/** Cached loader over a Vite glob module map (injectable for tests). */
export function makeGeoLoader(modules: GeoModules) {
  const cache = new Map<string, unknown>()
  return async (adcode: string): Promise<unknown> => {
    if (cache.has(adcode)) return cache.get(adcode)
    const loader = modules[`./geo/${adcode}.json`]
    if (!loader) throw new Error(`geo not found: ${adcode}`)
    const geo = (await loader()).default
    cache.set(adcode, geo)
    return geo
  }
}

// Vite statically collects ./geo/*.json into a lazy module map.
export const loadGeo = makeGeoLoader(import.meta.glob('./geo/*.json') as GeoModules)
