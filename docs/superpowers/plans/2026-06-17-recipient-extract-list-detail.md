# 收件人信息提取 + 列表/详情增强 Implementation Plan (Spec A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 售后单列表显示收件人/地区;新建售后单支持粘贴文本自动提取收件人信息(姓名/手机号/分机号/省市区/详细地址,可手动改);详情「拼多多」按钮改为「售后详情」并新增「订单详情」。

**Architecture:** 售后单新增内嵌字段 `extension`(分机号)。新增离线纯函数 `extractContact(text)`(复用内置 `china-divisions` 做省→市→区最长匹配)。UI:新建弹窗加「粘贴框+识别」与分机号字段;详情基本信息加分机号 + 两个跳转按钮;列表加两列。

**Tech Stack:** Electron(main/preload/renderer)、better-sqlite3、React + TypeScript + Tailwind、Vitest。

**ABI 提示:** 跑 vitest 前若报 `NODE_MODULE_VERSION`,先 `npm run rebuild:node`(下方命令已链上)。

---

## File Structure

**Modify:**
- `src/shared/types.ts` — `CustomerFields` 加 `extension`。
- `src/main/db/database.ts` — `TICKET_CUSTOMER_COLS` 加 `extension`(不入 FTS)。
- `src/main/db/tickets.ts` — `ROW`/`TROW`/`EMPTY_CUSTOMER`/create/update 加 `extension`。
- `tests/db/tickets.test.ts` — extension 读写断言。
- `src/renderer/components/NewTicketDialog.tsx` — 粘贴框+识别 + 分机号。
- `tests/renderer/NewTicketDialog.test.tsx` — 识别回填断言。
- `src/renderer/components/TicketDetail.tsx` — 分机号展示/编辑 + 售后详情/订单详情按钮。
- `src/renderer/components/TicketTable.tsx` — 收件人/地区 列。
- `tests/renderer/TicketTable.test.tsx` — 列渲染断言。

**Create:**
- `src/renderer/contact-extract.ts` — `extractContact` 纯函数。
- `tests/renderer/contact-extract.test.ts` — 提取单测。

每个任务独立绿(vitest + build 全程可过)。

---

## Task 1: 分机号字段(类型 + DB + 仓库)

**Files:**
- Modify: `src/shared/types.ts`, `src/main/db/database.ts`, `src/main/db/tickets.ts`
- Test: `tests/db/tickets.test.ts`

- [ ] **Step 1: 写失败测试**

在 `tests/db/tickets.test.ts` 的 `describe('TicketRepo', ...)` 内追加:
```ts
  it('stores and reads the extension field', () => {
    repo.create({ aftersaleNo: 'AS-X', orderNo: '', shippingNo: '', returnNo: '', note: '', phone: '17012345678', extension: '5678' })
    expect(repo.get('AS-X')!.extension).toBe('5678')
    repo.update('AS-X', { extension: '9999' })
    expect(repo.get('AS-X')!.extension).toBe('9999')
  })

  it('defaults extension to empty when omitted', () => {
    repo.create({ aftersaleNo: 'AS-Y', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    expect(repo.get('AS-Y')!.extension).toBe('')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run rebuild:node && npx vitest run tests/db/tickets.test.ts`
Expected: FAIL —— `Ticket` 无 `extension`(类型错)/ 列不存在。

- [ ] **Step 3: 类型 + DB 列 + 仓库**

`src/shared/types.ts` —— 在 `CustomerFields` 末尾(`addressDetail` 之后)加一行:
```ts
  addressDetail: string
  extension: string
```

`src/main/db/database.ts` —— 在 `TICKET_CUSTOMER_COLS` 数组末尾(`address_detail` 之后)加:
```ts
  ['address_detail', "address_detail TEXT NOT NULL DEFAULT ''"],
  ['extension', "extension TEXT NOT NULL DEFAULT ''"]
```
(不要改 `FTS_COLS_ARR`。)

`src/main/db/tickets.ts` —— 四处加 `extension`:
1. `ROW` 末尾(`address_detail AS addressDetail` 后)加 `, extension`:
```ts
  district_code AS districtCode, district, address_detail AS addressDetail, extension`
