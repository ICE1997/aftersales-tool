# 金额数值化 + 申请时间选择器 设计文档(Spec D)

**日期**:2026-06-17
**状态**:已确认,待编写实现计划
**关联**:在 Spec C(售后单 Excel 导入 + 售后字段扩展)基础上,把两个 TEXT 字段改成数值/时间戳存储,并给申请时间换成时间选择器。本 spec 在「Knex 迁移框架」已合入 main 的前提下编写。

---

## 1. 概述

两处改动:

1. **金额数值化**:`交易金额`(`amount`)与`退款金额`(`refundAmount`)由 TEXT/字符串改为 **INTEGER 分** 存储(TS `number | null`)。空/非法值为 `null`。
2. **申请时间选择器**:`申请时间`(`appliedAt`)由 TEXT `"YYYY-MM-DD HH:mm:ss"` 改为 **epoch 毫秒 INTEGER** 存储(TS `number | null`);UI 由纯文本输入改为 `<input type="datetime-local" step="1">` 时间选择器。

设计原则:解析/格式化为离线纯函数,被「导入解析 / 迁移 / UI 显示编辑」三处共用,单测覆盖;时间一律按**本地时间**解释(贴合商家本地时区与导入数据);schema 变更走已有 Knex 迁移框架(自动备份)。

---

## 2. 共享纯函数(`src/shared/aftersale-format.ts`,新增)

无副作用、无 IO,可单测;被 importer、migration 0002、渲染层共用。

```ts
/** "24.99" → 2499(分);空串/非法/NaN → null。四舍五入到分。 */
export function parseAmountToCents(s: string): number | null

/** 2499 → "24.99";null → ""。固定两位小数。 */
export function formatCents(cents: number | null): string

/** "YYYY-MM-DD HH:mm:ss"(本地时间)→ epoch 毫秒;空/非法 → null。 */
export function parseDateTimeToMs(s: string): number | null

/** epoch 毫秒 → "YYYY-MM-DD HH:mm:ss"(本地时间);null → ""。 */
export function formatMs(ms: number | null): string

/** epoch 毫秒 → datetime-local 的 value "YYYY-MM-DDTHH:mm:ss"(本地);null → ""。 */
export function msToLocalInput(ms: number | null): string

/** datetime-local 的 value "YYYY-MM-DDTHH:mm[:ss]"(本地)→ epoch 毫秒;空/非法 → null。 */
export function localInputToMs(v: string): number | null
```

实现要点:
- **金额**:`parseAmountToCents` 去空白后 `Number(s)`,`Number.isFinite` 校验,`Math.round(n * 100)`。`formatCents` 用 `(cents/100).toFixed(2)`。
- **时间**:`parseDateTimeToMs` 把 `"YYYY-MM-DD HH:mm:ss"` 视为本地时间构造 `new Date(y, mo-1, d, h, mi, s)`,返回 `getTime()`;格式不匹配或 `getTime()` 为 `NaN` → `null`。`formatMs`/`msToLocalInput` 用本地各分量补零拼接(不依赖 `toISOString`,避免 UTC 偏移)。`localInputToMs` 解析 `datetime-local` 的本地串(秒可缺省,缺省补 `00`)。
- 这些函数运行在 app 代码(main/renderer/migration),`new Date(...)` 可正常使用(不是 workflow 脚本环境)。

---

## 3. 数据模型与迁移

### 3.1 共享类型(`src/shared/types.ts`)

`AftersaleFields` 三个字段改型(其余 4 个 `aftersaleType/aftersaleReason/shippingStatus/returnLogistics` 仍为 `string`):

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

`NewTicket` 仍以 `Partial<AftersaleFields>` 携带,故为 `amount?: number | null` 等。

### 3.2 迁移(`src/main/db/migrations.ts`)

- **baseline 0001 冻结不动**(仍声明这三列为 TEXT)——遵循迁移框架「历史不可变」约定。
- **新增 `0002_amounts_and_applied_at_numeric`**,对所有 DB(新库在 baseline 之后、老库直接)执行。`up(knex)`:
  1. `ALTER TABLE tickets ADD COLUMN amount_num INTEGER`(同样加 `refund_amount_num`、`applied_at_num`)。
  2. JS 逐行转换:`SELECT aftersale_no, amount, refund_amount, applied_at FROM tickets`,对每行用 §2 的 `parseAmountToCents` / `parseDateTimeToMs` 计算新值,`UPDATE` 写入 `*_num` 列(空表则无行,no-op)。
  3. `ALTER TABLE tickets DROP COLUMN amount`(同 `refund_amount`、`applied_at`)。
  4. `ALTER TABLE tickets RENAME COLUMN amount_num TO amount`(同另两列)。
- **FTS 不受影响**:这三列不在 `tickets_fts` 列集合内,且 `ADD/DROP/RENAME COLUMN` 不改变 rowid,外部内容表的 rowid 引用保持有效。
- DROP/RENAME COLUMN 依赖 SQLite ≥ 3.35(better-sqlite3 内置版本满足)。
- 迁移失败由框架包裹报错并附带迁移前备份路径(已有逻辑)。

