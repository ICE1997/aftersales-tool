# 金额数值化 + 申请时间选择器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `amount`/`refundAmount` 改为 INTEGER 分、`appliedAt` 改为 epoch 毫秒存储,申请时间用 `datetime-local` 选择器,经一组共享纯函数在 导入/迁移/UI 三处一致转换。

**Architecture:** 新增 `src/shared/aftersale-format.ts` 提供金额↔分、时间↔epoch、datetime-local 互转的纯函数。schema 变更走已有 Knex 迁移框架(新增 migration `0002`,逐行用纯函数转换,自动备份)。类型、仓库、导入、三个 UI 组件改用数值/时间戳。

**Tech Stack:** Electron + electron-vite、React + TS、better-sqlite3 + Knex 迁移、Vitest。

## Global Constraints

- 金额存 **INTEGER 分**(TS `number | null`);空/非法 → `null`;四舍五入到分。
- 申请时间存 **epoch 毫秒 INTEGER**(TS `number | null`);按**本地时间**解释 `"YYYY-MM-DD HH:mm:ss"`;空/非法 → `null`。
- 时间精度到**秒**(`datetime-local step="1"`);金额输入以**元**为单位(`type="number" step="0.01"`)。
- 金额展示纯小数 `"24.99"`(不加货币符号);空值显示 `—`。
- baseline `0001` 冻结不动;改型走新 migration `0002`(对新库与老库都跑)。FTS 列集合不变(这三列不在其中)。
- 受影响 4 个其它售后字段(`aftersaleType/aftersaleReason/shippingStatus/returnLogistics`)仍为 `string`,不动。
- 运行测试:`npx vitest run <file>`(better-sqlite3 已按系统 Node 构建;若报 `NODE_MODULE_VERSION` 先 `npm run rebuild:node`)。每个 Task 结束 commit。

---

### Task 1: 共享纯函数 `aftersale-format.ts`

**Files:**
- Create: `src/shared/aftersale-format.ts`
- Test: `tests/shared/aftersale-format.test.ts`

**Interfaces:**
- Produces:
  - `parseAmountToCents(s: string): number | null`
  - `formatCents(cents: number | null): string`
  - `parseDateTimeToMs(s: string): number | null`
  - `formatMs(ms: number | null): string`
  - `msToLocalInput(ms: number | null): string`
  - `localInputToMs(v: string): number | null`

- [ ] **Step 1: 写失败测试** — 新建 `tests/shared/aftersale-format.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  parseAmountToCents, formatCents,
  parseDateTimeToMs, formatMs, msToLocalInput, localInputToMs
} from '../../src/shared/aftersale-format'

describe('amount helpers', () => {
  it('parses yuan strings to integer cents', () => {
    expect(parseAmountToCents('24.99')).toBe(2499)
    expect(parseAmountToCents('22.5')).toBe(2250)
    expect(parseAmountToCents(' 24.99 ')).toBe(2499)
    expect(parseAmountToCents('100')).toBe(10000)
    expect(parseAmountToCents('24.999')).toBe(2500) // rounds to nearest cent
  })
  it('treats empty / non-numeric as null', () => {
    expect(parseAmountToCents('')).toBeNull()
    expect(parseAmountToCents('   ')).toBeNull()
    expect(parseAmountToCents('abc')).toBeNull()
    expect(parseAmountToCents('12a')).toBeNull()
  })
  it('formats cents back to a 2-decimal string', () => {
    expect(formatCents(2499)).toBe('24.99')
    expect(formatCents(2000)).toBe('20.00')
    expect(formatCents(null)).toBe('')
  })
})

describe('datetime helpers', () => {
  it('round-trips a local datetime string through ms', () => {
    const ms = parseDateTimeToMs('2026-05-28 14:27:38')
    expect(typeof ms).toBe('number')
    expect(formatMs(ms)).toBe('2026-05-28 14:27:38')
  })
  it('accepts the T separator and optional seconds', () => {
    expect(parseDateTimeToMs('2026-05-28T14:27:38')).toBe(parseDateTimeToMs('2026-05-28 14:27:38'))
    expect(formatMs(parseDateTimeToMs('2026-05-28 14:27'))).toBe('2026-05-28 14:27:00')
  })
  it('treats empty / malformed as null', () => {
    expect(parseDateTimeToMs('')).toBeNull()
    expect(parseDateTimeToMs('not a date')).toBeNull()
    expect(formatMs(null)).toBe('')
  })
  it('round-trips through the datetime-local input format', () => {
    const ms = parseDateTimeToMs('2026-05-28 14:27:38')
    expect(msToLocalInput(ms)).toBe('2026-05-28T14:27:38')
    expect(localInputToMs('2026-05-28T14:27:38')).toBe(ms)
    expect(msToLocalInput(null)).toBe('')
    expect(localInputToMs('')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/shared/aftersale-format.test.ts`