```
2. `TROW` 末尾同理:
```ts
  tickets.district_code AS districtCode, tickets.district, tickets.address_detail AS addressDetail, tickets.extension`
```
3. `EMPTY_CUSTOMER` 加 `extension: ''`:
```ts
const EMPTY_CUSTOMER: CustomerFields = {
  recipientName: '', phone: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: '', extension: ''
}
```
4. `create` 的 INSERT —— 列表加 `, extension`,VALUES 加 `, @extension`:
```ts
        `INSERT INTO tickets (aftersale_no, order_no, shipping_no, return_no, status, note, created_at, updated_at,
           recipient_name, phone, province_code, province, city_code, city, district_code, district, address_detail, extension)
         VALUES (@aftersaleNo, @orderNo, @shippingNo, @returnNo, 'pending', @note, @ts, @ts,
           @recipientName, @phone, @provinceCode, @province, @cityCode, @city, @districtCode, @district, @addressDetail, @extension)`
```
5. `update` 的 UPDATE SET 加 `, extension=@extension`:
```ts
         district_code=@districtCode, district=@district, address_detail=@addressDetail, extension=@extension
         WHERE aftersale_no=@aftersaleNo`
```
(`FtsRow`/`FTS_COLS`/ftsInsert/ftsDelete **不**改。)

- [ ] **Step 4: 跑测试**

Run: `npm run rebuild:node && npx vitest run tests/db/tickets.test.ts`
Expected: PASS。再跑 `npx vitest run` 应全绿。

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/db/database.ts src/main/db/tickets.ts tests/db/tickets.test.ts
git commit -m "feat: add extension (分机号) field to tickets"
```

---

## Task 2: `extractContact` 纯函数

**Files:**
- Create: `src/renderer/contact-extract.ts`
- Test: `tests/renderer/contact-extract.test.ts`

- [ ] **Step 1: 写失败测试**

Create `tests/renderer/contact-extract.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { extractContact } from '../../src/renderer/contact-extract'

describe('extractContact', () => {
  it('parses the 3-line sample (name / phone / address with bracket noise)', () => {
    const r = extractContact('程玲[2817]\n19592642954\n江苏省苏州市虎丘区 龙湖时代100 8栋2207[2817]')
    expect(r.name).toBe('程玲')
    expect(r.phone).toBe('19592642954')
    expect(r.extension).toBe('')
    expect(r.province).toBe('江苏省')
    expect(r.city).toBe('苏州市')
    expect(r.district).toBe('虎丘区')
    expect(r.addressDetail).toBe('龙湖时代100 8栋2207')
    expect(r.provinceCode).toBe('32')
    expect(r.cityCode).toBe('3205')
    expect(r.districtCode).toBe('320505')
  })

  it('extracts extension from a virtual number (转 and , separators)', () => {
    expect(extractContact('张三 17012345678转5678').extension).toBe('5678')
    expect(extractContact('张三 17012345678,5678').extension).toBe('5678')
    expect(extractContact('张三 17012345678').extension).toBe('')
  })

  it('parses a single-line flow format (name before province)', () => {
    const r = extractContact('张三 13800138000 江苏省苏州市虎丘区 龙湖时代100')
    expect(r.name).toBe('张三')
    expect(r.phone).toBe('13800138000')
    expect(r.province).toBe('江苏省')
    expect(r.district).toBe('虎丘区')
    expect(r.addressDetail).toBe('龙湖时代100')
  })

  it('parses a labeled format and a municipality (直辖市)', () => {
    const r = extractContact('收货人:李四\n联系电话:13800138000\n收货地址:北京市朝阳区某某路9号')
    expect(r.name).toBe('李四')
    expect(r.phone).toBe('13800138000')
    expect(r.province).toBe('北京市')
    expect(r.city).toBe('市辖区')
    expect(r.district).toBe('朝阳区')
    expect(r.addressDetail).toBe('某某路9号')
  })

  it('returns empty fields for blank / unrecognizable input', () => {
    expect(extractContact('')).toEqual({
      name: '', phone: '', extension: '', provinceCode: '', province: '',
      cityCode: '', city: '', districtCode: '', district: '', addressDetail: ''
    })
    const r = extractContact('随便一段没有手机也没有地址的文字')
    expect(r.phone).toBe('')
    expect(r.province).toBe('')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run rebuild:node && npx vitest run tests/renderer/contact-extract.test.ts`
Expected: FAIL —— 模块不存在。

- [ ] **Step 3: 实现 `src/renderer/contact-extract.ts`**

