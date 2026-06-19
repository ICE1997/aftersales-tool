# 从补充数据文件回填售后单地区(省/市/区) — 设计

> 状态:待评审。日期 2026-06-19。

## 目标

有时售后单缺少地区信息,但能从其它数据(如快递打印清单)拿到。增加一个**补充导入**:选一个文件(csv/xls/xlsx),按**订单号**匹配售后单,把文件里的**省/市/区**地名解析成系统地区编码后**回填**到售后单。

样本(`fad1c67…xlsx`,快递打印清单):列含「订单号」`260619-300228350341868`、「省市区」`云南省/曲靖市/师宗县`(单列、斜杠连地名);收件人/电话/地址被打码,故本期只回填地区。

## 已拍板

- **补充字段**:仅 省/市/区(地区)。
- **匹配键**:仅「订单号」。一个订单号匹配到多张售后单时,全部(符合填充条件的)回填。
- **填充策略**:**仅填空白** —— 售后单 `province` 为空才回填整组省/市/区;已有地区则跳过。
- **部分解析也算成功**:能解析到哪级就填到哪级(只解析出"省"也回填、视为成功;省解析不出则该行计入"无法解析")。

## 架构(全在主进程)

- **`src/shared/region-data.ts`**:把 `china-divisions.json`(扁平 `{code,name,parent}`)挪到 shared;渲染层 `region.ts` 改从这里取(行为不变)。
- **`resolveRegion(provName, cityName, distName)`**(shared,纯函数):逐级按名字匹配编码 —— 省在顶层匹配,市在该省下匹配,区在该市下匹配;名字容错(精确,失败再去掉/补「省/市/区/县/自治区」等后缀重试)。返回 `{ provinceCode, province, cityCode, city, districtCode, district }`,只填解析出的层级(级联:市仅在省解析后尝试,区仅在市解析后尝试)。省解析不出 → 全空。
- **`splitRegionCell(cell)`**(shared,纯函数):把单列地区串拆成 `{ p, c, d }`。分隔符 `/ \ · , ，空格 -`;若是拼接串(`云南省曲靖市师宗县`)按后缀(省/自治区/市/区/县/盟/州…)尽力切分。
- **`parseSheet(path)`**:把现有 `parseXlsx` 扩成支持 .xlsx/.xls/.csv(SheetJS `XLSX.read` 一套;按扩展名/内容解析)。返回 `string[][]`。
- **表头识别**(主进程,纯函数 `detectColumns(header)`):
  - 订单号列:表头含「订单号」。
  - 地区:优先单列(表头 ∈ 省市区/省市县/地区/收货地区/省市);否则取独立列(省∈{省,省份}、市∈{市,城市}、区∈{区,县,区县})。
  - 找不到订单号列或任何地区列 → 抛错「未找到 订单号 / 省市区 列」。
- **IPC `tickets:enrichRegion`**:打开文件框(过滤 csv/xls/xlsx)→ `parseSheet` → `detectColumns` → 逐行:取订单号 + 拆地区 + `resolveRegion` → 按订单号查售后单、`province===''` 才更新省/市/区(+编码)→ 返回汇总。
- **`TicketRepo`**:按订单号查(新增 `byOrderNos(nos)` 或在 enrich 内用现有 `list()` 建 orderNo→tickets 索引);更新复用现有 `update(no, patch)`。
- **预加载** `enrichRegion(): Promise<EnrichResult>`;**渲染层**:售后单列表工具栏加「补充信息」按钮(挨着「导入售后单」)→ 触发 → 结果弹窗(复用 `ImportResultDialog` 风格)。

## 数据流

文件 → `parseSheet` 行 → `detectColumns` → 每行 `{ orderNo, regionNames }` → `resolveRegion` → 按 orderNo 匹配售后单(`province` 空)→ `update` 省/市/区 → 汇总。

## 结果汇总(`EnrichResult`,弹窗展示)

`{ rows, withRegion, matchedTickets, updated, skippedHasRegion, noTicket, unresolved }`
- rows:数据行数;withRegion:解析出地区的行;matchedTickets:订单号匹配到的售后单数;updated:实际回填数;skippedHasRegion:匹配到但已有地区跳过;noTicket:订单号在系统无对应售后单;unresolved:地名无法解析(省都解析不出)。

## 错误 / 边界

- 缺「订单号」或「省市区」列 → 抛错,弹窗提示。
- 地名解析不出 → 计 unresolved、跳过,不报错。
- 订单号无对应售后单 → 计 noTicket、跳过。
- 地区单元格为空 / 打码(含 `*` 且无有效地名)→ 解析不出 → unresolved/跳过。
- 一订单号多售后单 → 各自按"空才填"处理。

## 测试

- `resolveRegion`:省/市/区精确;后缀容错(如"云南"→"云南省");仅省可解析;全不可解析。
- `splitRegionCell`:斜杠 `云南省/曲靖市/师宗县`、空格、拼接串、空串。
- `detectColumns`:单列省市区;独立 省/市/区 列;缺列抛错。
- enrich 映射(纯):给定行 + 售后单集合 → 期望的更新集合与各计数(仅填空白、多单同订单号、无匹配、未解析)。
- `parseSheet`:csv 与 xls 各一个小样例 → 行数组。

## 不做(YAGNI)

- 回填 收件人/电话/地址 等(本期只地区;且样本里被打码)。
- 按售后单号/快递单号匹配、通用列映射 UI、覆盖已有地区、导入时选策略、模糊地名(拼音/别名)匹配。