Expected: FAIL(模块不存在)。

- [ ] **Step 3: 实现 `src/shared/aftersale-format.ts`**
```ts
// Pure conversions for the numeric aftersale fields. Shared by the importer,
// the DB migration, and the renderer. Times are interpreted in LOCAL time.

export function parseAmountToCents(s: string): number | null {
  const t = (s ?? '').trim()
  if (t === '') return null
  const n = Number(t)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100)
}

export function formatCents(cents: number | null): string {
  if (cents == null) return ''
  return (cents / 100).toFixed(2)
}

const DT_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/

export function parseDateTimeToMs(s: string): number | null {
  const m = DT_RE.exec((s ?? '').trim())
  if (!m) return null
  const ms = new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), m[6] ? Number(m[6]) : 0
  ).getTime()
  return Number.isNaN(ms) ? null : ms
}

function pad(n: number): string { return String(n).padStart(2, '0') }

export function formatMs(ms: number | null): string {
  if (ms == null) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function msToLocalInput(ms: number | null): string {
  if (ms == null) return ''
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function localInputToMs(v: string): number | null {
  return parseDateTimeToMs(v)
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/shared/aftersale-format.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/shared/aftersale-format.ts tests/shared/aftersale-format.test.ts
git commit -m "feat: aftersale-format pure helpers (cents + epoch-ms conversions)"
```

---

### Task 2: 类型 + 仓库改数值

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/db/tickets.ts`
- Test: `tests/db/tickets.test.ts`

**Interfaces:**
- Consumes: 无(纯类型/存储层)。
- Produces: `AftersaleFields.amount / refundAmount: number | null`,`appliedAt: number | null`;`TicketRepo.create/update` 接受并存储这些数值;`EMPTY_AFTERSALE` 默认 `null`。

- [ ] **Step 1: 改测试为数值语义** — 编辑 `tests/db/tickets.test.ts`。把 `stores and reads the new aftersale fields` 用例里的赋值与断言改为数值:

把
```ts
      shippingStatus: '已发货', amount: '24.99', refundAmount: '24.99',
      appliedAt: '2026-05-28 14:27:38', returnLogistics: '签收',
```
改为
```ts
      shippingStatus: '已发货', amount: 2499, refundAmount: 2499,
      appliedAt: 1748413658000, returnLogistics: '签收',
```
把
```ts
    expect(t.amount).toBe('24.99')
    expect(t.refundAmount).toBe('24.99')
    expect(t.appliedAt).toBe('2026-05-28 14:27:38')
```
改为
```ts
    expect(t.amount).toBe(2499)
    expect(t.refundAmount).toBe(2499)
    expect(t.appliedAt).toBe(1748413658000)