```ts
import { childrenOf, type Region } from './region'

export interface ExtractedContact {
  name: string
  phone: string
  extension: string
  provinceCode: string; province: string
  cityCode: string; city: string
  districtCode: string; district: string
  addressDetail: string
}

const EMPTY: ExtractedContact = {
  name: '', phone: '', extension: '', provinceCode: '', province: '',
  cityCode: '', city: '', districtCode: '', district: '', addressDetail: ''
}

// Remove [..] / 【..】 short-code noise, collapse whitespace.
function stripBrackets(s: string): string {
  return s.replace(/[[【][^\]】]*[\]】]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Remove a leading field label like 收货人: / 电话: / 收货地址: etc.
function stripLabel(s: string): string {
  return s.replace(/^(收货人|收件人|姓名|联系人|联系电话|联系方式|电话|手机号|手机|收货地址|所在地区|地址)[:：\s]*/, '').trim()
}

// Earliest (then longest) region whose name appears in `text`.
function findRegion(text: string, list: Region[]): { region: Region; index: number } | null {
  let best: { region: Region; index: number } | null = null
  for (const r of list) {
    const idx = text.indexOf(r.name)
    if (idx < 0) continue
    if (!best || idx < best.index || (idx === best.index && r.name.length > best.region.name.length)) {
      best = { region: r, index: idx }
    }
  }
  return best
}

function cut(text: string, index: number, len: number): string {
  return (text.slice(0, index) + ' ' + text.slice(index + len)).replace(/\s+/g, ' ').trim()
}

export function extractContact(text: string): ExtractedContact {
  const out: ExtractedContact = { ...EMPTY }
  if (!text || !text.trim()) return out

  const lines = text.split(/\r?\n/).map((l) => stripLabel(stripBrackets(l))).filter((l) => l.length > 0)

  // 1) phone (+ optional extension)
  const phoneRe = /(1[3-9]\d{9})(?:\s*(?:转|分机|ext\.?|[,，\-/])\s*(\d{1,6}))?/i
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(phoneRe)
    if (!m) continue
    out.phone = m[1]
    if (m[2]) out.extension = m[2]
    lines[i] = lines[i].replace(m[0], ' ').replace(/\s+/g, ' ').trim()
    break
  }

  // 2) address: first line containing a province name
  const provinces = childrenOf('')
  let addrIdx = -1
  let provHit: { region: Region; index: number } | null = null
  for (let i = 0; i < lines.length; i++) {
    const h = findRegion(lines[i], provinces)
    if (h) { provHit = h; addrIdx = i; break }
  }
  if (provHit && addrIdx >= 0) {
    const line = lines[addrIdx]
    const before = line.slice(0, provHit.index).trim() // flow-format name may sit before the province
    let rest = line.slice(provHit.index + provHit.region.name.length)
    out.provinceCode = provHit.region.code
    out.province = provHit.region.name

    const cities = childrenOf(provHit.region.code)
    const cityHit = findRegion(rest, cities)
    let city: Region | undefined = cityHit?.region
    if (cityHit) rest = cut(rest, cityHit.index, cityHit.region.name.length)
    else city = cities.find((c) => c.name === '市辖区') // 直辖市: single 市辖区 child
    if (city) {
      out.cityCode = city.code
      out.city = city.name
      const distHit = findRegion(rest, childrenOf(city.code))
      if (distHit) {
        out.districtCode = distHit.region.code
        out.district = distHit.region.name
        rest = cut(rest, distHit.index, distHit.region.name.length)
      }
    }
    out.addressDetail = rest.replace(/^[\s,，、]+/, '').replace(/\s+/g, ' ').trim()
    lines[addrIdx] = ''
    if (before) out.name = before.split(/\s+/)[0]
  }

  // 3) name fallback: first remaining non-empty line
  if (!out.name) {
    for (const l of lines) {
      const t = l.trim()
      if (t) { out.name = t.split(/\s+/)[0]; break }
    }
  }

  return out
}
```

- [ ] **Step 4: 跑测试**

