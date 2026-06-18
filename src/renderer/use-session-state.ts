import { useState, useEffect, type Dispatch, type SetStateAction } from 'react'

/**
 * Like useState, but the value is persisted in sessionStorage under `key`.
 * Survives a renderer reload (Cmd+R / 视图→重新加载) so navigation isn't lost;
 * cleared when the window/app closes, so a fresh launch starts from defaults.
 */
export function useSessionState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = sessionStorage.getItem(key)
      return raw == null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* storage full / unavailable — keep working in-memory */
    }
  }, [key, value])
  return [value, setValue]
}
