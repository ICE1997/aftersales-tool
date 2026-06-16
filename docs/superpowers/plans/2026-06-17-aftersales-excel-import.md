# 售后单 Excel 导入 + 售后字段扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从拼多多售后导出的 `.xlsx` 批量导入售后单(按售后编号去重、已存在跳过),并把售后单数据模型从 3 态状态扩展为 10 个 PDD 售后状态 + 7 个新售后字段(全部可手动编辑)。

**Architecture:** 后端先落数据模型(共享类型 → DB 迁移 → 仓库),再加纯函数列映射与 xlsx 读取 + IPC,最后接 UI(列表列与导入按钮、结果弹窗、新建/详情表单)。解析与映射为离线纯函数,可单测;新增依赖 `xlsx` 为纯 JS,不引入原生模块。

**Tech Stack:** Electron + electron-vite、React + TypeScript + Tailwind、better-sqlite3(FTS5)、SheetJS `xlsx`(只读)、Vitest。

## Global Constraints

- 原生模块 ABI:跑 Vitest 前若报 `NODE_MODULE_VERSION`,先 `npm run rebuild:node`;跑 `npm run dev` 前 `npm run rebuild:electron`。
- 新依赖 `xlsx@^0.18.5` 放入 `dependencies`(纯 JS,无需 rebuild)。
- 售后状态枚举(10 值,逐字):`待商家处理` `待商家收货` `待消费者发货` `平台处理中` `退款成功` `退款关闭` `换货/补寄成功` `换货/补寄关闭` `维修成功` `维修关闭`。
- 手动新建 / 映射缺省的默认状态:`待商家处理`。
- 7 个新字段一律 `TEXT NOT NULL DEFAULT ''` 存储;`NewTicket`/`Ticket` 字段名用驼峰:`aftersaleType, aftersaleReason, shippingStatus, amount, refundAmount, appliedAt, returnLogistics`。
- 存量状态迁移映射:`pending→待商家处理`、`processing→平台处理中`、`resolved→退款成功`,幂等。
- 不导入买家等用户信息;仅支持 `.xlsx`;FTS 列集合不变(新字段不进全文检索)。
- 每个 Task 结束 commit。

---

### Task 1: 后端数据模型(共享类型 + DB 迁移 + 仓库)

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/db/database.ts`
- Modify: `src/main/db/tickets.ts`
- Test: `tests/db/tickets.test.ts`

**Interfaces:**
- Produces:
  - `TicketStatus`(10 值联合)、`AftersaleFields`、扩展后的 `Ticket`/`NewTicket`、`ImportTicketsResult`(`src/shared/types.ts`)。
  - `TicketRepo.create(t: NewTicket): void`(status 缺省 `待商家处理`)、`update(no, patch)`、`existingNos(nos: string[]): Set<string>`、`createMany(tickets: NewTicket[]): void`。

- [ ] **Step 1: 写失败测试** — 在 `tests/db/tickets.test.ts` 顶部已有用例;把旧状态值替换为新值,并追加新用例。先把第 4 行的 import 改为同时引入迁移函数(ESM 项目,不能用 `require`):

```ts
import { createDatabase, migrateLegacyStatuses } from '../../src/main/db/database'
```

再把现有两处旧状态改掉:

把
```ts
    expect(t?.status).toBe('pending')
```
改为
```ts
    expect(t?.status).toBe('待商家处理')
```
把
```ts
    repo.update('AS-1', { status: 'resolved', note: 'done' })
    const t = repo.get('AS-1')
    expect(t?.status).toBe('resolved')
```
改为
```ts
    repo.update('AS-1', { status: '退款成功', note: 'done' })
    const t = repo.get('AS-1')
    expect(t?.status).toBe('退款成功')