Run: `npm run rebuild:node && npx vitest run tests/renderer/contact-extract.test.ts`
Expected: PASS(5 用例)。若直辖市用例的 `city`/`district` 断言与实际数据不符,用 `node -e "const d=require('./src/renderer/china-divisions.json'); console.log(d.filter(x=>x.name.includes('朝阳')))"` 核对北京下区县的 parent 链并据实调整断言(预期 北京市11→市辖区1101→朝阳区110105)。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/contact-extract.ts tests/renderer/contact-extract.test.ts
git commit -m "feat: extractContact — parse name/phone/extension/region from pasted text"
```

---

## Task 3: 新建售后单 —— 粘贴识别 + 分机号

**Files:**
- Modify: `src/renderer/components/NewTicketDialog.tsx`
- Test: `tests/renderer/NewTicketDialog.test.tsx`

- [ ] **Step 1: 改 `NewTicketDialog.tsx`**

加 import:
```tsx
import { useState } from 'react'
import type { NewTicket } from '@shared/types'
import { IconClose } from './icons'
import { RegionCascader, EMPTY_REGION, type RegionValue } from './RegionCascader'
import { extractContact } from '../contact-extract'
```

加 state(在 `addressDetail` 后):
```tsx
  const [addressDetail, setAddressDetail] = useState('')
  const [extension, setExtension] = useState('')
  const [pasteText, setPasteText] = useState('')
```

`reset()` 增加清空:
```tsx
  const reset = () => {
    setAftersaleNo(''); setOrderNo(''); setShippingNo(''); setReturnNo('')
    setRecipientName(''); setPhone(''); setRegion(EMPTY_REGION); setAddressDetail('')
    setExtension(''); setPasteText('')
  }
```

`submit()` 的 payload 增加 `extension`:
```tsx
    onCreate({
      aftersaleNo: no, orderNo: orderNo.trim(), shippingNo: shippingNo.trim(), returnNo: returnNo.trim(), note: '',
      recipientName: recipientName.trim(), phone: phone.trim(), extension: extension.trim(),
      ...region, addressDetail: addressDetail.trim()
    })
```

在 `submit` 之后加识别函数(非空才覆盖):
```tsx
  const recognize = () => {
    const r = extractContact(pasteText)
    if (r.name) setRecipientName(r.name)
    if (r.phone) setPhone(r.phone)
    if (r.extension) setExtension(r.extension)
    if (r.addressDetail) setAddressDetail(r.addressDetail)
    if (r.provinceCode) setRegion({
      provinceCode: r.provinceCode, province: r.province, cityCode: r.cityCode,
      city: r.city, districtCode: r.districtCode, district: r.district
    })
  }
```

把「客户信息(选填)」分隔线那一段(`<div className="border-t ...">客户信息(选填)</div>` 起,到 收货人姓名/手机号 的 grid)替换为:加入粘贴框,并把 手机号 grid 扩成 收货人姓名 / 手机号 / 分机号 三栏。即用下面整段替换现有从 `<div className="border-t ...客户信息(选填)</div>` 到 `</div>`(即 grid 结束)那一段:
```tsx
          <div className="border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">客户信息(选填)</div>
          <div>
            <span className="mb-1 block text-[12px] font-medium text-ink-soft">粘贴识别</span>
            <textarea
              className="field h-16 resize-none"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="粘贴收货地址,自动识别姓名/电话/地址"
            />
            <button className="btn-ghost mt-1.5 px-3 py-1 text-xs disabled:opacity-50" disabled={!pasteText.trim()} onClick={recognize}>识别</button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">收货人姓名</span>
              <input className="field" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">手机号</span>
              <input className="field tnum" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">分机号</span>
              <input className="field tnum" value={extension} onChange={(e) => setExtension(e.target.value)} />
            </label>
          </div>
```
(联系地址 / 详细地址 两块保持不变,仍在其后。)

- [ ] **Step 2: 更新 `tests/renderer/NewTicketDialog.test.tsx`**

现有「includes all customer fields」测试不引用昵称(已移除)。新增一个识别测试(放进 describe 内):
```ts
  it('recognizes pasted text and fills recipient fields', () => {
    const onCreate = vi.fn()
    render(<NewTicketDialog open onCreate={onCreate} onCancel={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('必填'), { target: { value: 'AS-R' } })
    fireEvent.change(screen.getByPlaceholderText('粘贴收货地址,自动识别姓名/电话/地址'), {
      target: { value: '程玲[2817]\n19592642954\n江苏省苏州市虎丘区 龙湖时代100 8栋2207[2817]' }
    })
    fireEvent.click(screen.getByText('识别'))
    fireEvent.click(screen.getByText('创建'))
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      aftersaleNo: 'AS-R', recipientName: '程玲', phone: '19592642954',
      province: '江苏省', city: '苏州市', district: '虎丘区', addressDetail: '龙湖时代100 8栋2207'
    }))
  })
```
若现有 thorough 测试用 `getByLabelText('手机号')` 等,仍可用(标签未变)。保留其它测试。

