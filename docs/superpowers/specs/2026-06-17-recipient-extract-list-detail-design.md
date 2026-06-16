# 收件人信息提取 + 列表/详情增强 设计文档(Spec A)

**日期**:2026-06-17
**状态**:已确认,待编写实现计划
**关联**:售后单已内嵌收件人字段(recipientName/phone/province·city·district/addressDetail,无 nickname,无客户表)。本 spec 覆盖原始需求中的 #1(列表展示省市县+收件人)、#2(新建时粘贴文本自动提取收件人信息)、#3(详情「售后详情/订单详情」按钮)。原始需求 #4(材料多级目录)拆为独立 Spec B,本文不含。

---

## 1. 概述

三块改动,围绕「售后单 + 收件人」:
- **列表**:`TicketTable` 在「状态」列后新增 **收件人** 与 **地区** 两列。
- **粘贴提取**:`新建售后单` 弹窗加「粘贴框 + 识别」,从一段复制文本里自动提取 姓名 / 手机号 / 分机号 / 省市区 / 详细地址 回填表单,所有字段仍可手动修改。新增 **分机号** 字段(虚拟号场景)。
- **详情按钮**:把「拼多多」按钮改名为 **售后详情**,并新增 **订单详情** 按钮跳转到拼多多订单页。

设计原则:提取逻辑是离线纯函数,可单测;识别不准时用户可改;不引入网络/AI。

---

## 2. 数据模型

### 2.1 共享类型(`src/shared/types.ts`)
`CustomerFields` 新增 `extension: string`(分机号)。它随 `NewTicket`(`& Partial<CustomerFields>`)与 `Ticket`(`& CustomerFields`)流转。

### 2.2 表结构(`src/main/db/database.ts`)
在 `TICKET_CUSTOMER_COLS` 增加 `['extension', "extension TEXT NOT NULL DEFAULT ''"]`,经 `ensureColumn` 给 `tickets` 追加列。**不**加入 `FTS_COLS_ARR`(分机号不参与全文检索,FTS 无需重建)。

### 2.3 仓库(`src/main/db/tickets.ts`)
`ROW`/`TROW` 增加 `extension`;`EMPTY_CUSTOMER` 增加 `extension: ''`;`create` 的 INSERT 列+VALUES、`update` 的 UPDATE SET 增加 `extension=@extension`。(FTS 列不变。)

---

## 3. 文本提取(纯函数)

### 3.1 模块:`src/renderer/contact-extract.ts`
导出纯函数:
```ts
export interface ExtractedContact {
  name: string
  phone: string
  extension: string
  provinceCode: string; province: string
  cityCode: string; city: string
  districtCode: string; district: string
  addressDetail: string
}
export function extractContact(text: string): ExtractedContact
```
离线;地区匹配复用 `./region` 的 `childrenOf(parentCode)`(省=`childrenOf('')`,市=`childrenOf(provinceCode)`,区县=`childrenOf(cityCode)`)。返回的字段未识别到时为 `''`。

### 3.2 算法
1. **去噪**:在各行文本中,删除所有 `[...]` 与 `【...】` 方括号及其内容(姓名/地址行保持干净)。但在去噪之前,先从原始文本中提取一个**括号纯数字码**(`[\d{2,6}]` 或 `【\d{2,6}】`)作为分机号备用值(PDD 虚拟号场景,如 `大潘[0106]`)。保留圆括号(可能是地址的一部分)。按换行 + 连续空白切分为 tokens/lines,同时保留整体串用于地区匹配。
2. **手机号 + 分机号**:用 `1[3-9]\d{9}` 找第一个手机号;其后若紧跟 `转|分机|ext\.?|,|，|-|/` + `\d{1,6}`,把数字捕获为 `extension`(内联分机号,优先级最高)。从工作文本中移除「手机号(+分机段)」子串。若内联分机号未命中,则用第 1 步捕获的括号纯数字码作为 `extension` 兜底(保留前导零,如 `'0106'`)。
   - 纯 11 位号(如 `19592642954`)+ 无括号码 → phone 命中、extension 为 `''`。
   - 纯 11 位号 + 括号码(如 `[2817]`)→ phone 命中、extension 为 `'2817'`。
   - 虚拟号(如 `1700000000转5678` / `170...,5678`)→ phone + extension(内联优先,括号码忽略)。
3. **地区(最长匹配)**:在剩余文本中,
   - 省:遍历省列表,匹配文本中出现的省名(优先匹配「全称」如 `江苏省`,也兼容去掉 `省/市/自治区/特别行政区` 后缀的简称);取最先出现且最长的匹配。
   - 市:在该省的 `childrenOf(provinceCode)` 里,于省名之后的子串匹配市名(全称/简称)。直辖市(北京/上海/天津/重庆)其省级与市级同名,city 取该直辖市下唯一市级项。
   - 区县:在该市的 `childrenOf(cityCode)` 里匹配区县名。
   - 把命中的 省/市/区 名称按出现顺序从地址串里剥掉,去掉前导分隔/空白,**剩余即 `addressDetail`**(如 `龙湖时代100 8栋2207`)。
   - 任一级匹配不到则该级及更细级为 `''`,地址串剩余整体作为 `addressDetail`。
