# 售后单 Excel 导入 + 售后字段扩展 设计文档(Spec C)

**日期**:2026-06-17
**状态**:已确认,待编写实现计划
**关联**:在现有「售后单内嵌收件人字段」(Spec A)基础上扩展。本 spec 覆盖:从拼多多售后导出 Excel 批量导入售后单,并把售后单数据模型从 3 态状态扩展为完整的 PDD 售后字段集合。

---

## 1. 概述

两块强耦合的改动(导入依赖新字段先存在):

- **数据模型扩展**:售后单状态由 3 态枚举(`pending/processing/resolved`)**全面替换**为 10 个 PDD 售后状态;并新增 7 个售后字段(售后类型、售后原因、发货状态、交易金额、退款金额、申请时间、退货物流状态)。所有新字段**可手动编辑**。
- **Excel 导入**:列表顶部「新建售后单」旁加「导入 Excel」按钮 → 选 `.xlsx` → 解析 → 按 **售后编号** 去重(**已存在的跳过、不更新**)→ 批量插入 → 弹窗汇总结果。**买家等用户信息不导入**。

设计原则:列解析与映射是离线纯函数,可单测;按表头中文名匹配列(不靠列序),对模板列重排健壮;不引入网络/AI;新增依赖为纯 JS(不增加原生模块与 Windows 打包负担)。

### 1.1 模板事实(已核对样本)

模板为拼多多售后导出,首行表头,24 列,样本 54 行数据。取用的列:

| Excel 表头 | 目标字段 | 样例 |
|---|---|---|
| 售后编号 | `aftersaleNo`(主键 / 去重键) | `20786579757397` |
| 订单编号 | `orderNo` | `260525-337872186892754` |
| 发货运单号 | `shippingNo` | `777412672095673` |
| 退货运单号 | `returnNo` | `1357626046345` |
| 售后状态 | `status` | `退款成功` |
| 退款类型 | `aftersaleType` | `退货退款` |
| 退款原因 | `aftersaleReason` | `做工问题` |
| 订单状态 | `shippingStatus` | `已发货` |
| 交易金额 | `amount` | `24.99` |
| 退款金额 | `refundAmount` | `24.99` |
| 申请时间 | `appliedAt` | `2026-05-28 14:27:38` |
| 退货物流状态 | `returnLogistics` | `签收` |

其余列(商品 ID、买家、超时时间、同意退款/退货时间与人、SKU 信息、订单标记、备注等)**全部忽略**。其中「买家」(形如 `王*: 1*********9`)为用户信息,明确不导入。

> 注意 Excel 列名是「退款类型/退款原因」,但落地为更通用的「售后类型/售后原因」语义。

---

## 2. 取值约定与枚举

为减小类型与迁移复杂度,**7 个新字段一律以 `TEXT` 原样存储**(无损、可按字符串排序、编辑为普通输入):

- **金额**(`amount`/`refundAmount`):存原始字符串(如 `"24.99"`),不做数值化(避免浮点误差;暂无求和需求)。
- **申请时间**(`appliedAt`):存原始 `"YYYY-MM-DD HH:mm:ss"` 字符串。该格式按字符串排序即等价于时间排序,列表可直接按它排序;无需 epoch 转换。
- 其余字段存对应中文文本。

### 2.1 售后状态枚举(10 值)

```
待商家处理 | 待商家收货 | 待消费者发货 | 平台处理中
退款成功 | 退款关闭 | 换货/补寄成功 | 换货/补寄关闭 | 维修成功 | 维修关闭
```

- 不引入「进行中」分组概念(全面替换、扁平)。
- **手动新建默认状态**:`待商家处理`。
- 配色分组(用于 chip):
  - 进行中类(待商家处理 / 待商家收货 / 待消费者发货 / 平台处理中)→ info/warn 暖色调
  - 成功类(退款成功 / 换货/补寄成功 / 维修成功)→ ok 绿
  - 关闭类(退款关闭 / 换货/补寄关闭 / 维修关闭)→ muted 灰