- [ ] **Step 3: 跑测试 + 类型检查**

Run: `npm run rebuild:node && npx vitest run tests/renderer/NewTicketDialog.test.tsx` —— PASS。
Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "NewTicketDialog"` —— 无输出。

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/NewTicketDialog.tsx tests/renderer/NewTicketDialog.test.tsx
git commit -m "feat(ui): paste-to-extract recipient info + extension field in new-ticket dialog"
```

---

## Task 4: 详情 —— 分机号 + 售后详情/订单详情按钮

**Files:**
- Modify: `src/renderer/components/TicketDetail.tsx`

- [ ] **Step 1: form 加 extension**

`form` 初始化对象(`addressDetail: ''` 后)加 `extension: ''`:
```tsx
    districtCode: '', district: '', addressDetail: '', extension: ''
  })
```
`startEdit` 的 `setForm({...})` 加 `extension: ticket.extension`(放在 `addressDetail: ticket.addressDetail` 后):
```tsx
      districtCode: ticket.districtCode, district: ticket.district, addressDetail: ticket.addressDetail, extension: ticket.extension
    })
```

- [ ] **Step 2: 手机号行展示/编辑分机号**

把现有「手机号」`<InfoRow>` 整段替换为(编辑态多一个分机号输入;展示态 `手机号 转 分机`):
```tsx
            <InfoRow label="手机号">
              {editing
                ? <div className="flex gap-2">
                    <input className="field tnum py-1.5" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="手机号" />
                    <input className="field tnum w-24 py-1.5" value={form.extension} onChange={(e) => setForm((f) => ({ ...f, extension: e.target.value }))} placeholder="分机号" />
                  </div>
                : <Value v={ticket.phone ? (ticket.extension ? `${ticket.phone} 转 ${ticket.extension}` : ticket.phone) : ''} />}
            </InfoRow>
```

- [ ] **Step 3: 按钮重命名 + 新增订单详情**

把 `openPdd` 重命名为 `openAftersale`(函数体不变),并新增 `openOrder`:
```tsx
  function openAftersale() {
    if (!ticket) return
    const params = new URLSearchParams({ id: ticket.aftersaleNo })
    if (ticket.orderNo) params.set('orderSn', ticket.orderNo)
    api.openInChrome(`https://mms.pinduoduo.com/aftersales-ssr/detail?${params}`)
  }
  function openOrder() {
    if (!ticket || !ticket.orderNo) return
    api.openInChrome(`https://mms.pinduoduo.com/orders/detail?sn=${encodeURIComponent(ticket.orderNo)}`)
  }
```
头部按钮组(现有 `拼多多` 按钮所在的 `<div className="ml-auto flex items-center gap-2">`)替换为:
```tsx
        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost px-2.5" onClick={openAftersale} title="在拼多多打开售后详情">
            <IconExternal className="text-[15px]" /> 售后详情
          </button>
          <button className="btn-ghost px-2.5 disabled:opacity-50" onClick={openOrder} disabled={!ticket.orderNo} title="在拼多多打开订单详情">
            <IconExternal className="text-[15px]" /> 订单详情
          </button>
          <button className="btn-danger px-2.5" onClick={() => setConfirmDelete(true)}>
            <IconTrash className="text-[15px]" /> 删除
          </button>
        </div>
```

- [ ] **Step 4: 类型检查 + 构建**

Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "TicketDetail"` —— 无输出。
Run: `npm run build` —— 成功。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/TicketDetail.tsx
git commit -m "feat(ui): extension display/edit; 售后详情 + 订单详情 buttons in ticket detail"
```

---

## Task 5: 售后单列表 —— 收件人 / 地区 列

**Files:**
- Modify: `src/renderer/components/TicketTable.tsx`
- Test: `tests/renderer/TicketTable.test.tsx`

- [ ] **Step 1: 写失败测试**

先读 `tests/renderer/TicketTable.test.tsx` 现有结构(它已有构造 `Ticket` 的 `mk(...)` helper,含全部 CustomerFields 空值)。给某行 fixture 设上 `recipientName`/`province`/`city`/`district`,并追加断言(放进现有 describe;沿用其 import 与 `mk` helper):
```ts
  it('shows recipient name and region columns', () => {
    const onOpen = vi.fn()
    render(<TicketTable tickets={[mk({ aftersaleNo: 'AS-1', recipientName: '程玲', province: '江苏省', city: '苏州市', district: '虎丘区' })]} query="" onOpen={onOpen} onNew={() => {}} />)
    expect(screen.getByText('程玲')).toBeTruthy()
    expect(screen.getByText('江苏省 · 苏州市 · 虎丘区')).toBeTruthy()
  })
