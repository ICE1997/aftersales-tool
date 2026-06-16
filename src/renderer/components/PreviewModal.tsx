import { useEffect, useState } from 'react'
import type { Material } from '@shared/types'
import { api } from '../api'
import { IconCopy, IconExternal, IconClose } from './icons'

interface Props { material: Material | null; onClose: () => void }

export function PreviewModal({ material, onClose }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { setUrl(null); if (material) api.fileUrl(material.relPath).then(setUrl) }, [material])
  if (!material || !url) return null
  const name = material.name || material.relPath.split('/').pop()

  return (
    <div className="scrim animate-fadein" onClick={onClose}>
      <div className="flex max-h-[90vh] flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="animate-pop overflow-hidden rounded-xl2 bg-ink shadow-modal">
          {material.kind === 'image'
            ? <img src={url} alt={name} className="max-h-[74vh] max-w-[90vw] object-contain" />
            : <video src={url} controls autoPlay className="max-h-[74vh] max-w-[90vw]" />}
        </div>

        <div className="flex animate-pop items-center gap-1 rounded-full border border-line bg-surface p-1.5 pl-3 shadow-card">
          <span className="mr-1 max-w-[40vw] truncate font-mono text-xs text-muted">{name}</span>
          <span className="mx-1 h-4 w-px bg-line" />
          {material.kind === 'image' && (
            <button className="btn-ghost border-0 px-3 py-1.5 text-xs" onClick={() => api.copyImage(material.relPath)}>
              <IconCopy className="text-[14px]" /> 复制图片
            </button>
          )}
          <button className="btn-ghost border-0 px-3 py-1.5 text-xs" onClick={() => api.showItem(material.relPath)}>
            <IconExternal className="text-[14px]" /> 在文件夹中显示
          </button>
          <button className="btn-ghost border-0 px-3 py-1.5 text-xs" onClick={onClose}>
            <IconClose className="text-[14px]" /> 关闭
          </button>
        </div>
      </div>
    </div>
  )
}