### 2.2 其它编辑枚举(下拉选项)

- **售后类型**:退款 / 退款退货 / 换货 / 补寄 / 维修
- **售后原因**:七天无理由退货 / 其他原因 / 质量问题 / 商品描述不符 / 发货履约原因 / 少件 / 疑似假货
- **发货状态**:未发货 / 已发货

> Excel 中出现的、不在上述下拉枚举内的值(如样本里的退款原因「做工问题/不想要了/货物与描述不符」),**导入时原样保留**;手动编辑下拉以「当前值 + 标准选项」并集呈现,不丢失导入的非标值。金额/申请时间/退货物流状态为自由文本输入。

---

## 3. 数据模型

### 3.1 共享类型(`src/shared/types.ts`)

```ts
export type TicketStatus =
  | '待商家处理' | '待商家收货' | '待消费者发货' | '平台处理中'
  | '退款成功' | '退款关闭' | '换货/补寄成功' | '换货/补寄关闭' | '维修成功' | '维修关闭'

// 新增售后字段(随 Ticket 与 NewTicket 流转)
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

- `Ticket` 增加 `AftersaleFields` 的全部字段;`status` 类型改为新 `TicketStatus`。
- `NewTicket` 增加 `Partial<AftersaleFields>` 与可选 `status?: TicketStatus`(导入时带入,手动新建走默认)。
- 新增 `ImportTicketsResult`:

```ts
export interface ImportTicketsResult {
  imported: number
  skippedExisting: number            // 库中已存在(按售后编号)而跳过
  failed: { row: number; reason: string }[]  // row 为 Excel 行号(1 基,含表头)
  duplicatedInFile: number           // 文件内重复(保留首条)的条数
}
```

### 3.2 表结构(`src/main/db/database.ts`)

- 新增 `TICKET_AFTERSALE_COLS`(7 列,`TEXT NOT NULL DEFAULT ''`),在 `migrate` 里循环 `ensureColumn(db, 'tickets', …)` 追加:
  `aftersale_type, aftersale_reason, shipping_status, amount, refund_amount, applied_at, return_logistics`。
- `status` 列复用(已存在,DDL 默认值保持 `'pending'` 不动 —— 新库无行、写入恒由仓库提供 status,默认值不会被命中)。
- **FTS 不变**(`FTS_COLS_ARR` 维持原样,新字段不参与全文检索,免重建)。
- **一次性状态迁移** `migrateLegacyStatuses(db)`(幂等,在 `migrate` 中调用):
  把存量行里仍为旧值的 status 映射为新值 —— `pending→待商家处理`、`processing→平台处理中`、`resolved→退款成功`;仅更新 `status IN ('pending','processing','resolved')` 的行,反复运行安全。

### 3.3 仓库(`src/main/db/tickets.ts`)

- `ROW`/`TROW` 增加 7 个新列的 `AS` 别名;新增 `EMPTY_AFTERSALE` 常量。
- `create(t)`:INSERT 列与 VALUES 增加 7 字段;`status` 取 `t.status ?? '待商家处理'`(替代原先硬编码的 `'pending'`)。
- `update(no, patch)`:UPDATE SET 增加 7 字段 + `status`(均已可编辑)。
- 新增 `existingNos(nos: string[]): Set<string>`:批量查询已存在的售后编号(`WHERE aftersale_no IN (…)`,分批避免参数上限)。
- 新增 `createMany(tickets: NewTicket[]): void`:单事务批量插入(复用 create 的列定义),**每行照常 `ftsInsert`**,保证导入的单子可被搜索。
- FTS 列集合不变(新字段不入 FTS),无需重建。

---

## 4. Excel 导入

### 4.1 依赖

新增 `xlsx`(SheetJS,npm `^0.18.5`,仅用读取)。纯 JS,无原生模块。

### 4.2 纯函数:`src/main/services/ticket-import-map.ts`

不依赖文件 IO,便于单测:

```ts
// 表头中文名 → NewTicket 字段
const HEADER_MAP: Record<string, keyof NewTicket> = {
  '售后编号': 'aftersaleNo', '订单编号': 'orderNo', '发货运单号': 'shippingNo',
  '退货运单号': 'returnNo', '售后状态': 'status', '退款类型': 'aftersaleType',
  '退款原因': 'aftersaleReason', '订单状态': 'shippingStatus', '交易金额': 'amount',
  '退款金额': 'refundAmount', '申请时间': 'appliedAt', '退货物流状态': 'returnLogistics',
}

