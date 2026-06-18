import { useEffect, useState } from 'react'
import type { Material } from '@shared/types'
import { api } from '../api'
import { childrenFolders, folderName, ancestorsAndSelf } from '../../shared/folder-path'
import { IconPlay, IconCheck, IconImage, IconFolder, IconFolderPlus, IconPencil, IconTrash, IconClose, IconExternal } from './icons'

interface Props {
  materials: Material[]
  folders: string[]
  currentFolder: string
  selectedIds: Set<number>
  onToggle: (id: number) => void
  onOpen: (m: Material) => void
  onEnterFolder: (path: string) => void
  onCreateFolder: (name: string) => void
  onRenameFolder: (path: string, newName: string) => void
  onDeleteFolder: (path: string) => void
  onOpenDir: (folder: string) => void
}

function Thumb({ m }: { m: Material }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (m.thumbPath) api.fileUrl(m.thumbPath).then(setUrl)
    else if (m.kind === 'image') api.fileUrl(m.relPath).then(setUrl)
  }, [m.thumbPath, m.relPath, m.kind])
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-paper-2 text-muted">
        {m.kind === 'video' ? <IconPlay className="text-2xl opacity-40" /> : <IconImage className="text-2xl opacity-30" />}
      </div>
    )
  }
  return <img src={url} alt="" className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.05]" />
}