4. **姓名**:在剩余(非手机、非地址)的行/token 中,取第一个非空、清洗后的 token 作为 `name`(去方括号、去首尾空白)。例:`程玲[2817]` → `程玲`。
5. 输出 `ExtractedContact`,全部字段交由 UI 回填并允许手动修改。

### 3.3 边界与兜底
- 文本为空 / 无手机号 / 无可识别地区:对应字段返回 `''`,不报错。
- 地址里地区名出现在详细地址中造成的误剥:接受(用户可手动改);以「省名后再找市、市名后再找区」的顺序定位,降低误匹配。
- 掩码号(`138****1234`)无法用于拨号,不作为有效手机号提取(best-effort 跳过);以完整 11 位为准。

---

## 4. 界面与交互

### 4.1 `新建售后单`(`NewTicketDialog`)
- 「客户信息(选填)」区**顶部**加一块:多行 `textarea`(占位:「粘贴收货地址,自动识别姓名/电话/地址」)+「识别」按钮。点击「识别」→ `extractContact(textarea值)` → 回填 收货人姓名 / 手机号 / **分机号** / `RegionCascader`(省市区)/ 详细地址。回填覆盖对应字段当前值(空字段不覆盖为非空?——策略:识别结果非空才覆盖,空结果不清空已填内容)。
- 在「手机号」旁新增 **分机号** 输入框(`extension` 状态)。提交时 `extension` 计入 `NewTicket`。

### 4.2 详情页(`TicketDetail`)「基本信息」
- 编辑态:「手机号」行旁/下新增 **分机号** 输入框。
- 展示态:手机号后若有分机号,显示为 `13800138000 转 5678`(无分机号则仅手机号)。

### 4.3 售后单列表(`TicketTable`)
- 在「状态」列后新增两列:
  - **收件人** = `t.recipientName || '—'`。
  - **地区** = `regionLabel({province,city,district}) || '—'`(来自 `../region`)。
- 其余列(订单号/发货快递单号/退货快递单号/更新时间)保留不变。

### 4.4 详情页按钮(`TicketDetail` 头部)
- 现「拼多多」按钮 → 改文案为 **售后详情**,URL 与行为不变(`https://mms.pinduoduo.com/aftersales-ssr/detail?id=<售后单号>&orderSn=<订单号>`,Chrome 打开)。
- 新增 **订单详情** 按钮 → `https://mms.pinduoduo.com/orders/detail?sn=<订单号>`,经现有 `api.openInChrome` 用 Chrome 打开;`orderNo` 为空时该按钮 `disabled`。

---

## 5. 测试策略

- **`extractContact`(纯函数,TDD,重点)**:
  - 用户样例(三行:`程玲[2817]` / `19592642954` / `江苏省苏州市虎丘区 龙湖时代100 8栋2207[2817]`)→ 断言 name=程玲、phone=19592642954、extension='2817'、province=江苏省、city=苏州市、district=虎丘区、addressDetail=`龙湖时代100 8栋2207`。
  - 直辖市样例(如 `北京市朝阳区...`)→ province/city/district 正确。
  - 虚拟号 + 分机号(`...转5678` 与 `...,5678`)→ phone + extension。
  - 带标签格式(`收货人:张三 电话:138... 地址:广东省...`)→ 正确提取。
  - 缺项:无手机号/无地区 → 对应字段为 ''、不抛错。
- **`tickets` 仓库**:create/get/update 含 `extension` 读写(可并入既有 tickets.test)。
- **`TicketTable`**:渲染含收件人/地区列;`regionLabel` 拼接正确。
- **详情按钮**:订单详情 URL 拼接(`orders/detail?sn=`)与订单号为空时禁用(可选,渲染断言)。
- **手验**:新建弹窗粘贴样例→识别回填→可改→保存;列表显示收件人/地区;详情两个按钮跳转正确。

---

## 6. 明确不做(YAGNI / 归属 Spec B)

- 材料多级目录(#4)→ 独立 Spec B。
- 不做联系人「通讯录/历史」或跨售后单复用(收件人仍只内嵌在售后单上)。
- 不做地址的 AI/在线解析(纯离线启发式 + 内置行政区划数据)。
- 不做掩码手机号还原。
- `[....]` 括号纯数字码(如 `[0106]`)作为分机号兜底捕获(内联分机号优先);非数字的括号内容仍作噪声丢弃,不单独保存。