```
然后在 `describe('TicketRepo', …)` 内追加:
```ts
  it('stores and reads the new aftersale fields', () => {
    repo.create({
      aftersaleNo: 'AS-AF', orderNo: '', shippingNo: '', returnNo: '', note: '',
      status: '退款成功', aftersaleType: '退款退货', aftersaleReason: '质量问题',
      shippingStatus: '已发货', amount: '24.99', refundAmount: '24.99',
      appliedAt: '2026-05-28 14:27:38', returnLogistics: '签收',
    })
    const t = repo.get('AS-AF')!
    expect(t.status).toBe('退款成功')
    expect(t.aftersaleType).toBe('退款退货')
    expect(t.aftersaleReason).toBe('质量问题')
    expect(t.shippingStatus).toBe('已发货')
    expect(t.amount).toBe('24.99')
    expect(t.refundAmount).toBe('24.99')
    expect(t.appliedAt).toBe('2026-05-28 14:27:38')
    expect(t.returnLogistics).toBe('签收')
  })

  it('defaults status to 待商家处理 when not provided', () => {
    repo.create({ aftersaleNo: 'AS-D', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    expect(repo.get('AS-D')!.status).toBe('待商家处理')
  })

  it('existingNos returns only the ones already in the DB', () => {
    repo.create({ aftersaleNo: 'E1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    repo.create({ aftersaleNo: 'E2', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    const found = repo.existingNos(['E1', 'E3', 'E2'])
    expect([...found].sort()).toEqual(['E1', 'E2'])
  })

  it('createMany bulk-inserts and keeps them searchable', () => {
    repo.createMany([
      { aftersaleNo: 'M1', orderNo: 'OM1', shippingNo: '', returnNo: '', note: '' },
      { aftersaleNo: 'M2', orderNo: 'OM2', shippingNo: '', returnNo: '', note: '' },
    ])
    expect(repo.list().length).toBe(2)
    expect(repo.search('OM1').map((t) => t.aftersaleNo)).toContain('M1')
  })

  it('migrates legacy status values once and idempotently', () => {
    // simulate a legacy row by writing the old value directly
    repo.create({ aftersaleNo: 'L1', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    db.prepare("UPDATE tickets SET status='resolved' WHERE aftersale_no='L1'").run()
    // re-run the migration (imported at top from database.ts)
    migrateLegacyStatuses(db)
    expect(repo.get('L1')!.status).toBe('退款成功')
    migrateLegacyStatuses(db) // idempotent
    expect(repo.get('L1')!.status).toBe('退款成功')
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/db/tickets.test.ts`
Expected: FAIL(`existingNos`/`createMany`/`migrateLegacyStatuses is not a function`,以及新字段断言报错)。

- [ ] **Step 3: 扩展共享类型** — 编辑 `src/shared/types.ts`:把
```ts
export type TicketStatus = 'pending' | 'processing' | 'resolved'
```
替换为
```ts
export type TicketStatus =
  | '待商家处理' | '待商家收货' | '待消费者发货' | '平台处理中'
  | '退款成功' | '退款关闭' | '换货/补寄成功' | '换货/补寄关闭' | '维修成功' | '维修关闭'

export interface AftersaleFields {
  aftersaleType: string
  aftersaleReason: string
  shippingStatus: string
  amount: string
  refundAmount: string
  appliedAt: string
  returnLogistics: string
}
```
把 `NewTicket` 改为:
```ts
export type NewTicket = {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  note: string
  status?: TicketStatus
} & Partial<CustomerFields> & Partial<AftersaleFields>
```
把 `Ticket` 改为(在 `CustomerFields` 交叉上再并 `AftersaleFields`):
```ts
export type Ticket = {
  aftersaleNo: string
  orderNo: string
  shippingNo: string
  returnNo: string
  status: TicketStatus
  note: string
  createdAt: number
  updatedAt: number
} & CustomerFields & AftersaleFields
```
在文件末尾追加:
```ts
export interface ImportTicketsResult {
  imported: number
  skippedExisting: number
  duplicatedInFile: number
  failed: { row: number; reason: string }[]
}
```

- [ ] **Step 4: DB 迁移** — 编辑 `src/main/db/database.ts`。在 `TICKET_CUSTOMER_COLS` 之后新增:
```ts
const TICKET_AFTERSALE_COLS: [string, string][] = [
  ['aftersale_type', "aftersale_type TEXT NOT NULL DEFAULT ''"],
  ['aftersale_reason', "aftersale_reason TEXT NOT NULL DEFAULT ''"],
  ['shipping_status', "shipping_status TEXT NOT NULL DEFAULT ''"],
  ['amount', "amount TEXT NOT NULL DEFAULT ''"],
  ['refund_amount', "refund_amount TEXT NOT NULL DEFAULT ''"],
  ['applied_at', "applied_at TEXT NOT NULL DEFAULT ''"],
  ['return_logistics', "return_logistics TEXT NOT NULL DEFAULT ''"],
]
```
在 `migrate` 的 `for (const [col, ddl] of TICKET_CUSTOMER_COLS) …` 之后追加:
```ts
  for (const [col, ddl] of TICKET_AFTERSALE_COLS) ensureColumn(db, 'tickets', col, ddl)
  migrateLegacyStatuses(db)
```
并在文件中新增导出函数(放在 `ensureColumn` 附近):
```ts
/** One-time, idempotent: map the old 3-state status values to the new PDD set. */
export function migrateLegacyStatuses(db: DB): void {
  db.prepare("UPDATE tickets SET status='待商家处理' WHERE status='pending'").run()
  db.prepare("UPDATE tickets SET status='平台处理中' WHERE status='processing'").run()
  db.prepare("UPDATE tickets SET status='退款成功' WHERE status='resolved'").run()
}
```

- [ ] **Step 5: 仓库扩展** — 编辑 `src/main/db/tickets.ts`。

5a. `ROW` 末尾追加新列(在 `extension` 后):
```ts
const ROW = `aftersale_no AS aftersaleNo, order_no AS orderNo, shipping_no AS shippingNo,
  return_no AS returnNo, status, note, created_at AS createdAt, updated_at AS updatedAt,
  recipient_name AS recipientName, phone,
  province_code AS provinceCode, province, city_code AS cityCode, city,
  district_code AS districtCode, district, address_detail AS addressDetail, extension,
  aftersale_type AS aftersaleType, aftersale_reason AS aftersaleReason, shipping_status AS shippingStatus,
  amount, refund_amount AS refundAmount, applied_at AS appliedAt, return_logistics AS returnLogistics`
```
`TROW` 同样追加(每列前加 `tickets.`):
```ts
const TROW = `tickets.aftersale_no AS aftersaleNo, tickets.order_no AS orderNo, tickets.shipping_no AS shippingNo,
  tickets.return_no AS returnNo, tickets.status, tickets.note, tickets.created_at AS createdAt, tickets.updated_at AS updatedAt,
  tickets.recipient_name AS recipientName, tickets.phone,
  tickets.province_code AS provinceCode, tickets.province, tickets.city_code AS cityCode, tickets.city,
  tickets.district_code AS districtCode, tickets.district, tickets.address_detail AS addressDetail, tickets.extension,
  tickets.aftersale_type AS aftersaleType, tickets.aftersale_reason AS aftersaleReason, tickets.shipping_status AS shippingStatus,
  tickets.amount, tickets.refund_amount AS refundAmount, tickets.applied_at AS appliedAt, tickets.return_logistics AS returnLogistics`
```

5b. 在 `EMPTY_CUSTOMER` 之后新增:
```ts
const EMPTY_AFTERSALE = {
  aftersaleType: '', aftersaleReason: '', shippingStatus: '',
  amount: '', refundAmount: '', appliedAt: '', returnLogistics: ''
}
```
并在 `import type` 行加入 `AftersaleFields`:
```ts
import type { Ticket, NewTicket, CustomerFields, AftersaleFields } from '../../shared/types'
```

5c. 替换 `create`:
```ts
  create(t: NewTicket): void {
    const ts = this.now()
    const row = { ...EMPTY_CUSTOMER, ...EMPTY_AFTERSALE, ...t, status: t.status || '待商家处理', ts }
    const tx = this.db.transaction(() => {
      this.db.prepare(
        `INSERT INTO tickets (aftersale_no, order_no, shipping_no, return_no, status, note, created_at, updated_at,
           recipient_name, phone, province_code, province, city_code, city, district_code, district, address_detail, extension,
           aftersale_type, aftersale_reason, shipping_status, amount, refund_amount, applied_at, return_logistics)
         VALUES (@aftersaleNo, @orderNo, @shippingNo, @returnNo, @status, @note, @ts, @ts,
           @recipientName, @phone, @provinceCode, @province, @cityCode, @city, @districtCode, @district, @addressDetail, @extension,
           @aftersaleType, @aftersaleReason, @shippingStatus, @amount, @refundAmount, @appliedAt, @returnLogistics)`
      ).run(row)
      this.ftsInsert(t.aftersaleNo)
    })
    tx()
  }
```

5d. 替换 `update` 的方法签名与 UPDATE 语句(加入新字段;签名并入 `AftersaleFields`):
```ts
  update(
    aftersaleNo: string,
    patch: Partial<Pick<Ticket, 'orderNo' | 'shippingNo' | 'returnNo' | 'status' | 'note'> & CustomerFields & AftersaleFields>
  ): void {
    const cur = this.get(aftersaleNo)
    if (!cur) return
    const next = { ...cur, ...patch, updatedAt: this.now() }
    const tx = this.db.transaction(() => {
      this.ftsDelete(aftersaleNo)
      this.db.prepare(
        `UPDATE tickets SET order_no=@orderNo, shipping_no=@shippingNo, return_no=@returnNo,
         status=@status, note=@note, updated_at=@updatedAt,
         recipient_name=@recipientName, phone=@phone,
         province_code=@provinceCode, province=@province, city_code=@cityCode, city=@city,
         district_code=@districtCode, district=@district, address_detail=@addressDetail, extension=@extension,
         aftersale_type=@aftersaleType, aftersale_reason=@aftersaleReason, shipping_status=@shippingStatus,
         amount=@amount, refund_amount=@refundAmount, applied_at=@appliedAt, return_logistics=@returnLogistics
         WHERE aftersale_no=@aftersaleNo`
      ).run(next as any)
      this.ftsInsert(aftersaleNo)
    })
    tx()
  }
```

5e. 在 `delete` 方法之前新增两个方法:
```ts
  existingNos(nos: string[]): Set<string> {
    const found = new Set<string>()
    const CHUNK = 500
    for (let i = 0; i < nos.length; i += CHUNK) {
      const slice = nos.slice(i, i + CHUNK)
      if (slice.length === 0) continue
      const ph = slice.map(() => '?').join(',')
      const rows = this.db.prepare(`SELECT aftersale_no AS no FROM tickets WHERE aftersale_no IN (${ph})`).all(...slice) as { no: string }[]
      for (const r of rows) found.add(r.no)
    }
    return found
  }

  createMany(tickets: NewTicket[]): void {
    const tx = this.db.transaction(() => {
      for (const t of tickets) this.create(t)
    })
    tx()
  }
```

- [ ] **Step 6: 跑测试确认通过**

Run: `npx vitest run tests/db/tickets.test.ts`
Expected: PASS(全部用例,含新字段、existingNos、createMany、迁移幂等)。

- [ ] **Step 7: Commit**

```bash
git add src/shared/types.ts src/main/db/database.ts src/main/db/tickets.ts tests/db/tickets.test.ts
git commit -m "feat(db): expand ticket model with PDD status + aftersale fields; bulk import helpers"
```

---

### Task 2: 状态元数据 + 编辑选项常量

**Files:**
- Modify: `src/renderer/status.ts`
- Create: `src/renderer/aftersale-options.ts`
- Test: `tests/renderer/status.test.ts`

**Interfaces:**
- Consumes: `TicketStatus`(Task 1)。
- Produces: `STATUS_META`(键覆盖全部 10 个 `TicketStatus`)、`STATUS_ORDER: TicketStatus[]`;`TYPE_OPTIONS / REASON_OPTIONS / SHIPPING_OPTIONS: string[]`、`withCurrent(options, current): string[]`(`aftersale-options.ts`)。

- [ ] **Step 1: 写失败测试** — 新建 `tests/renderer/status.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { STATUS_META, STATUS_ORDER } from '../../src/renderer/status'
import { withCurrent, TYPE_OPTIONS } from '../../src/renderer/aftersale-options'

const ALL = [
  '待商家处理','待商家收货','待消费者发货','平台处理中',
  '退款成功','退款关闭','换货/补寄成功','换货/补寄关闭','维修成功','维修关闭',
] as const

describe('status metadata', () => {
  it('has meta for all 10 statuses', () => {
    for (const s of ALL) {
      expect(STATUS_META[s]).toBeTruthy()
      expect(STATUS_META[s].label).toBe(s)
      expect(typeof STATUS_META[s].chip).toBe('string')
      expect(typeof STATUS_META[s].dot).toBe('string')
    }
  })
  it('STATUS_ORDER lists all 10 once', () => {
    expect([...STATUS_ORDER].sort()).toEqual([...ALL].sort())
  })
})

describe('aftersale-options', () => {
  it('withCurrent prepends a non-standard current value', () => {
    expect(withCurrent(TYPE_OPTIONS, '做工问题')).toEqual(['做工问题', ...TYPE_OPTIONS])
  })
  it('withCurrent keeps options unchanged for a standard value', () => {
    expect(withCurrent(TYPE_OPTIONS, '退款')).toEqual(TYPE_OPTIONS)
  })
  it('withCurrent ignores empty current', () => {
    expect(withCurrent(TYPE_OPTIONS, '')).toEqual(TYPE_OPTIONS)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/status.test.ts`
Expected: FAIL(`aftersale-options` 模块不存在、`STATUS_META` 仍是旧 3 键)。

- [ ] **Step 3: 重写 `src/renderer/status.ts`**
```ts
import type { TicketStatus } from '@shared/types'

// Chinese labels + Tailwind class tokens for each ticket status.
// Full class strings are written out so Tailwind's content scanner keeps them.
export const STATUS_META: Record<TicketStatus, { label: string; dot: string; chip: string }> = {
  '待商家处理': { label: '待商家处理', dot: 'bg-warn', chip: 'bg-warn-soft text-warn' },
  '待商家收货': { label: '待商家收货', dot: 'bg-warn', chip: 'bg-warn-soft text-warn' },
  '待消费者发货': { label: '待消费者发货', dot: 'bg-info', chip: 'bg-info-soft text-info' },
  '平台处理中': { label: '平台处理中', dot: 'bg-info', chip: 'bg-info-soft text-info' },
  '退款成功': { label: '退款成功', dot: 'bg-ok', chip: 'bg-ok-soft text-ok' },
  '换货/补寄成功': { label: '换货/补寄成功', dot: 'bg-ok', chip: 'bg-ok-soft text-ok' },
  '维修成功': { label: '维修成功', dot: 'bg-ok', chip: 'bg-ok-soft text-ok' },
  '退款关闭': { label: '退款关闭', dot: 'bg-muted', chip: 'bg-paper-2 text-muted' },
  '换货/补寄关闭': { label: '换货/补寄关闭', dot: 'bg-muted', chip: 'bg-paper-2 text-muted' },
  '维修关闭': { label: '维修关闭', dot: 'bg-muted', chip: 'bg-paper-2 text-muted' }
}

export const STATUS_ORDER: TicketStatus[] = [
  '待商家处理', '待商家收货', '待消费者发货', '平台处理中',
  '退款成功', '换货/补寄成功', '维修成功', '退款关闭', '换货/补寄关闭', '维修关闭'
]
```

- [ ] **Step 4: 新建 `src/renderer/aftersale-options.ts`**
```ts
// Standard dropdown options for the editable aftersale fields.
export const TYPE_OPTIONS = ['退款', '退款退货', '换货', '补寄', '维修']
export const REASON_OPTIONS = ['七天无理由退货', '其他原因', '质量问题', '商品描述不符', '发货履约原因', '少件', '疑似假货']
export const SHIPPING_OPTIONS = ['未发货', '已发货']

/** Options to render in a <select>: prepend the current value if it isn't a standard option
 * (so imported, non-standard values are preserved and selectable). */
export function withCurrent(options: string[], current: string): string[] {
  return current && !options.includes(current) ? [current, ...options] : options
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/renderer/status.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/status.ts src/renderer/aftersale-options.ts tests/renderer/status.test.ts
git commit -m "feat(ui): 10-value status metadata + editable aftersale option lists"
```

---

### Task 3: 纯函数列映射 `mapRows`

**Files:**
- Create: `src/main/services/ticket-import-map.ts`
- Test: `tests/services/ticket-import-map.test.ts`

**Interfaces:**
- Consumes: `NewTicket`(Task 1)。
- Produces: `mapRows(matrix: string[][]): MapResult`,`MapResult = { tickets: NewTicket[]; failed: { row: number; reason: string }[]; duplicatedInFile: number; missingRequiredHeader: boolean }`。

- [ ] **Step 1: 写失败测试** — 新建 `tests/services/ticket-import-map.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { mapRows } from '../../src/main/services/ticket-import-map'

const HEADER = ['售后编号', '订单编号', '发货运单号', '退货运单号', '售后状态', '退款类型', '退款原因', '订单状态', '交易金额', '退款金额', '申请时间', '退货物流状态', '买家']

describe('mapRows', () => {
  it('maps known columns and ignores unknown ones (e.g. 买家)', () => {
    const r = mapRows([
      HEADER,
      ['AS1', 'O1', 'S1', 'R1', '退款成功', '退货退款', '质量问题', '已发货', '24.99', '24.99', '2026-05-28 14:27:38', '签收', '王*: 1*****9'],
    ])
    expect(r.missingRequiredHeader).toBe(false)
    expect(r.tickets).toHaveLength(1)
    const t = r.tickets[0]
    expect(t.aftersaleNo).toBe('AS1')
    expect(t.orderNo).toBe('O1')
    expect(t.shippingNo).toBe('S1')
    expect(t.returnNo).toBe('R1')
    expect(t.status).toBe('退款成功')
    expect(t.aftersaleType).toBe('退货退款')
    expect(t.aftersaleReason).toBe('质量问题')
    expect(t.shippingStatus).toBe('已发货')
    expect(t.amount).toBe('24.99')
    expect(t.refundAmount).toBe('24.99')
    expect(t.appliedAt).toBe('2026-05-28 14:27:38')
    expect(t.returnLogistics).toBe('签收')
    expect((t as Record<string, unknown>).recipientName).toBeUndefined()
  })

  it('flags a missing 售后编号 header', () => {
    const r = mapRows([['订单编号', '售后状态'], ['O1', '退款成功']])
    expect(r.missingRequiredHeader).toBe(true)
    expect(r.tickets).toHaveLength(0)
  })

  it('records rows with empty 售后编号 as failed (with 1-based Excel row number)', () => {
    const r = mapRows([HEADER, ['', 'O1', '', '', '', '', '', '', '', '', '', '', '']])
    expect(r.tickets).toHaveLength(0)
    expect(r.failed).toEqual([{ row: 2, reason: '缺少售后编号' }])
  })

  it('keeps the first of in-file duplicates and counts the rest', () => {
    const row = (no: string, ord: string) => [no, ord, '', '', '', '', '', '', '', '', '', '', '']
    const r = mapRows([HEADER, row('DUP', 'first'), row('DUP', 'second'), row('U', 'x')])
    expect(r.tickets.map((t) => t.aftersaleNo)).toEqual(['DUP', 'U'])
    expect(r.tickets[0].orderNo).toBe('first')
    expect(r.duplicatedInFile).toBe(1)
  })

  it('defaults empty 售后状态 to 待商家处理 and trims cells', () => {
    const r = mapRows([HEADER, [' AS2 ', '', '', '', '', '', '', '', '', '', '', '', '']])
    expect(r.tickets[0].aftersaleNo).toBe('AS2')
    expect(r.tickets[0].status).toBe('待商家处理')
  })

  it('treats an empty matrix as a bad template', () => {
    expect(mapRows([]).missingRequiredHeader).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/services/ticket-import-map.test.ts`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 `src/main/services/ticket-import-map.ts`**
```ts
import type { NewTicket } from '../../shared/types'

// Excel 表头中文名 → NewTicket 字段。未列出的列(商品ID/买家/备注等)一律忽略。
const HEADER_MAP: Record<string, keyof NewTicket> = {
  '售后编号': 'aftersaleNo',
  '订单编号': 'orderNo',
  '发货运单号': 'shippingNo',
  '退货运单号': 'returnNo',
  '售后状态': 'status',
  '退款类型': 'aftersaleType',
  '退款原因': 'aftersaleReason',
  '订单状态': 'shippingStatus',
  '交易金额': 'amount',
  '退款金额': 'refundAmount',
  '申请时间': 'appliedAt',
  '退货物流状态': 'returnLogistics'
}

export interface MapResult {
  tickets: NewTicket[]
  failed: { row: number; reason: string }[]
  duplicatedInFile: number
  missingRequiredHeader: boolean
}

const cell = (v: unknown): string => String(v ?? '').trim()

export function mapRows(matrix: string[][]): MapResult {
  const failed: { row: number; reason: string }[] = []
  const tickets: NewTicket[] = []
  const seen = new Set<string>()
  let duplicatedInFile = 0

  if (matrix.length === 0) return { tickets, failed, duplicatedInFile, missingRequiredHeader: true }

  const headers = matrix[0].map(cell)
  const colField = headers.map((h) => HEADER_MAP[h] as keyof NewTicket | undefined)
  if (!colField.includes('aftersaleNo')) {
    return { tickets, failed, duplicatedInFile, missingRequiredHeader: true }
  }

  for (let r = 1; r < matrix.length; r++) {
    const cells = matrix[r] ?? []
    const rec: Partial<Record<keyof NewTicket, string>> = {}
    for (let c = 0; c < colField.length; c++) {
      const field = colField[c]
      if (field) rec[field] = cell(cells[c])
    }
    const no = rec.aftersaleNo ?? ''
    if (!no) { failed.push({ row: r + 1, reason: '缺少售后编号' }); continue }
    if (seen.has(no)) { duplicatedInFile++; continue }
    seen.add(no)
    tickets.push({
      aftersaleNo: no,
      orderNo: rec.orderNo ?? '',
      shippingNo: rec.shippingNo ?? '',
      returnNo: rec.returnNo ?? '',
      note: '',
      status: (rec.status || '待商家处理') as NewTicket['status'],
      aftersaleType: rec.aftersaleType ?? '',
      aftersaleReason: rec.aftersaleReason ?? '',
      shippingStatus: rec.shippingStatus ?? '',
      amount: rec.amount ?? '',
      refundAmount: rec.refundAmount ?? '',
      appliedAt: rec.appliedAt ?? '',
      returnLogistics: rec.returnLogistics ?? ''
    })
  }
  return { tickets, failed, duplicatedInFile, missingRequiredHeader: false }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/services/ticket-import-map.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/main/services/ticket-import-map.ts tests/services/ticket-import-map.test.ts
git commit -m "feat: pure mapRows — parse PDD aftersale matrix into NewTicket[]"
```

---

### Task 4: xlsx 读取 + IPC + preload/api 桥接

**Files:**
- Modify: `package.json`(+`xlsx` 依赖)
- Create: `src/main/services/ticket-importer.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Test: `tests/services/ticket-importer.test.ts`

**Interfaces:**
- Consumes: `mapRows`(Task 3)、`TicketRepo.existingNos/createMany`(Task 1)、`ImportTicketsResult`(Task 1)。
- Produces: `parseXlsx(path: string): string[][]`(`ticket-importer.ts`);IPC `tickets:import` → `ImportTicketsResult | null`;`api.importTickets(): Promise<ImportTicketsResult | null>`。

- [ ] **Step 1: 安装依赖**

Run: `npm install xlsx@^0.18.5`
Expected: `xlsx` 出现在 `package.json` 的 `dependencies`。

- [ ] **Step 2: 写失败测试** — 新建 `tests/services/ticket-importer.test.ts`(用 `xlsx` 在临时目录写一个最小工作簿,再读回):
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as XLSX from 'xlsx'
import { parseXlsx } from '../../src/main/services/ticket-importer'

let dir: string | null = null
afterEach(() => { if (dir) { rmSync(dir, { recursive: true, force: true }); dir = null } })

function writeBook(rows: string[][]): string {
  dir = mkdtempSync(join(tmpdir(), 'imp-'))
  const file = join(dir, 'book.xlsx')
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  XLSX.writeFile(wb, file)
  return file
}

describe('parseXlsx', () => {
  it('reads the first sheet into a string matrix with the header row first', () => {
    const file = writeBook([['售后编号', '订单编号'], ['AS1', 'O1'], ['AS2', 'O2']])
    const m = parseXlsx(file)
    expect(m[0]).toEqual(['售后编号', '订单编号'])
    expect(m[1]).toEqual(['AS1', 'O1'])
    expect(m[2][0]).toBe('AS2')
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run tests/services/ticket-importer.test.ts`
Expected: FAIL(`parseXlsx` 模块不存在)。

- [ ] **Step 4: 实现 `src/main/services/ticket-importer.ts`**
```ts
import * as XLSX from 'xlsx'

/** Read the first worksheet of an .xlsx file into a 2-D array of trimmed-on-read strings.
 * `header:1` → array-of-arrays; `raw:false` → formatted text; `defval:''` → fill blanks. */
export function parseXlsx(path: string): string[][] {
  const wb = XLSX.readFile(path)
  const name = wb.SheetNames[0]
  const sheet = name ? wb.Sheets[name] : undefined
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' })
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/services/ticket-importer.test.ts`
Expected: PASS。

- [ ] **Step 6: 注册 IPC** — 编辑 `src/main/ipc.ts`。

6a. 顶部 import 区追加:
```ts
import { parseXlsx } from './services/ticket-importer'
import { mapRows } from './services/ticket-import-map'
import type { Ticket, ImportTicketsResult } from '../shared/types'
```
(把已有的 `import type { Ticket } from '../shared/types'` 合并为上面这一行,避免重复。)

6b. 在 `ipcMain.handle('tickets:update', …)` 之后新增:
```ts
  ipcMain.handle('tickets:import', async (): Promise<ImportTicketsResult | null> => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }]
    })
    if (r.canceled || r.filePaths.length === 0) return null
    const mapped = mapRows(parseXlsx(r.filePaths[0]))
    if (mapped.missingRequiredHeader) throw new Error('模板不正确:缺少「售后编号」列')
    const existing = tickets.existingNos(mapped.tickets.map((t) => t.aftersaleNo))
    const toInsert = mapped.tickets.filter((t) => !existing.has(t.aftersaleNo))
    tickets.createMany(toInsert)
    return {
      imported: toInsert.length,
      skippedExisting: mapped.tickets.length - toInsert.length,
      duplicatedInFile: mapped.duplicatedInFile,
      failed: mapped.failed
    }
  })
```

- [ ] **Step 7: preload 桥接** — 编辑 `src/preload/index.ts`。把第 2 行 import 追加 `ImportTicketsResult`:
```ts
import type { Ticket, Material, PickedFile, CreateMaterialPayload, NewTicket, RegionLevel, RegionCount, StatsSummary, ImportTicketsResult } from '../shared/types'
```
在 `updateTicket: …,` 之后新增一行:
```ts
  importTickets: (): Promise<ImportTicketsResult | null> => ipcRenderer.invoke('tickets:import'),
```

- [ ] **Step 8: 跑相关测试 + 类型检查**

Run: `npx vitest run tests/services/ tests/db/tickets.test.ts`
Expected: PASS。

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/main/services/ticket-importer.ts src/main/ipc.ts src/preload/index.ts tests/services/ticket-importer.test.ts
git commit -m "feat: xlsx reader + tickets:import IPC + preload bridge"
```

---

### Task 5: 列表表格 — 导入按钮 + 新列

**Files:**
- Modify: `src/renderer/components/TicketTable.tsx`
- Test: `tests/renderer/TicketTable.test.tsx`

**Interfaces:**
- Consumes: `STATUS_META`(Task 2)、扩展后的 `Ticket`(Task 1)。
- Produces: `TicketTable` 新增可选 prop `onImport?: () => void`;表格新增 售后类型 / 退货物流状态 / 申请时间 列,状态列改用新 `STATUS_META`。

- [ ] **Step 1: 写失败测试** — 编辑 `tests/renderer/TicketTable.test.tsx`。

1a. 把 `mk()` 默认状态从 `'pending'` 改为新值:
```ts
    status: '待商家处理' as const, note: '', createdAt: 0, updatedAt: 0,
```
1b. 在 `describe('TicketTable', …)` 内追加:
```ts
  it('renders the new aftersale columns and the status chip', () => {
    render(<TicketTable
      tickets={[mk({ aftersaleType: '退款退货', returnLogistics: '签收', appliedAt: '2026-05-28 14:27:38', status: '退款成功' })]}
      query="" onOpen={() => {}} onNew={() => {}} onImport={() => {}} />)
    expect(screen.getByText('退款退货')).toBeTruthy()
    expect(screen.getByText('签收')).toBeTruthy()
    expect(screen.getByText('2026-05-28 14:27:38')).toBeTruthy()
    expect(screen.getByText('退款成功')).toBeTruthy()
  })

  it('calls onImport when the import button is clicked', () => {
    const onImport = vi.fn()
    render(<TicketTable tickets={mks(1)} query="" onOpen={() => {}} onNew={() => {}} onImport={onImport} />)
    fireEvent.click(screen.getByText('导入 Excel'))
    expect(onImport).toHaveBeenCalledTimes(1)
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/TicketTable.test.tsx`
Expected: FAIL(找不到“导入 Excel”/新列文本)。

- [ ] **Step 3: 改 `src/renderer/components/TicketTable.tsx`**

3a. 把 Props 接口改为:
```ts
interface Props { tickets: Ticket[]; query: string; onOpen: (no: string) => void; onNew: () => void; onImport?: () => void }
```
并把解构改为:
```ts
export function TicketTable({ tickets, query, onOpen, onNew, onImport }: Props) {
```

3b. 把顶部操作区(`<button className="btn-primary" … 新建售后单</button>` 那行)替换为一个按钮组:
```tsx
        <div className="flex items-center gap-2">
          <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => onImport?.()}><IconImport className="text-[15px]" /> 导入 Excel</button>
          <button className="btn-primary px-3 py-1.5 text-sm" onClick={onNew}><IconPlus className="text-[15px]" /> 新建售后单</button>
        </div>
```

3c. 把 `<table className="w-full min-w-[980px] …">` 的 `min-w-[980px]` 改为 `min-w-[1240px]`。

3d. 表头 `<tr>` 内:把 `<th …>状态</th>` 改为 `<th className="px-4 py-2.5 text-left font-medium">售后状态</th>`,并在其后插入一列;在 `退货快递单号` 表头之后插入 `退货物流状态`;在最后插入 `申请时间`。最终表头为:
```tsx
              <tr className="border-b border-line">
                <th className="px-4 py-2.5 text-left font-medium">售后单号</th>
                <th className="px-4 py-2.5 text-left font-medium">售后状态</th>
                <th className="px-4 py-2.5 text-left font-medium">售后类型</th>
                <th className="px-4 py-2.5 text-left font-medium">收件人</th>
                <th className="px-4 py-2.5 text-left font-medium">地区</th>
                <th className="px-4 py-2.5 text-left font-medium">订单号</th>
                <th className="px-4 py-2.5 text-left font-medium">发货快递单号</th>
                <th className="px-4 py-2.5 text-left font-medium">退货快递单号</th>
                <th className="px-4 py-2.5 text-left font-medium">退货物流状态</th>
                <th className="px-4 py-2.5 text-left font-medium">申请时间</th>
              </tr>
```

3e. 行内:把 `const meta = STATUS_META[t.status] ?? STATUS_META.pending` 改为
```ts
                const meta = STATUS_META[t.status] ?? STATUS_META['待商家处理']
```
并把 `<tbody>` 里的数据单元格调整为(在状态 chip 后加 售后类型;在退货快递单号后加 退货物流状态;末尾加 申请时间):
```tsx
                    <td className="tnum px-4 py-3 font-medium text-ink">{t.aftersaleNo}</td>
                    <td className="px-4 py-3"><span className={`chip ${meta.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span></td>
                    <td className="px-4 py-3 text-ink-soft">{t.aftersaleType || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{t.recipientName || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{regionLabel(t) || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{t.orderNo || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{t.shippingNo || '—'}</td>
                    <td className="tnum px-4 py-3 text-ink-soft">{t.returnNo || '—'}</td>
                    <td className="px-4 py-3 text-ink-soft">{t.returnLogistics || '—'}</td>
                    <td className="tnum px-4 py-3 text-muted">{t.appliedAt || '—'}</td>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/renderer/TicketTable.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/TicketTable.tsx tests/renderer/TicketTable.test.tsx
git commit -m "feat(ui): ticket list import button + aftersale columns"
```

---

### Task 6: 导入结果弹窗 + TicketsView 接线

**Files:**
- Create: `src/renderer/components/ImportResultDialog.tsx`
- Modify: `src/renderer/views/TicketsView.tsx`
- Test: `tests/renderer/ImportResultDialog.test.tsx`

**Interfaces:**
- Consumes: `ImportTicketsResult`(Task 1)、`TicketTable.onImport`(Task 5)、`api.importTickets`(Task 4)。
- Produces: `ImportResultDialog({ result, onClose })` 组件。

- [ ] **Step 1: 写失败测试** — 新建 `tests/renderer/ImportResultDialog.test.tsx`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ImportResultDialog } from '../../src/renderer/components/ImportResultDialog'

afterEach(() => cleanup())

describe('ImportResultDialog', () => {
  it('renders nothing when result is null', () => {
    const { container } = render(<ImportResultDialog result={null} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the summary counts and failed rows', () => {
    render(<ImportResultDialog
      result={{ imported: 3, skippedExisting: 2, duplicatedInFile: 1, failed: [{ row: 5, reason: '缺少售后编号' }] }}
      onClose={() => {}} />)
    expect(screen.getByText('3')).toBeTruthy()
    expect(screen.getByText('第 5 行:缺少售后编号')).toBeTruthy()
  })

  it('calls onClose when 完成 is clicked', () => {
    const onClose = vi.fn()
    render(<ImportResultDialog result={{ imported: 0, skippedExisting: 0, duplicatedInFile: 0, failed: [] }} onClose={onClose} />)
    fireEvent.click(screen.getByText('完成'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/ImportResultDialog.test.tsx`
Expected: FAIL(组件不存在)。

- [ ] **Step 3: 实现 `src/renderer/components/ImportResultDialog.tsx`**
```tsx
import type { ImportTicketsResult } from '@shared/types'

interface Props { result: ImportTicketsResult | null; onClose: () => void }

export function ImportResultDialog({ result, onClose }: Props) {
  if (!result) return null
  return (
    <div className="scrim">
      <div className="modal-card max-w-md">
        <h3 className="mb-4 font-display text-lg font-extrabold tracking-tight">导入完成</h3>
        <ul className="space-y-1.5 text-sm text-ink-soft">
          <li>新增 <span className="tnum font-semibold text-ink">{result.imported}</span> 条</li>
          <li>跳过(已存在) <span className="tnum font-semibold text-ink">{result.skippedExisting}</span> 条</li>
          <li>文件内重复 <span className="tnum font-semibold text-ink">{result.duplicatedInFile}</span> 条</li>
          <li>失败 <span className="tnum font-semibold text-ink">{result.failed.length}</span> 条</li>
        </ul>
        {result.failed.length > 0 && (
          <div className="mt-3 max-h-40 space-y-0.5 overflow-auto rounded-lg border border-line bg-paper-2 p-3 text-xs text-muted">
            {result.failed.map((f, i) => <div key={i}>第 {f.row} 行:{f.reason}</div>)}
          </div>
        )}
        <div className="mt-6 flex justify-end"><button className="btn-primary" onClick={onClose}>完成</button></div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 接入 `src/renderer/views/TicketsView.tsx`**

4a. import 区追加:
```ts
import { ImportResultDialog } from '../components/ImportResultDialog'
import type { ImportTicketsResult } from '@shared/types'
```
(把已有的 `import type { NewTicket, Ticket } from '@shared/types'` 与上面的合并或并列均可。)

4b. 在 `const [error, setError] = useState<string | null>(null)` 之后加状态:
```ts
  const [importResult, setImportResult] = useState<ImportTicketsResult | null>(null)
```

4c. 在 `createTicket` 函数之后新增:
```ts
  async function importTickets() {
    try {
      const r = await api.importTickets()
      if (r) { setImportResult(r); setError(null); await load() }
    } catch (e) { setError(`导入失败:${(e as Error).message}`) }
  }
```

4d. 给 `<TicketTable …>` 加 `onImport={importTickets}`:
```tsx
            <TicketTable tickets={tickets} query={query} onOpen={(no) => { setSelected(no); setView('detail') }} onNew={() => setNewOpen(true)} onImport={importTickets} />
```

4e. 在结尾 `<NewTicketDialog … />` 之后加:
```tsx
      <ImportResultDialog result={importResult} onClose={() => setImportResult(null)} />
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/renderer/ImportResultDialog.test.tsx`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/renderer/components/ImportResultDialog.tsx src/renderer/views/TicketsView.tsx tests/renderer/ImportResultDialog.test.tsx
git commit -m "feat(ui): import result dialog + wire tickets:import into TicketsView"
```

---

### Task 7: 新建对话框 — 售后字段表单

**Files:**
- Modify: `src/renderer/components/NewTicketDialog.tsx`
- Test: `tests/renderer/NewTicketDialog.test.tsx`

**Interfaces:**
- Consumes: `STATUS_ORDER`(Task 2)、`TYPE_OPTIONS/REASON_OPTIONS/SHIPPING_OPTIONS`(Task 2)、`NewTicket`(Task 1)。
- Produces: `新建售后单` 提交时携带 status + 7 个售后字段。

- [ ] **Step 1: 写失败测试** — 新建 `tests/renderer/NewTicketDialog.test.tsx`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { NewTicketDialog } from '../../src/renderer/components/NewTicketDialog'

afterEach(() => cleanup())

describe('NewTicketDialog', () => {
  it('submits status + aftersale fields', () => {
    const onCreate = vi.fn()
    render(<NewTicketDialog open onCreate={onCreate} onCancel={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('必填'), { target: { value: 'AS-NEW' } })
    fireEvent.change(screen.getByLabelText('售后状态'), { target: { value: '退款成功' } })
    fireEvent.change(screen.getByLabelText('售后类型'), { target: { value: '换货' } })
    fireEvent.change(screen.getByLabelText('交易金额'), { target: { value: '24.99' } })
    fireEvent.click(screen.getByText('创建'))
    expect(onCreate).toHaveBeenCalledTimes(1)
    const arg = onCreate.mock.calls[0][0]
    expect(arg.aftersaleNo).toBe('AS-NEW')
    expect(arg.status).toBe('退款成功')
    expect(arg.aftersaleType).toBe('换货')
    expect(arg.amount).toBe('24.99')
  })

  it('defaults status to 待商家处理', () => {
    const onCreate = vi.fn()
    render(<NewTicketDialog open onCreate={onCreate} onCancel={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText('必填'), { target: { value: 'AS-D' } })
    fireEvent.click(screen.getByText('创建'))
    expect(onCreate.mock.calls[0][0].status).toBe('待商家处理')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/NewTicketDialog.test.tsx`
Expected: FAIL(找不到 `售后状态` 等 label / 字段未提交)。

- [ ] **Step 3: 改 `src/renderer/components/NewTicketDialog.tsx`**

3a. import 区追加:
```ts
import type { NewTicket, TicketStatus } from '@shared/types'
import { STATUS_ORDER } from '../status'
import { TYPE_OPTIONS, REASON_OPTIONS, SHIPPING_OPTIONS } from '../aftersale-options'
```
(替换原第 2 行的 `import type { NewTicket } from '@shared/types'`。)

3b. 在 `const [pasteText, setPasteText] = useState('')` 之后新增状态:
```ts
  const [status, setStatus] = useState<TicketStatus>('待商家处理')
  const [aftersaleType, setAftersaleType] = useState('')
  const [aftersaleReason, setAftersaleReason] = useState('')
  const [shippingStatus, setShippingStatus] = useState('')
  const [amount, setAmount] = useState('')
  const [refundAmount, setRefundAmount] = useState('')
  const [appliedAt, setAppliedAt] = useState('')
  const [returnLogistics, setReturnLogistics] = useState('')
```

3c. 在 `reset` 里追加重置:
```ts
    setStatus('待商家处理'); setAftersaleType(''); setAftersaleReason(''); setShippingStatus('')
    setAmount(''); setRefundAmount(''); setAppliedAt(''); setReturnLogistics('')
```

3d. 把 `submit` 的 `onCreate({...})` 改为携带新字段:
```ts
    onCreate({
      aftersaleNo: no, orderNo: orderNo.trim(), shippingNo: shippingNo.trim(), returnNo: returnNo.trim(), note: '',
      status,
      aftersaleType, aftersaleReason, shippingStatus,
      amount: amount.trim(), refundAmount: refundAmount.trim(), appliedAt: appliedAt.trim(), returnLogistics: returnLogistics.trim(),
      recipientName: recipientName.trim(), phone: phone.trim(), extension: extension.trim(),
      ...region, addressDetail: addressDetail.trim()
    })
```

3e. 在 `退货快递单号` 那个 `<label>` 之后、`客户信息(选填)` 分隔行之前,插入售后信息分区:
```tsx
          <div className="border-t border-line pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted">售后信息</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">售后状态</span>
              <select aria-label="售后状态" className="field" value={status} onChange={(e) => setStatus(e.target.value as TicketStatus)}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">售后类型</span>
              <select aria-label="售后类型" className="field" value={aftersaleType} onChange={(e) => setAftersaleType(e.target.value)}>
                <option value="">未选择</option>
                {TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">售后原因</span>
              <select aria-label="售后原因" className="field" value={aftersaleReason} onChange={(e) => setAftersaleReason(e.target.value)}>
                <option value="">未选择</option>
                {REASON_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">发货状态</span>
              <select aria-label="发货状态" className="field" value={shippingStatus} onChange={(e) => setShippingStatus(e.target.value)}>
                <option value="">未选择</option>
                {SHIPPING_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">交易金额</span>
              <input aria-label="交易金额" className="field tnum" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">退款金额</span>
              <input aria-label="退款金额" className="field tnum" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">申请时间</span>
              <input aria-label="申请时间" className="field tnum" value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} placeholder="YYYY-MM-DD HH:mm:ss" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-ink-soft">退货物流状态</span>
              <input aria-label="退货物流状态" className="field" value={returnLogistics} onChange={(e) => setReturnLogistics(e.target.value)} />
            </label>
          </div>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/renderer/NewTicketDialog.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/NewTicketDialog.tsx tests/renderer/NewTicketDialog.test.tsx
git commit -m "feat(ui): aftersale fields in new-ticket dialog"
```

---

### Task 8: 详情页 — 售后字段展示/编辑

**Files:**
- Modify: `src/renderer/components/TicketDetail.tsx`
- Test: `tests/renderer/TicketDetail.test.tsx`

**Interfaces:**
- Consumes: `withCurrent`、`TYPE_OPTIONS/REASON_OPTIONS/SHIPPING_OPTIONS`(Task 2)、扩展后的 `Ticket`(Task 1)。
- Produces: 详情「基本信息」栏展示 + 编辑全部 7 个售后字段(枚举下拉、其余输入)。

- [ ] **Step 1: 写失败测试** — 新建 `tests/renderer/TicketDetail.test.tsx`(用 mock 的 `api` 提供一条带售后字段的 ticket,断言展示):
```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'

const ticket = {
  aftersaleNo: 'AS-1', orderNo: 'O1', shippingNo: 'S1', returnNo: 'R1',
  status: '退款成功', note: '', createdAt: 0, updatedAt: 0,
  recipientName: '', phone: '', provinceCode: '', province: '', cityCode: '', city: '',
  districtCode: '', district: '', addressDetail: '', extension: '',
  aftersaleType: '退款退货', aftersaleReason: '质量问题', shippingStatus: '已发货',
  amount: '24.99', refundAmount: '24.99', appliedAt: '2026-05-28 14:27:38', returnLogistics: '签收'
}

vi.mock('../../src/renderer/api', () => ({
  api: {
    getTicket: vi.fn(async () => ticket),
    listMaterials: vi.fn(async () => []),
    updateTicket: vi.fn(async () => {}),
  }
}))

afterEach(() => cleanup())

import { TicketDetail } from '../../src/renderer/components/TicketDetail'

describe('TicketDetail aftersale fields', () => {
  it('shows the imported aftersale field values', async () => {
    render(<TicketDetail aftersaleNo="AS-1" onChanged={() => {}} onDeleted={() => {}} onBack={() => {}} />)
    await waitFor(() => expect(screen.getByText('退款退货')).toBeTruthy())
    expect(screen.getByText('质量问题')).toBeTruthy()
    expect(screen.getByText('已发货')).toBeTruthy()
    expect(screen.getByText('签收')).toBeTruthy()
    expect(screen.getByText('2026-05-28 14:27:38')).toBeTruthy()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/TicketDetail.test.tsx`
Expected: FAIL(找不到这些值,因详情页还没展示售后字段)。

- [ ] **Step 3: 改 `src/renderer/components/TicketDetail.tsx`**

3a. import 区追加:
```ts
import { TYPE_OPTIONS, REASON_OPTIONS, SHIPPING_OPTIONS, withCurrent } from '../aftersale-options'
```
并把第 2 行类型 import 的 `CustomerFields` 旁加上 `AftersaleFields`:
```ts
import type { Material, Ticket, TicketStatus, CustomerFields, AftersaleFields } from '@shared/types'
```

3b. 把 `form` 的类型与初值扩展为含售后字段:
```ts
  const [form, setForm] = useState<Pick<Ticket, 'orderNo' | 'shippingNo' | 'returnNo'> & CustomerFields & AftersaleFields>({
    orderNo: '', shippingNo: '', returnNo: '',
    recipientName: '', phone: '', provinceCode: '', province: '',
    cityCode: '', city: '', districtCode: '', district: '', addressDetail: '', extension: '',
    aftersaleType: '', aftersaleReason: '', shippingStatus: '',
    amount: '', refundAmount: '', appliedAt: '', returnLogistics: ''
  })
```

3c. 在 `startEdit` 的 `setForm({...})` 里补上售后字段:
```ts
    setForm({
      orderNo: ticket.orderNo, shippingNo: ticket.shippingNo, returnNo: ticket.returnNo,
      recipientName: ticket.recipientName, phone: ticket.phone,
      provinceCode: ticket.provinceCode, province: ticket.province, cityCode: ticket.cityCode, city: ticket.city,
      districtCode: ticket.districtCode, district: ticket.district, addressDetail: ticket.addressDetail, extension: ticket.extension,
      aftersaleType: ticket.aftersaleType, aftersaleReason: ticket.aftersaleReason, shippingStatus: ticket.shippingStatus,
      amount: ticket.amount, refundAmount: ticket.refundAmount, appliedAt: ticket.appliedAt, returnLogistics: ticket.returnLogistics
    })
```
(`saveInfo` 已是 `api.updateTicket(aftersaleNo, { ...form })`,自动包含新字段,无需改。)

3d. 在「退货快递单号」那个 `<InfoRow>` 之后,`</dl>` 之前,插入售后字段行:
```tsx
            <div className="h-px bg-line" />
            <InfoRow label="售后类型">
              {editing
                ? <select className="field py-1.5" value={form.aftersaleType} onChange={(e) => setForm((f) => ({ ...f, aftersaleType: e.target.value }))}>
                    <option value="">未选择</option>
                    {withCurrent(TYPE_OPTIONS, form.aftersaleType).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                : <Value v={ticket.aftersaleType} />}
            </InfoRow>
            <InfoRow label="售后原因">
              {editing
                ? <select className="field py-1.5" value={form.aftersaleReason} onChange={(e) => setForm((f) => ({ ...f, aftersaleReason: e.target.value }))}>
                    <option value="">未选择</option>
                    {withCurrent(REASON_OPTIONS, form.aftersaleReason).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                : <Value v={ticket.aftersaleReason} />}
            </InfoRow>
            <InfoRow label="发货状态">
              {editing
                ? <select className="field py-1.5" value={form.shippingStatus} onChange={(e) => setForm((f) => ({ ...f, shippingStatus: e.target.value }))}>
                    <option value="">未选择</option>
                    {withCurrent(SHIPPING_OPTIONS, form.shippingStatus).map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                : <Value v={ticket.shippingStatus} />}
            </InfoRow>
            <InfoRow label="交易金额">
              {editing
                ? <input className="field tnum py-1.5" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.amount} />}
            </InfoRow>
            <InfoRow label="退款金额">
              {editing
                ? <input className="field tnum py-1.5" value={form.refundAmount} onChange={(e) => setForm((f) => ({ ...f, refundAmount: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.refundAmount} />}
            </InfoRow>
            <InfoRow label="申请时间">
              {editing
                ? <input className="field tnum py-1.5" value={form.appliedAt} onChange={(e) => setForm((f) => ({ ...f, appliedAt: e.target.value }))} placeholder="YYYY-MM-DD HH:mm:ss" />
                : <Value v={ticket.appliedAt} />}
            </InfoRow>
            <InfoRow label="退货物流状态">
              {editing
                ? <input className="field py-1.5" value={form.returnLogistics} onChange={(e) => setForm((f) => ({ ...f, returnLogistics: e.target.value }))} placeholder="未填写" />
                : <Value v={ticket.returnLogistics} />}
            </InfoRow>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/renderer/TicketDetail.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/TicketDetail.tsx tests/renderer/TicketDetail.test.tsx
git commit -m "feat(ui): display/edit aftersale fields in ticket detail"
```

---

### Task 9: 全量校验

**Files:**
- 无新增(纯验证)。

- [ ] **Step 1: 跑全量测试**

Run: `npm test`
Expected: 全部测试 PASS(含 Task 1–8 新增,以及既有用例)。

- [ ] **Step 2: 类型检查 + Vite 打包**

Run: `npm run build`
Expected: TypeScript 类型检查通过、`out/` 产物生成,无报错。
若报 `better-sqlite3 NODE_MODULE_VERSION` 之类,先 `npm run rebuild:node`(测试)/`npm run rebuild:electron`(运行 dev)再重试。

- [ ] **Step 3:(可选)手动冒烟**

Run: `npm run rebuild:electron && npm run dev`
人工核对:列表「导入 Excel」按钮 → 选模板 `.xlsx` → 弹窗汇总;重复导入同文件应全部计入「跳过(已存在)」;新列与详情页售后字段显示/编辑正常。

- [ ] **Step 4: Commit(若 Step 2 产生了 lockfile 等变化)**

```bash
git add -A
git commit -m "chore: full test + typecheck pass for aftersale import" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- §3.1 类型 → Task 1 Step 3。§3.2 DB 迁移/状态迁移 → Task 1 Step 4。§3.3 仓库(create/update/existingNos/createMany)→ Task 1 Step 5。
- §2.1 状态枚举/配色、§2.2 编辑枚举 → Task 2。
- §4.2 `mapRows` → Task 3。§4.1 依赖 + §4.3 读取/IPC/preload → Task 4。
- §5.1 列表列+导入按钮 → Task 5。§5.2 结果弹窗 + 接线 → Task 6。§5.3 状态元数据 → Task 2。§5.4 新建对话框 → Task 7。§5.5 详情页 → Task 8。
- §6 错误处理(缺表头整体失败、缺编号记失败行、文件内重复、已存在跳过)→ Task 1(existingNos)+ Task 3(mapRows)+ Task 4(IPC 抛错)。
- §7 测试 → 各 Task 的测试步骤 + Task 9 全量。
- §8 影响面清单 → Task 1–8 文件一一对应(含 `package.json`)。

**Placeholder scan:** 无 TBD/TODO;每个代码步骤均给出完整代码与确切命令/预期。

**Type consistency:** `mapRows`/`MapResult` 在 Task 3 定义、Task 4 IPC 消费;`ImportTicketsResult` Task 1 定义,Task 4/6 消费;`existingNos`/`createMany`/`parseXlsx`/`importTickets`/`onImport`/`withCurrent` 命名在定义与消费处一致;`STATUS_META` 键与 `TicketStatus` 10 值一致;新字段驼峰名贯穿 types/repo/mapRows/UI 一致。
