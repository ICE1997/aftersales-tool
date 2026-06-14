import { useEffect, useState } from 'react'
import type { Material } from '@shared/types'
import { api } from '../api'

interface Props { materials: Material[]; selectedIds: Set<number>; onToggle: (id: number) => void; onOpen: (m: Material) => void }

function Thumb({ m }: { m: Material }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (m.thumbPath) api.fileUrl(m.thumbPath).then(setUrl)
    else if (m.kind === 'image') api.fileUrl(m.relPath).then(setUrl)
  }, [m.thumbPath, m.relPath, m.kind])
  if (!url) return <div className="flex h-32 items-center justify-center bg-gray-200 text-xs text-gray-500">{m.kind === 'video' ? '视频' : '无预览'}</div>
  return <img src={url} className="h-32 w-full object-cover" />
}

export function MaterialGrid({ materials, selectedIds, onToggle, onOpen }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3 p-3">
      {materials.map((m) => (
        <div key={m.id} className="relative rounded border">
          <input type="checkbox" className="absolute left-2 top-2 z-10" checked={selectedIds.has(m.id)} onChange={() => onToggle(m.id)} />
          <button className="block w-full" onClick={() => onOpen(m)}><Thumb m={m} /></button>
          <div className="truncate px-2 py-1 text-xs">{m.relPath.split('/').pop()}</div>
        </div>
      ))}
    </div>
  )
}