```
并新增一个 null 用例(在同一个 describe 内):
```ts
  it('stores null amounts and applied_at', () => {
    repo.create({ aftersaleNo: 'AS-NULL', orderNo: '', shippingNo: '', returnNo: '', note: '' })
    const t = repo.get('AS-NULL')!
    expect(t.amount).toBeNull()
    expect(t.refundAmount).toBeNull()
    expect(t.appliedAt).toBeNull()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/db/tickets.test.ts`
Expected: FAIL(当前 `EMPTY_AFTERSALE` 默认 `''`,新建未赋值时 amount 是 `''` 而非 `null`;赋数值后读回是数值但默认用例失败)。

- [ ] **Step 3: 改类型** — 编辑 `src/shared/types.ts` 的 `AftersaleFields`:
```ts
export interface AftersaleFields {
  aftersaleType: string
  aftersaleReason: string
  shippingStatus: string
  amount: number | null
  refundAmount: number | null
  appliedAt: number | null
  returnLogistics: string
}
```

- [ ] **Step 4: 改仓库默认值** — 编辑 `src/main/db/tickets.ts`,把 `EMPTY_AFTERSALE` 改为:
```ts
const EMPTY_AFTERSALE: AftersaleFields = {
  aftersaleType: '', aftersaleReason: '', shippingStatus: '',
  amount: null, refundAmount: null, appliedAt: null, returnLogistics: ''
}
```
(`ROW`/`TROW` 别名、`create` 的 INSERT/VALUES、`update` 的 SET 不需要改 —— 列名不变,better-sqlite3 直接绑定 `number | null`,读回原生数字。)

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run tests/db/tickets.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/db/tickets.ts tests/db/tickets.test.ts
git commit -m "feat(db): store amounts as cents and applied_at as epoch-ms (number|null)"
```

---

### Task 3: 迁移 `0002`(列改型 + 逐行转换)

**Files:**
- Modify: `src/main/db/migrations.ts`
- Test: `tests/db/migrations.test.ts`

**Interfaces:**
- Consumes: `parseAmountToCents`, `parseDateTimeToMs`(Task 1)。
- Produces: `MIGRATIONS` 增加 `0002_amounts_and_applied_at_numeric`,把 `tickets.amount/refund_amount`(TEXT)转 INTEGER 分、`applied_at`(TEXT)转 epoch 毫秒。

- [ ] **Step 1: 写失败测试** — 在 `tests/db/migrations.test.ts` 顶部 import 增加(与现有 import 合并):
```ts
import { parseDateTimeToMs } from '../../src/main/db/migrations' // placeholder — replaced below
```
实际改为:在文件已有的 import 行后,新增从被测模块与纯函数模块的导入:
```ts
import { BASELINE_STATEMENTS } from '../../src/main/db/migrations'
import { parseDateTimeToMs } from '../../src/shared/aftersale-format'
```
然后在 `describe('runMigrations', ...)` 内新增用例:
```ts
  it('migration 0002 converts text amounts to cents and applied_at to epoch ms', async () => {
    const dbPath = join(dir, 'conv.db')
    // apply baseline only (text columns), then seed a row with text values
    await runMigrations(dbPath, join(dir, 'backups'), Date.now, [MIGRATIONS[0]])
    const seed = new BetterSqlite3(dbPath)
    seed.prepare(
      `INSERT INTO tickets (aftersale_no, created_at, updated_at, amount, refund_amount, applied_at)
       VALUES (?, 0, 0, ?, ?, ?)`
    ).run('C1', '24.99', '', '2026-05-28 14:27:38')
    seed.close()
    // now apply the full migration set (includes 0002)
    await runMigrations(dbPath, join(dir, 'backups'), Date.now, MIGRATIONS)
    const db = new BetterSqlite3(dbPath)
    const row = db.prepare('SELECT amount, refund_amount, applied_at FROM tickets WHERE aftersale_no=?').get('C1') as { amount: number | null; refund_amount: number | null; applied_at: number | null }
    const info = db.prepare('PRAGMA table_info(tickets)').all() as { name: string; type: string }[]
    db.close()
    expect(row.amount).toBe(2499)
    expect(row.refund_amount).toBeNull()           // empty text -> null
    expect(row.applied_at).toBe(parseDateTimeToMs('2026-05-28 14:27:38'))
    const typeOf = (n: string) => info.find((c) => c.name === n)!.type
    expect(typeOf('amount')).toBe('INTEGER')
    expect(typeOf('applied_at')).toBe('INTEGER')
  })

  it('migration 0002 runs cleanly on an empty fresh db', async () => {
    const dbPath = join(dir, 'fresh.db')
    await runMigrations(dbPath, join(dir, 'backups'), Date.now, MIGRATIONS)
    const db = new BetterSqlite3(dbPath)
    const info = db.prepare('PRAGMA table_info(tickets)').all() as { name: string; type: string }[]
    db.close()
    expect(info.find((c) => c.name === 'amount')!.type).toBe('INTEGER')
  })
```
> 注:`BASELINE_STATEMENTS` 当前已 export;`MIGRATIONS[0]` 是 baseline。若 lint 警告 `BASELINE_STATEMENTS` 未使用,删除那一行 import(它只是确保可用,不强制使用)。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/db/migrations.test.ts`
Expected: FAIL(0002 不存在 → amount 仍是 TEXT、值未转换)。

- [ ] **Step 3: 实现 migration 0002** — 编辑 `src/main/db/migrations.ts`。顶部 import 增加:
```ts
import { parseAmountToCents, parseDateTimeToMs } from '../../shared/aftersale-format'
```
把 `MIGRATIONS` 数组改为追加第二项:
```ts
export const MIGRATIONS: CodeMigration[] = [
  { name: '0001_baseline', up: async (knex) => { for (const s of BASELINE_STATEMENTS) await knex.raw(s) } },
  {
    name: '0002_amounts_and_applied_at_numeric',
    up: async (knex) => {
      await knex.raw('ALTER TABLE tickets ADD COLUMN amount_num INTEGER')
      await knex.raw('ALTER TABLE tickets ADD COLUMN refund_amount_num INTEGER')
      await knex.raw('ALTER TABLE tickets ADD COLUMN applied_at_num INTEGER')
      const rows = await knex('tickets').select('aftersale_no', 'amount', 'refund_amount', 'applied_at')
      for (const r of rows) {
        await knex('tickets').where('aftersale_no', r.aftersale_no).update({
          amount_num: parseAmountToCents(String(r.amount ?? '')),
          refund_amount_num: parseAmountToCents(String(r.refund_amount ?? '')),
          applied_at_num: parseDateTimeToMs(String(r.applied_at ?? ''))
        })
      }
      await knex.raw('ALTER TABLE tickets DROP COLUMN amount')
      await knex.raw('ALTER TABLE tickets DROP COLUMN refund_amount')
      await knex.raw('ALTER TABLE tickets DROP COLUMN applied_at')
      await knex.raw('ALTER TABLE tickets RENAME COLUMN amount_num TO amount')
      await knex.raw('ALTER TABLE tickets RENAME COLUMN refund_amount_num TO refund_amount')
      await knex.raw('ALTER TABLE tickets RENAME COLUMN applied_at_num TO applied_at')
    }
  }
]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/db/migrations.test.ts`
Expected: PASS(含既有 baseline 用例 + 新的转换/空库用例)。

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations.ts tests/db/migrations.test.ts
git commit -m "feat(db): migration 0002 — amounts->cents, applied_at->epoch ms"
```

---

### Task 4: 导入解析为数值/时间戳

**Files:**
- Modify: `src/main/services/ticket-import-map.ts`
- Test: `tests/services/ticket-import-map.test.ts`

**Interfaces:**
- Consumes: `parseAmountToCents`, `parseDateTimeToMs`(Task 1)。
- Produces: `mapRows` 输出的 `tickets[].amount/refundAmount` 为分、`appliedAt` 为 epoch 毫秒。

- [ ] **Step 1: 改测试** — 编辑 `tests/services/ticket-import-map.test.ts`。顶部 import 增加:
```ts
import { parseDateTimeToMs } from '../../src/main/services/ticket-import-map' // placeholder
```
改为实际:在已有 import 后新增
```ts
import { parseDateTimeToMs } from '../../src/shared/aftersale-format'
```
把 `maps known columns ...` 用例里的三处断言改为:
```ts
    expect(t.amount).toBe(2499)
    expect(t.refundAmount).toBe(2499)
    expect(t.appliedAt).toBe(parseDateTimeToMs('2026-05-28 14:27:38'))
```
新增一个用例验证空金额/空时间 → null:
```ts
  it('parses empty amount/applied_at cells to null', () => {
    const HEADER2 = ['售后编号', '交易金额', '申请时间']
    const r = mapRows([HEADER2, ['ASX', '', '']])
    expect(r.tickets[0].amount).toBeNull()
    expect(r.tickets[0].appliedAt).toBeNull()
  })
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/services/ticket-import-map.test.ts`
Expected: FAIL(当前返回原始字符串)。

- [ ] **Step 3: 实现** — 编辑 `src/main/services/ticket-import-map.ts`。顶部 import 增加:
```ts
import { parseAmountToCents, parseDateTimeToMs } from '../../shared/aftersale-format'
```
把构造 ticket 的三行:
```ts
      amount: rec.amount ?? '',
      refundAmount: rec.refundAmount ?? '',
      appliedAt: rec.appliedAt ?? '',
```
改为:
```ts
      amount: parseAmountToCents(rec.amount ?? ''),
      refundAmount: parseAmountToCents(rec.refundAmount ?? ''),
      appliedAt: parseDateTimeToMs(rec.appliedAt ?? ''),
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/services/ticket-import-map.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/main/services/ticket-import-map.ts tests/services/ticket-import-map.test.ts
git commit -m "feat(import): parse amount->cents, applied_at->epoch ms"
```

---

### Task 5: 新建对话框 — 数值输入 + 时间选择器

**Files:**
- Modify: `src/renderer/components/NewTicketDialog.tsx`
- Test: `tests/renderer/NewTicketDialog.test.tsx`

**Interfaces:**
- Consumes: `parseAmountToCents`, `localInputToMs`(Task 1)。
- Produces: 提交的 `NewTicket` 中 `amount/refundAmount` 为分、`appliedAt` 为 epoch 毫秒。

- [ ] **Step 1: 改测试** — 编辑 `tests/renderer/NewTicketDialog.test.tsx`。顶部 import 增加:
```ts
import { parseDateTimeToMs } from '../../src/shared/aftersale-format'
```
在 `submits status + aftersale fields` 用例中,把申请时间输入值改成 datetime-local 格式,并把断言改为数值:
- 把 `fireEvent.change(screen.getByLabelText('申请时间'), { target: { value: '2026-05-28 14:27:38' } })` 改为 `{ target: { value: '2026-05-28T14:27:38' } }`
- 把 `expect(arg.amount).toBe('24.99')` 改为 `expect(arg.amount).toBe(2499)`
- 把 `expect(arg.appliedAt).toBe('2026-05-28 14:27:38')` 改为 `expect(arg.appliedAt).toBe(parseDateTimeToMs('2026-05-28 14:27:38'))`
在断言全部字段的用例中(若设置了 退款金额/申请时间),同样:退款金额 `'20.00'` → `expect(arg.refundAmount).toBe(2000)`;申请时间用 `'2026-05-28T14:27:38'` → `expect(arg.appliedAt).toBe(parseDateTimeToMs('2026-05-28 14:27:38'))`。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/NewTicketDialog.test.tsx`
Expected: FAIL(当前提交字符串)。

- [ ] **Step 3: 实现** — 编辑 `src/renderer/components/NewTicketDialog.tsx`。

3a. import 增加(渲染层用 `@shared` 别名,与既有 `@shared/types` 一致):
```ts
import { parseAmountToCents, localInputToMs } from '@shared/aftersale-format'
```

3b. 提交 payload(`submit` 中 `onCreate({...})`)把这三项改为转换后的值:
```ts
      amount: parseAmountToCents(amount), refundAmount: parseAmountToCents(refundAmount), appliedAt: localInputToMs(appliedAt), returnLogistics: returnLogistics.trim(),
```
(`amount`/`refundAmount`/`appliedAt` 仍是 `useState('')` 字符串中转,提交时转换;`reset()` 不变,仍清空为 `''`。)

3c. 把三个输入控件改为:
```tsx
              <input aria-label="交易金额" type="number" step="0.01" className="field tnum" value={amount} onChange={(e) => setAmount(e.target.value)} />
```
```tsx
              <input aria-label="退款金额" type="number" step="0.01" className="field tnum" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
```
```tsx
              <input aria-label="申请时间" type="datetime-local" step="1" className="field tnum" value={appliedAt} onChange={(e) => setAppliedAt(e.target.value)} />
```
(删除申请时间原先的 `placeholder="YYYY-MM-DD HH:mm:ss"`。)

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/renderer/NewTicketDialog.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/NewTicketDialog.tsx tests/renderer/NewTicketDialog.test.tsx
git commit -m "feat(ui): number inputs + datetime picker for amounts/applied_at in new-ticket dialog"
```

---

### Task 6: 详情页 — 编辑转换 + 格式化展示

**Files:**
- Modify: `src/renderer/components/TicketDetail.tsx`
- Test: `tests/renderer/TicketDetail.test.tsx`

**Interfaces:**
- Consumes: `parseAmountToCents`, `localInputToMs`, `formatCents`, `formatMs`, `msToLocalInput`(Task 1)。
- Produces: 详情页展示/编辑数值金额与 epoch 时间。

- [ ] **Step 1: 改测试** — 编辑 `tests/renderer/TicketDetail.test.tsx`。顶部 import 增加:
```ts
import { parseDateTimeToMs } from '../../src/shared/aftersale-format'
```
把 fixture 的三字段改为数值:
```ts
  amount: 2499, refundAmount: 2499, appliedAt: parseDateTimeToMs('2026-05-28 14:27:38'), returnLogistics: '签收'
```
展示断言保持不变即可(`getByText('2026-05-28 14:27:38')` 与 `getAllByText('24.99')` 仍成立,因为 `formatMs`/`formatCents` 产出同样的串)。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/TicketDetail.test.tsx`
Expected: FAIL(当前直接渲染 `ticket.amount` 数字 `2499` / `ticket.appliedAt` 数字,而非格式化串)。

- [ ] **Step 3: 实现** — 编辑 `src/renderer/components/TicketDetail.tsx`。

3a. import 增加(渲染层用 `@shared` 别名):
```ts
import { parseAmountToCents, localInputToMs, formatCents, formatMs, msToLocalInput } from '@shared/aftersale-format'
```

3b. `form` 的类型:金额/时间用字符串中转。把 `useState<...>` 的类型与初值改为(把 `amount/refundAmount/appliedAt` 从 `AftersaleFields` 中剔除,改为 string):
```ts
  const [form, setForm] = useState<
    Pick<Ticket, 'orderNo' | 'shippingNo' | 'returnNo'> & CustomerFields &
    Omit<AftersaleFields, 'amount' | 'refundAmount' | 'appliedAt'> &
    { amount: string; refundAmount: string; appliedAt: string }
  >({
    orderNo: '', shippingNo: '', returnNo: '',
    recipientName: '', phone: '', provinceCode: '', province: '',
    cityCode: '', city: '', districtCode: '', district: '', addressDetail: '', extension: '',
    aftersaleType: '', aftersaleReason: '', shippingStatus: '',
    amount: '', refundAmount: '', appliedAt: '', returnLogistics: ''
  })
```

3c. `startEdit()` 的 `setForm({...})` 把三字段用格式化初始化(其余保持从 ticket 取):
```ts
      amount: formatCents(ticket.amount), refundAmount: formatCents(ticket.refundAmount), appliedAt: msToLocalInput(ticket.appliedAt), returnLogistics: ticket.returnLogistics
```

3d. `saveInfo()`:把 `api.updateTicket(aftersaleNo, { ...form })` 改为先把三字段转回数值:
```ts
  async function saveInfo() {
    await api.updateTicket(aftersaleNo, {
      ...form,
      amount: parseAmountToCents(form.amount),
      refundAmount: parseAmountToCents(form.refundAmount),
      appliedAt: localInputToMs(form.appliedAt)
    })
    setEditing(false)
    await reload()
    onChanged()
    setMsg('已保存基本信息')
  }
```

3e. 三个 InfoRow 的读/编辑分支:
- 交易金额:
```tsx
            <InfoRow label="交易金额">
              {editing
                ? <input className="field tnum py-1.5" type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="未填写" />
                : <Value v={formatCents(ticket.amount)} />}
            </InfoRow>
```
- 退款金额:
```tsx
            <InfoRow label="退款金额">
              {editing
                ? <input className="field tnum py-1.5" type="number" step="0.01" value={form.refundAmount} onChange={(e) => setForm((f) => ({ ...f, refundAmount: e.target.value }))} placeholder="未填写" />
                : <Value v={formatCents(ticket.refundAmount)} />}
            </InfoRow>
```
- 申请时间:
```tsx
            <InfoRow label="申请时间">
              {editing
                ? <input className="field tnum py-1.5" type="datetime-local" step="1" value={form.appliedAt} onChange={(e) => setForm((f) => ({ ...f, appliedAt: e.target.value }))} />
                : <Value v={formatMs(ticket.appliedAt)} />}
            </InfoRow>
```
(其余字段的 InfoRow 不变。)

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/renderer/TicketDetail.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/TicketDetail.tsx tests/renderer/TicketDetail.test.tsx
git commit -m "feat(ui): detail page edits/show amounts (cents) + applied_at (datetime picker)"
```

---

### Task 7: 列表 — 申请时间格式化

**Files:**
- Modify: `src/renderer/components/TicketTable.tsx`
- Test: `tests/renderer/TicketTable.test.tsx`

**Interfaces:**
- Consumes: `formatMs`(Task 1)。
- Produces: 列表申请时间列展示格式化时间。

- [ ] **Step 1: 改测试** — 编辑 `tests/renderer/TicketTable.test.tsx`。

1a. 顶部 import 增加:
```ts
import { parseDateTimeToMs } from '../../src/shared/aftersale-format'
```
1b. 把 `EMPTY_AFTERSALE` 中三字段默认改为数值 null:
```ts
  amount: null, refundAmount: null, appliedAt: null, returnLogistics: ''
```
1c. 在 `renders the new aftersale columns and the status chip` 用例里,把 `appliedAt: '2026-05-28 14:27:38'` 改为 `appliedAt: parseDateTimeToMs('2026-05-28 14:27:38')`(断言 `getByText('2026-05-28 14:27:38')` 不变)。

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run tests/renderer/TicketTable.test.tsx`
Expected: FAIL(当前渲染 `{t.appliedAt || '—'}` → 数字而非格式化串)。

- [ ] **Step 3: 实现** — 编辑 `src/renderer/components/TicketTable.tsx`。

3a. import 增加(渲染层用 `@shared` 别名):
```ts
import { formatMs } from '@shared/aftersale-format'
```
3b. 把申请时间单元格:
```tsx
                    <td className="tnum px-4 py-3 text-muted">{t.appliedAt || '—'}</td>
```
改为:
```tsx
                    <td className="tnum px-4 py-3 text-muted">{formatMs(t.appliedAt) || '—'}</td>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run tests/renderer/TicketTable.test.tsx`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/TicketTable.tsx tests/renderer/TicketTable.test.tsx
git commit -m "feat(ui): format applied_at (epoch ms) in ticket list"
```

---

### Task 8: 全量校验

**Files:** 无新增(纯验证)。

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 2: 类型检查 + 打包**

Run: `npm run build`
Expected: 通过、`out/` 生成、无报错。
补充类型检查(过滤项目预存的 `node:` 噪声):
Run: `npx tsc --noEmit -p tsconfig.json --ignoreDeprecations 6.0 2>&1 | grep -E "error TS" | grep -v "TS2591" | grep -vE "Cannot find name '(console|process|Buffer|require|module|__dirname|global)'"`
Expected: 无输出(零真实类型错误)。

- [ ] **Step 3: Commit(若有 lockfile 等变化)**

```bash
git add -A
git commit -m "chore: full test + typecheck pass for numeric amounts + datetime picker" || echo "nothing to commit"
```
> 注意:`sdd/` 与 `.claude/` 为未跟踪的临时目录,`git add -A` 前确认不要把它们提交(必要时只 `git add` 具体文件)。

---

## Self-Review

**Spec coverage:**
- §2 纯函数 → Task 1。§3.1 类型 → Task 2。§3.2 迁移 0002 → Task 3。§3.3 仓库 → Task 2。
- §4 导入 → Task 4。§5.1 新建对话框 → Task 5。§5.2 详情页 → Task 6。§5.3 列表 → Task 7。
- §6 测试 → 各 Task 的测试步骤 + Task 8 全量。§7 影响面清单 → Task 1–7 文件一一对应。

**Placeholder scan:** 无 TBD/TODO;每个代码步骤含完整代码与确切命令/预期。(Task 4/5 测试步骤里出现的 `placeholder` 字样是「先写错占位 import、随后改为正确 import」的明确指示,非未完成内容。)

**Type consistency:** `parseAmountToCents/formatCents/parseDateTimeToMs/formatMs/msToLocalInput/localInputToMs` 在 Task 1 定义,后续 Task 一致引用;`amount/refundAmount: number|null`、`appliedAt: number|null` 贯穿 types/repo/import/migration/UI。导入路径:**main 进程**(`tickets.ts`/`ticket-import-map.ts`/`migrations.ts`)用相对 `../../shared/aftersale-format`(与既有 `../../shared/types` 一致);**渲染层**(`NewTicketDialog`/`TicketDetail`/`TicketTable`)用 `@shared/aftersale-format`(与既有 `@shared/types` 一致);**测试**用 `../../src/shared/aftersale-format`。
