import { protocol, net } from 'electron'
import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MEDIA_SCHEME } from './media-url'

/**
 * Register the media scheme as privileged. MUST be called before the app's
 * 'ready' event (Electron requirement for registerSchemesAsPrivileged).
 */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, bypassCSP: true } }
  ])
}

/**
 * Serve files under `dataRoot` over the custom scheme. Call once after 'ready'.
 * Resolves the request path against dataRoot and refuses anything that escapes it.
 */
export function handleMediaProtocol(dataRoot: string): void {
  const root = normalize(dataRoot)
  protocol.handle(MEDIA_SCHEME, (request) => {
    const rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '')
    const abs = normalize(join(root, rel))
    if (abs !== root && !abs.startsWith(root + sep)) {
      return new Response('forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(abs).toString())
  })
}
