import { useEffect, useState, type ReactNode } from 'react'
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Material } from '@shared/types'
import { api } from '../api'
import { childrenFolders, folderName, ancestorsAndSelf, isUnderOrEqual, parentPath } from '../../shared/folder-path'
import { materialRelPathsUnder } from '../material-select'
import { IconPlay, IconCheck, IconImage, IconBox, IconFolder, IconFolderPlus, IconPencil, IconTrash, IconClose, IconFolderOpen, IconCopy } from './icons'

interface Props {
  materials: Material[]
  folders: string[]
  currentFolder: string
  selectedIds: Set<string>
  selectedFolders: Set<string>
  onToggle: (relPath: string) => void
  onToggleFolder: (path: string) => void
  onOpen: (m: Material) => void
  onEnterFolder: (path: string) => void
  onCreateFolder: (name: string) => void
  onRenameFolder: (path: string, newName: string) => void
  onDeleteFolder: (path: string) => void
  onMoveMaterial: (relPath: string, folder: string) => void
  onDeleteMaterial: (relPath: string) => void
  onMoveFolder: (path: string, newParent: string) => void
  onOpenDir: (folder: string) => void
  onCopyDirPath: (folder: string) => void
  onCopyMaterialPath: (relPath: string) => void
}

function Thumb({ m }: { m: Material }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    api.thumbFor(m.relPath, m.kind, m.modifiedAt, m.sizeBytes).then((rel) => {
      if (!alive) return
      if (rel) api.fileUrl(rel).then((u) => { if (alive) setUrl(u) })
      else if (m.kind === 'image') api.fileUrl(m.relPath).then((u) => { if (alive) setUrl(u) })
      else setUrl(null)
    })
    return () => { alive = false }
  }, [m.relPath, m.kind, m.modifiedAt, m.sizeBytes])
  if (!url) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-paper-2 text-muted">
        {m.kind === 'video' ? <IconPlay className="text-2xl opacity-40" /> : m.kind === 'image' ? <IconImage className="text-2xl opacity-30" /> : <IconBox className="text-2xl opacity-30" />}
      </div>
    )
  }
  return <img src={url} alt="" className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.05]" />
}

/** Drag source (a material card). */
function Draggable({ id, data, children }: { id: string; data: Record<string, unknown>; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data })
  return (
    <div ref={setNodeRef} {...attributes} {...listeners}
      style={{ transform: CSS.Translate.toString(transform), zIndex: isDragging ? 50 : undefined }}
      className={`touch-none ${isDragging ? 'opacity-60' : ''}`}>
      {children}
    </div>
  )
}

/** A folder card: both a drag source (move the folder) and a drop target (accept items). */
function FolderDnd({ path, children }: { path: string; children: ReactNode }) {
  const drag = useDraggable({ id: `fdrag:${path}`, data: { kind: 'folder', path } })
  const drop = useDroppable({ id: `fdrop:${path}`, data: { folder: path } })
  return (
    <div
      ref={(el) => { drag.setNodeRef(el); drop.setNodeRef(el) }}
      {...drag.attributes} {...drag.listeners}
      style={{ transform: CSS.Translate.toString(drag.transform), zIndex: drag.isDragging ? 50 : undefined }}
      className={`touch-none rounded-xl2 transition ${drag.isDragging ? 'opacity-60' : ''} ${drop.isOver ? 'ring-2 ring-accent ring-offset-2 ring-offset-paper' : ''}`}>
      {children}
    </div>
  )
}

/** A breadcrumb crumb that accepts drops (move the dragged item into that folder). */
function CrumbDrop({ path, children }: { path: string; children: ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `cdrop:${path}`, data: { folder: path } })
  return <span ref={setNodeRef} className={`rounded-md ${isOver ? 'ring-2 ring-accent ring-offset-1 ring-offset-paper' : ''}`}>{children}</span>
}

