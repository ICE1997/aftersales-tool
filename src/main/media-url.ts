// Pure helpers for the custom media protocol. No electron import, so it is unit-testable.

export const MEDIA_SCHEME = 'vhmedia'

/**
 * Build a renderer-loadable URL for a material's data-root-relative path.
 *
 * The renderer cannot load `file://` resources when it is served from the dev
 * server's `http://` origin (Chromium blocks it). A privileged custom scheme
 * works from both `http://` (dev) and `file://` (packaged) origins.
 */
export function mediaUrl(relPath: string): string {
  const encoded = relPath.split('/').map(encodeURIComponent).join('/')
  return `${MEDIA_SCHEME}://local/${encoded}`
}