export interface MapResult {
  tickets: NewTicket[]                       // 去掉文件内重复后的待插入集
  failed: { row: number; reason: string }[]
  duplicatedInFile: number
  missingRequiredHeader: boolean             // 缺「售后编号」表头列 → 整体失败信号
}

// 入参:解析出的二维数组(含表头行)。按表头定位列,逐行构造 NewTicket。
export function mapRows(matrix: string[][]): MapResult
```

规则:
- 用第一行做表头→列索引映射;若缺「售后编号」列 → `missingRequiredHeader=true`(调用方整体失败)。
- 每数据行:售后编号空 → 记 `failed`(原因「缺少售后编号」),跳过。
- 文件内售后编号重复 → 保留首条,其余计入 `duplicatedInFile`。
- 单元格做 `String(v).trim()`;只取 `HEADER_MAP` 命中的列,其余忽略。
- status:原样取 Excel 值;为空时回退 `待商家处理`。

### 4.3 读取与 IPC:`src/main/services/ticket-importer.ts` + `ipc.ts`

- `TicketImporter.parseFile(path) → string[][]`:用 `xlsx.readFile` 读首个 sheet → `sheet_to_json({header:1, raw:false, defval:''})` 得到二维字符串数组。
- IPC `tickets:import`(在 `registerIpc` 注册):
  1. `dialog.showOpenDialog({ filters: [{ name: 'Excel', extensions: ['xlsx'] }], properties: ['openFile'] })`;用户取消 → 返回 `null`。
  2. `parseFile` → `mapRows`。
  3. `missingRequiredHeader` → 抛出可读错误(渲染层提示「模板不正确:缺少『售后编号』列」)。
  4. `tickets.existingNos(...)` 过滤掉库中已存在者 → `skippedExisting`。
  5. `tickets.createMany(剩余)`。
  6. 返回 `ImportTicketsResult`。
- preload(`src/preload/index.ts`)暴露 `api.importTickets(): Promise<ImportTicketsResult | null>`;`api.ts` 同步声明。

---

## 5. UI

### 5.1 列表(`src/renderer/components/TicketTable.tsx`)

- 顶部操作区在「新建售后单」**左侧**加「导入 Excel」按钮(`btn-ghost`,文件图标):点击 → `api.importTickets()` → 成功后刷新列表并弹结果窗;`null`(取消)不处理;抛错则弹错误提示。
- 列在现有基础上增加(`status` 已有,改为渲染新 chip):**售后状态**(chip)、**售后类型**(纯文本)、**退货物流状态**(纯文本)、**申请时间**(`tnum`)。
- 列变多 → 表格更宽,靠既有 `whitespace-nowrap` + `min-w` + 容器横向滚动承载;`min-w` 相应调大。

### 5.2 导入结果弹窗(`src/renderer/components/ImportResultDialog.tsx`,新增)

- `modal-card` 风格;展示:新增 X、跳过 Y(已存在)、文件内重复 W、失败 Z。
- 失败行用小列表逐条列「第 N 行:原因」。
- 单个「完成」按钮关闭。

### 5.3 状态元数据(`src/renderer/status.ts`)

- `STATUS_META` 扩为 10 条;`label` 即状态值本身;`dot`/`chip` 按 §2.1 配色分组复用现有 token(`ok/info/warn/muted` 系)。
- `STATUS_ORDER` 更新为 10 值顺序(进行中类 → 成功类 → 关闭类)。

### 5.4 新建对话框(`src/renderer/components/NewTicketDialog.tsx`)

- 增加可编辑字段:售后状态(下拉,默认 `待商家处理`)、售后类型(下拉)、售后原因(下拉)、发货状态(下拉)、交易金额(文本)、退款金额(文本)、申请时间(文本)、退货物流状态(文本)。
- 提交时并入 `NewTicket`。

### 5.5 详情页(`src/renderer/components/TicketDetail.tsx`)

- 展示全部新字段;编辑态:枚举字段下拉(选项为「标准枚举 ∪ 当前值」,保留导入的非标值)、其余文本输入。
- 保存走既有 `tickets:update`(已含新字段)。

---

## 6. 错误处理

- **模板不正确**(缺「售后编号」表头列)→ 整体失败,弹窗提示需用正确模板,不插入任何行。
- **行缺售后编号** → 记入 `failed`(附行号与原因),不中断其余行。
- **文件内重复编号** → 保留首条,其余计入 `duplicatedInFile`。
- **库中已存在** → 跳过、不更新(计入 `skippedExisting`)。
- **解析异常**(非法/损坏 xlsx)→ IPC 抛错,渲染层弹错误提示。

---

## 7. 测试

- `mapRows`(纯函数,数组矩阵驱动,不需真实 xlsx):
  - 正常多行映射;只取目标列、忽略买家等列;status 空回退默认。
  - 缺「售后编号」表头 → `missingRequiredHeader`。
  - 行缺售后编号 → 进 `failed`、行号正确。
  - 文件内重复 → 保留首条、`duplicatedInFile` 计数正确。
- `TicketRepo`:
  - `createMany` 批量插入 + 新字段正确落库;`create` 默认 status 为 `待商家处理`。
  - `existingNos` 正确返回交集。
  - `migrateLegacyStatuses` 把旧 3 态映射为新值且幂等。
- `status.ts`:10 个状态元数据齐全、配色 token 合法。
- (可选)`TicketImporter.parseFile`:用一个最小 `.xlsx` 夹具验证读取→二维数组(若夹具成本高则跳过,核心逻辑已由 `mapRows` 覆盖)。

---

## 8. 影响面清单

| 文件 | 改动 |
|---|---|
| `src/shared/types.ts` | `TicketStatus` 重定义、`AftersaleFields`、`NewTicket`/`Ticket` 扩展、`ImportTicketsResult` |
| `src/main/db/database.ts` | `TICKET_AFTERSALE_COLS` + `ensureColumn`、`migrateLegacyStatuses` |
| `src/main/db/tickets.ts` | `ROW/TROW`、`create`/`update`、`existingNos`、`createMany` |
| `src/main/services/ticket-import-map.ts` | 新增(纯函数映射) |
| `src/main/services/ticket-importer.ts` | 新增(xlsx 读取) |
| `src/main/ipc.ts` | `tickets:import` handler |
| `src/preload/index.ts` + `src/renderer/api.ts` | `importTickets` 桥接 |
| `src/renderer/status.ts` | 10 状态元数据 |
| `src/renderer/components/TicketTable.tsx` | 导入按钮 + 新列 |
| `src/renderer/components/ImportResultDialog.tsx` | 新增 |
| `src/renderer/components/NewTicketDialog.tsx` | 新字段表单 |
| `src/renderer/components/TicketDetail.tsx` | 新字段展示/编辑 |
| `package.json` | 新增 `xlsx` 依赖 |

> 范围控制(YAGNI):金额不做数值化与求和、申请时间不做 epoch/日期选择器、新字段不进 FTS 搜索、不做导入预览/字段映射界面、不支持 `.xls`/`.csv`(仅 `.xlsx`)。