```
> 注:`mk` 若不接受这些字段覆盖,改为在 `mk` 的默认对象里允许 `...over` 覆盖(它本就 spread `...over`)。`extension` 字段也需在 `mk` 默认值里补 `extension: ''`(Task 1 已让 `Ticket` 要求该字段;若 `mk` 的 fixture 缺它会有类型错——在 `mk` 默认对象补 `extension: ''`)。

- [ ] **Step 2: 跑测试确认失败**

Run: `npm run rebuild:node && npx vitest run tests/renderer/TicketTable.test.tsx`
Expected: FAIL —— 找不到收件人/地区文本(列未加)。

- [ ] **Step 3: 加列**

`src/renderer/components/TicketTable.tsx`:
1. 顶部 import 加 `regionLabel`:
```tsx
import { regionLabel } from '../region'
```
(若已 import 其它来自 `../region` 的,合并。)
2. 表头(`<thead>` 里),在 `<th ...>状态</th>` 之后插入两列:
```tsx
                <th className="px-4 py-2.5 text-left font-medium">状态</th>
                <th className="px-4 py-2.5 text-left font-medium">收件人</th>
                <th className="px-4 py-2.5 text-left font-medium">地区</th>
```
3. 行(`<tbody>` 的 `map` 里),在状态 `<td>`(含 `chip`)之后插入两格:
```tsx
                    <td className="px-4 py-3"><span className={`chip ${meta.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span></td>
                    <td className="px-4 py-3 text-ink-soft">{t.recipientName || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{regionLabel(t) || '—'}</td>
```

- [ ] **Step 4: 跑测试 + 构建**

Run: `npm run rebuild:node && npx vitest run tests/renderer/TicketTable.test.tsx` —— PASS。
Run: `npx vitest run` —— 全绿(报告计数)。
Run: `npm run build` —— 成功。
Run: `npx tsc --noEmit --ignoreDeprecations 6.0 2>&1 | grep -E "^src/" | grep -vE "Cannot find (name|module).*(node:|Buffer|process|console|HTMLElement|File|Blob|URL|window|document|Image|DataTransfer|ClipboardEvent|import\.meta|__dirname|require)"` —— 无输出。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/TicketTable.tsx tests/renderer/TicketTable.test.tsx
git commit -m "feat(ui): show recipient + region columns in ticket list"
```

---

## 手验清单(dev)

`npm run rebuild:electron && npm run dev`:
- 新建售后单 → 粘贴样例(`程玲[2817]` / `19592642954` / `江苏省苏州市虎丘区 龙湖时代100 8栋2207[2817]`)→ 点识别 → 姓名/手机/省市区/详细地址正确回填;可手动改;保存。
- 虚拟号样例(带 `转5678`)→ 分机号回填。
- 列表显示 收件人 / 地区 两列。
- 详情:手机号显示「号码 转 分机」;「售后详情」「订单详情」按钮分别用 Chrome 打开对应页面;无订单号时「订单详情」禁用。
- 验证后 `npm run rebuild:node` 还原 ABI。

---

## Self-Review(已核对 spec)

- **Spec §2 数据模型(extension)**:Task 1。✓
- **Spec §3 extractContact**:Task 2(去噪/手机+分机/省市区最长匹配+直辖市/姓名/兜底)。✓
- **Spec §4.1 新建弹窗粘贴识别 + 分机号**:Task 3。✓
- **Spec §4.2 详情分机号展示/编辑**:Task 4 Step 1-2。✓
- **Spec §4.3 列表收件人/地区**:Task 5。✓
- **Spec §4.4 售后详情/订单详情按钮**:Task 4 Step 3。✓
- **Spec §5 测试**:extractContact 单测(样例+直辖市+虚拟号+标签+缺项);tickets extension;NewTicketDialog 识别;TicketTable 列。✓
- **类型一致**:`extension` 字段名在 types/db/repo/dialog/detail/fixture 全程一致;`ExtractedContact` 字段与 `recognize()` 回填字段一致;`regionLabel(t)` 接受含 province/city/district 的对象(Ticket 满足)。✓
- **占位符扫描**:无 TBD;每步含完整代码;直辖市断言附了据实核对的兜底说明。✓
