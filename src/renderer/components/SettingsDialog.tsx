import { useEffect, useState } from 'react'
import { api } from '../api'

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [root, setRoot] = useState('')
  useEffect(() => { if (open) api.getDataRoot().then(setRoot) }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-96 rounded bg-white p-4">
        <h3 className="mb-2 font-semibold">设置</h3>
        <div className="mb-2 text-sm">数据目录:</div>
        <div className="mb-3 break-all rounded bg-gray-100 p-2 text-xs">{root}</div>
        <div className="flex justify-end gap-2">
          <button className="rounded border px-3 py-1" onClick={async () => { if (await api.chooseDataRoot()) onClose() }}>更改目录</button>
          <button className="rounded border px-3 py-1" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