> 为何用 JS 逐行而非纯 SQL:`applied_at` 的 `"YYYY-MM-DD HH:mm:ss"` 需按本地时间转 epoch,SQLite `strftime('%s', ...)` 按 UTC 解释会产生时区偏移;JS 解析与导入逻辑一致,且空/非法统一为 `null`。

### 3.3 仓库(`src/main/db/tickets.ts`)

- `ROW`/`TROW`:`amount`、`refund_amount AS refundAmount`、`applied_at AS appliedAt` 维持别名,better-sqlite3 现在原生返回 `number | null`。
- `EMPTY_AFTERSALE`:`amount`、`refundAmount`、`appliedAt` 默认值由 `''` 改为 `null`。
- `create`/`update`:这三个字段绑定 `number | null`(SQLite 接受 number 与 null)。其余逻辑不变。

---

## 4. 导入(`src/main/services/ticket-import-map.ts`)

`mapRows` 中三个字段由「原样字符串」改为「解析为数值/时间戳」:

```ts
amount: parseAmountToCents(rec.amount ?? ''),
refundAmount: parseAmountToCents(rec.refundAmount ?? ''),
appliedAt: parseDateTimeToMs(rec.appliedAt ?? ''),
```

其余字段不变。`MapResult.tickets` 仍是 `NewTicket[]`(现含 `number | null` 字段)。

---

## 5. UI

### 5.1 新建对话框(`src/renderer/components/NewTicketDialog.tsx`)

- 金额状态由 `string` 改为「以**元**为单位的输入字符串」中转,提交时经 `parseAmountToCents` 转分:
  - `交易金额`/`退款金额`:`<input type="number" step="0.01" aria-label="交易金额">`,提交 `amount: parseAmountToCents(amountInput)`(空→`null`)。
- 申请时间:`<input type="datetime-local" step="1" aria-label="申请时间">`,提交 `appliedAt: localInputToMs(appliedAtInput)`。
- `reset()` 把这三项清空(金额输入串清空、时间输入串清空)。

### 5.2 详情页(`src/renderer/components/TicketDetail.tsx`)

- `form` 中这三字段:金额以「元输入串」编辑、时间以 datetime-local value 串编辑;`startEdit()` 用 `formatCents(ticket.amount)`(元串,去掉无值时的占位)与 `msToLocalInput(ticket.appliedAt)` 初始化。
- 保存:`saveInfo()` 组装 patch 时把元串/本地串转回 `number|null`(`parseAmountToCents` / `localInputToMs`)再 `updateTicket`。
  - 注意:现有 `saveInfo` 直接 `{ ...form }`;需改为先把这三字段从输入态转为存储态再提交(其余字段仍直接取 form)。
- 读模式展示:金额 `formatCents(ticket.amount)`(空值显示 `—`);申请时间 `formatMs(ticket.appliedAt)`(空值 `—`)。沿用现有 `<Value>`(空串时它已渲染 `—`)。

### 5.3 列表(`src/renderer/components/TicketTable.tsx`)

- 申请时间列由 `{t.appliedAt || '—'}` 改为 `{formatMs(t.appliedAt) || '—'}`。
- 金额不在列表,无改动。

---

## 6. 测试

- **`aftersale-format` 纯函数**:`parseAmountToCents`("24.99"→2499、"22.5"→2250、四舍五入、空→null、"abc"→null);`formatCents`(2499→"24.99"、null→"");`parseDateTimeToMs`/`formatMs` 本地往返一致("2026-05-28 14:27:38" → ms → 同串)、空/非法→null;`msToLocalInput`/`localInputToMs` 往返一致。
- **migration 0002**:构造一个 baseline 库、插入带文本金额/时间的行,跑 0002 后断言列值为对应 cents/ms、空文本→null、`PRAGMA table_info` 中三列类型为 INTEGER;空库跑 0002 不报错。
- **`mapRows`**:金额单元格→cents、申请时间→ms、空→null。
- **repo**:`create`/`get` 往返数值;`update` 改这三字段。
- **UI**:`NewTicketDialog` 提交 payload 中 `amount` 为分、`appliedAt` 为 ms;`TicketDetail` 展示 `formatCents`/`formatMs` 结果;`TicketTable` 申请时间列展示格式化时间。

---

## 7. 影响面清单

| 文件 | 改动 |
|---|---|
| `src/shared/aftersale-format.ts` | 新增(6 个纯函数) |
| `src/main/db/migrations.ts` | 新增 migration `0002`(列改型 + JS 转换) |
| `src/shared/types.ts` | `AftersaleFields` 三字段改 `number \| null` |
| `src/main/db/tickets.ts` | `EMPTY_AFTERSALE` 默认 null;create/update 绑定数值 |
| `src/main/services/ticket-import-map.ts` | 三字段解析为 cents/ms |
| `src/renderer/components/NewTicketDialog.tsx` | 金额 number 输入、时间 datetime-local;提交转换 |
| `src/renderer/components/TicketDetail.tsx` | 同上 + 读模式格式化展示;saveInfo 转换 |
| `src/renderer/components/TicketTable.tsx` | 申请时间列格式化 |
| 对应测试文件 | 新增/更新 |

> 范围控制(YAGNI):金额展示用纯小数(不加 ¥ 符号);不做金额求和/统计;datetime 精度到秒;不改其余 5 个售后字段;FTS 不变。