export function MaterialGrid({ materials, folders, currentFolder, selectedIds, onToggle, onOpen, onEnterFolder, onCreateFolder, onRenameFolder, onDeleteFolder, onOpenDir }: Props) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [renameErr, setRenameErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)

  const subfolders = childrenFolders(folders, currentFolder)
  const files = materials.filter((m) => m.folder === currentFolder)
  const crumbs = ['', ...ancestorsAndSelf(currentFolder)]
  const siblingNames = subfolders.map(folderName)

  /** Validate a folder name against its siblings. `self` excludes the folder being renamed. */
  function nameError(name: string, self?: string): string | null {
    const n = name.trim()
    if (!n) return null
    if (n.includes('/')) return '名称不能包含「/」'
    if (n === '.' || n === '..') return '名称无效'
    if (siblingNames.some((s) => s === n && s !== self)) return '已存在同名文件夹'
    return null
  }

  function closeCreate() { setCreating(false); setNewName(''); setCreateErr(null) }
  function commitCreate() {
    const n = newName.trim()
    if (n && !nameError(n)) onCreateFolder(n)
    closeCreate()
  }
  function onCreateKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return closeCreate()
    if (e.key !== 'Enter') return
    const err = nameError(newName)
    if (newName.trim() && err) { setCreateErr(err); return } // invalid → keep editing
    commitCreate()
  }

  function closeRename() { setRenaming(null); setRenameVal(''); setRenameErr(null) }
  function commitRename(path: string) {
    const n = renameVal.trim()
    if (n && n !== folderName(path) && !nameError(n, folderName(path))) onRenameFolder(path, n)
    closeRename()
  }
  function onRenameKey(e: React.KeyboardEvent, path: string) {
    if (e.key === 'Escape') return closeRename()
    if (e.key !== 'Enter') return
    const err = nameError(renameVal, folderName(path))
    if (renameVal.trim() && err) { setRenameErr(err); return }
    commitRename(path)
  }

  return (
    <div className="p-6">
      {/* breadcrumbs */}
      <div className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted">
        {crumbs.map((c, i) => (
          <span key={c || 'root'} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted/60">/</span>}
            <button className="btn-ghost px-2 py-0.5 text-xs disabled:opacity-60" disabled={c === currentFolder} onClick={() => onEnterFolder(c)}>
              {c === '' ? '根目录' : folderName(c)}
            </button>
          </span>
        ))}
        <span className="flex-1" />
        <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => onOpenDir(currentFolder)} title="在文件管理器中打开当前目录">
          <IconExternal className="text-[14px]" /> 打开当前目录
        </button>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-4">
        {/* new-folder tile: ghost card → in-place editable card */}
        {creating ? (
          <div className="flex flex-col overflow-hidden rounded-xl2 border-2 border-dashed border-accent bg-surface shadow-card">
            <span className="flex aspect-square w-full items-center justify-center text-accent"><IconFolder className="text-4xl" /></span>
            <div className="px-2 pb-2">
              <input
                autoFocus
                className={`field h-7 w-full py-1 text-xs ${createErr ? 'border-danger ring-1 ring-danger' : ''}`}
                value={newName}
                placeholder="文件夹名"
                onChange={(e) => { setNewName(e.target.value); setCreateErr(nameError(e.target.value)) }}
                onKeyDown={onCreateKey}
                onBlur={commitCreate}
              />
              {createErr && <p className="mt-1 leading-tight text-[10px] text-danger">{createErr}</p>}
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setCreating(true); setNewName(''); setCreateErr(null) }}
            className="group/new flex flex-col overflow-hidden rounded-xl2 border-2 border-dashed border-line transition-all duration-150 hover:-translate-y-0.5 hover:border-accent hover:shadow-lift"
          >
            <span className="flex aspect-square w-full items-center justify-center text-muted transition-colors group-hover/new:text-accent"><IconFolderPlus className="text-4xl" /></span>
            <span className="px-2.5 py-2 text-center text-[12px] font-medium text-muted transition-colors group-hover/new:text-accent">新建文件夹</span>
          </button>
        )}

        {/* subfolders */}
        {subfolders.map((path) => (
          <div key={`f:${path}`} className="group relative flex flex-col rounded-xl2 border border-line bg-surface transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lift">
            <button className="flex aspect-square w-full flex-col items-center justify-center gap-2 text-accent" onClick={() => onEnterFolder(path)}>
              <IconFolder className="text-4xl" />
            </button>
            {renaming === path ? (
              <div className="px-2 pb-2">
                <input
                  autoFocus
                  className={`field h-7 w-full py-1 text-xs ${renameErr ? 'border-danger ring-1 ring-danger' : ''}`}
                  value={renameVal}
                  onChange={(e) => { setRenameVal(e.target.value); setRenameErr(nameError(e.target.value, folderName(path))) }}
                  onKeyDown={(e) => onRenameKey(e, path)}
                  onBlur={() => commitRename(path)}
                />
                {renameErr && <p className="mt-1 leading-tight text-[10px] text-danger">{renameErr}</p>}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-1 px-2.5 py-2">
                <span className="truncate text-[12px] text-ink">{folderName(path)}</span>
                <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-paper-2 hover:text-ink" title="重命名" onClick={() => { setRenaming(path); setRenameVal(folderName(path)); setRenameErr(null) }}><IconPencil className="text-[13px]" /></button>
                  <button className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-danger-soft hover:text-danger" title="删除" onClick={() => setConfirmDel(path)}><IconTrash className="text-[13px]" /></button>
                </span>
              </div>
            )}
          </div>
        ))}

        {/* files */}
        {files.map((m, i) => {
          const sel = selectedIds.has(m.id)
          return (
            <div key={m.id}
              className={`group relative animate-rise overflow-hidden rounded-xl2 border bg-surface transition-all duration-150 ${sel ? 'border-accent shadow-card ring-2 ring-accent ring-offset-2 ring-offset-paper' : 'border-line hover:-translate-y-0.5 hover:shadow-lift'}`}
              style={{ animationDelay: `${Math.min(i, 16) * 18}ms` }}>
              <button className="relative block aspect-square w-full overflow-hidden bg-paper-2" onClick={() => onOpen(m)}>
                <Thumb m={m} />
                {m.kind === 'video' && (
                  <span className="pointer-events-none absolute left-1/2 top-1/2 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white shadow-lg" style={{ background: 'rgba(33,30,24,.55)', backdropFilter: 'blur(2px)' }}>
                    <IconPlay className="text-[15px]" />
                  </span>
                )}
              </button>
              <button onClick={() => onToggle(m.id)} aria-label={sel ? '取消选择' : '选择'}
                className={`absolute left-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-md border backdrop-blur transition ${sel ? 'border-accent bg-accent text-white' : 'border-white/70 bg-white/65 text-transparent opacity-0 hover:text-muted group-hover:opacity-100'}`}>
                <IconCheck className="text-[13px]" />
              </button>
              <div className="truncate px-2.5 py-2 font-mono text-[11px] text-ink-soft">{m.name || m.relPath.split('/').pop()}</div>
            </div>
          )
        })}
      </div>

      {subfolders.length === 0 && files.length === 0 && (
        <p className="mt-5 text-center text-xs text-muted">此目录为空 — 点上方「新建文件夹」整理,或用「新建材料」添加文件</p>
      )}

      {confirmDel && (
        <div className="scrim" onClick={() => setConfirmDel(null)}>
          <div className="modal-card max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-bold">删除文件夹</h3>
              <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2" onClick={() => setConfirmDel(null)}><IconClose className="text-[16px]" /></button>
            </div>
            <p className="text-sm text-ink-soft">将删除「{folderName(confirmDel)}」及其全部子文件夹与材料,此操作不可撤销。</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirmDel(null)}>取消</button>
              <button className="btn-danger-solid" onClick={() => { onDeleteFolder(confirmDel); setConfirmDel(null) }}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