export function MaterialGrid({ materials, folders, currentFolder, selectedIds, selectedFolders, onToggle, onToggleFolder, onOpen, onEnterFolder, onCreateFolder, onRenameFolder, onDeleteFolder, onMoveMaterial, onDeleteMaterial, onMoveFolder, onOpenDir, onCopyDirPath, onCopyMaterialPath }: Props) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [createErr, setCreateErr] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [renameErr, setRenameErr] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [confirmDelMat, setConfirmDelMat] = useState<Material | null>(null)

  const subfolders = childrenFolders(folders, currentFolder)
  const files = materials.filter((m) => m.folder === currentFolder)
  const crumbs = ['', ...ancestorsAndSelf(currentFolder)]
  const siblingNames = subfolders.map(folderName)

  // A short drag threshold lets clicks (open / select / rename) still work on the cards.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  function handleDragEnd(e: DragEndEvent) {
    const a = e.active.data.current as { kind?: string; relPath?: string; folder?: string; path?: string } | undefined
    const o = e.over?.data.current as { folder?: string } | undefined
    if (!a || !o || o.folder === undefined) return
    const target = o.folder
    if (a.kind === 'material') {
      if (a.folder !== target) onMoveMaterial(a.relPath!, target)
    } else if (a.kind === 'folder') {
      const src = a.path!
      if (src === target || isUnderOrEqual(target, src) || parentPath(src) === target) return // self / descendant / already there
      onMoveFolder(src, target)
    }
  }

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
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
    <div className="p-6">
      {/* breadcrumbs (each is also a drop target — drop a file/folder here to move it there) */}
      <div className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted">
        {crumbs.map((c, i) => (
          <span key={c || 'root'} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted/60">/</span>}
            <CrumbDrop path={c}>
              <button className="btn-ghost px-2 py-0.5 text-xs disabled:opacity-60" disabled={c === currentFolder} onClick={() => onEnterFolder(c)}>
                {c === '' ? '根目录' : folderName(c)}
              </button>
            </CrumbDrop>
          </span>
        ))}
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

        {/* subfolders — draggable (move) + droppable (accept) + selectable (export) */}
        {subfolders.map((path) => {
          const underRels = materialRelPathsUnder(materials, path)
          const folderSel = selectedFolders.has(path)
          return (
            <FolderDnd key={`f:${path}`} path={path}>
              <div className="group relative flex flex-col rounded-xl2 border border-line bg-surface transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lift">
                <button className="flex aspect-square w-full flex-col items-center justify-center gap-2 text-accent" onClick={() => onEnterFolder(path)}>
                  <IconFolder className="text-4xl" />
                </button>
                {/* top-left: select (same corner as material cards) */}
                <button onClick={() => onToggleFolder(path)} aria-label={folderSel ? '取消选择' : '选择该文件夹'} title={`选择此文件夹${underRels.length ? `的材料(${underRels.length})` : '(空)'}`}
                  className={`absolute left-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-md border backdrop-blur transition ${folderSel ? 'border-accent bg-accent text-white' : 'border-white/70 bg-white/65 text-transparent opacity-0 hover:text-muted group-hover:opacity-100'}`}>
                  <IconCheck className="text-[13px]" />
                </button>
                {/* top-right: actions (same corner as material cards) */}
                <div className="absolute right-2 top-2 z-10 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button className="grid h-6 w-6 place-items-center rounded-md border border-white/70 bg-white/65 text-muted backdrop-blur transition hover:text-accent-ink" title="打开目录" onClick={() => onOpenDir(path)}><IconFolderOpen className="text-[13px]" /></button>
                  <button className="grid h-6 w-6 place-items-center rounded-md border border-white/70 bg-white/65 text-muted backdrop-blur transition hover:text-accent-ink" title="复制路径" onClick={() => onCopyDirPath(path)}><IconCopy className="text-[13px]" /></button>
                  <button className="grid h-6 w-6 place-items-center rounded-md border border-white/70 bg-white/65 text-muted backdrop-blur transition hover:text-ink" title="重命名" onClick={() => { setRenaming(path); setRenameVal(folderName(path)); setRenameErr(null) }}><IconPencil className="text-[13px]" /></button>
                  <button className="grid h-6 w-6 place-items-center rounded-md border border-white/70 bg-white/65 text-muted backdrop-blur transition hover:text-danger" title="删除" onClick={() => setConfirmDel(path)}><IconTrash className="text-[13px]" /></button>
                </div>
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
                  <div className="truncate px-2.5 py-2 text-[12px] text-ink">{folderName(path)}</div>
                )}
              </div>
            </FolderDnd>
          )
        })}

        {/* files — draggable into folders */}
        {files.map((m, i) => {
          const sel = selectedIds.has(m.relPath)
          return (
            <Draggable key={m.relPath} id={`m:${m.relPath}`} data={{ kind: 'material', relPath: m.relPath, folder: m.folder }}>
              <div
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
                <button onClick={() => onToggle(m.relPath)} aria-label={sel ? '取消选择' : '选择'}
                  className={`absolute left-2 top-2 z-10 grid h-6 w-6 place-items-center rounded-md border backdrop-blur transition ${sel ? 'border-accent bg-accent text-white' : 'border-white/70 bg-white/65 text-transparent opacity-0 hover:text-muted group-hover:opacity-100'}`}>
                  <IconCheck className="text-[13px]" />
                </button>
                <div className="absolute right-2 top-2 z-10 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => onCopyMaterialPath(m.relPath)} title="复制路径" aria-label="复制路径"
                    className="grid h-6 w-6 place-items-center rounded-md border border-white/70 bg-white/65 text-muted backdrop-blur transition hover:text-accent-ink">
                    <IconCopy className="text-[13px]" />
                  </button>
                  <button onClick={() => setConfirmDelMat(m)} title="删除" aria-label="删除"
                    className="grid h-6 w-6 place-items-center rounded-md border border-white/70 bg-white/65 text-muted backdrop-blur transition hover:text-danger">
                    <IconTrash className="text-[13px]" />
                  </button>
                </div>
                <div className="truncate px-2.5 py-2 font-mono text-[11px] text-ink-soft">{m.name || m.relPath.split('/').pop()}</div>
              </div>
            </Draggable>
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

      {confirmDelMat && (
        <div className="scrim" onClick={() => setConfirmDelMat(null)}>
          <div className="modal-card max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-base font-bold">删除材料</h3>
              <button className="rounded-lg p-1.5 text-muted hover:bg-paper-2" onClick={() => setConfirmDelMat(null)}><IconClose className="text-[16px]" /></button>
            </div>
            <p className="text-sm text-ink-soft">将删除材料「{confirmDelMat.name || confirmDelMat.relPath.split('/').pop()}」,此操作不可撤销。</p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setConfirmDelMat(null)}>取消</button>
              <button className="btn-danger-solid" onClick={() => { onDeleteMaterial(confirmDelMat.relPath); setConfirmDelMat(null) }}>确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </DndContext>
  )
}
