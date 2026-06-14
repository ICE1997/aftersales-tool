import { useEffect, useState } from 'react'
import type { Material } from '@shared/types'
import { api } from '../api'

interface Props { material: Material | null; onClose: () => void }

export function PreviewModal({ material, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { if (material) api.fileUrl(material.relPath).then(setUrl); else setUrl(null) }, [material])
  if (!material || !url) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
        {material.kind === 'image'
          ? <img src={url} className="max-h-[85vh]" />
          : <video src={url} controls autoPlay className="max-h-[85vh]" />}
        <div className="mt-2 flex gap-2">
          {material.kind === 'image' && <button className="rounded bg-white px-3 py-1" onClick={() => api.copyImage(material.relPath)}>复制图片</button>}
          <button className="rounded bg-white px-3 py-1" onClick={() => api.showItem(material.relPath)}>在文件夹中显示</button>
          <button className="rounded bg-white px-3 py-1" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
