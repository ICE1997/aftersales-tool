# 下钻地图(阶段二·2b:中国地图按区域着色 + 省/市/区县下钻)设计文档

**日期**:2026-06-16
**状态**:已确认,待编写实现计划
**关联**:阶段二第二步。复用 2a 的 `StatsRepo.regionCounts` 聚合;在「统计」页内新增「地图」子视图,用 ECharts choropleth 展示售后分布,支持 全国 → 省 → 市 → 区县 下钻。离线桌面应用,GeoJSON 全量打包。

---

## 1. 概述

在「统计」页加「排行 / 地图」子切换。地图为 ECharts 下钻 choropleth:全国(省级)→ 点省进入该省(地市)→ 点市进入该市(区县),面包屑逐级返回。颜色深浅 = 该区域关联客户的售后单数(口径同 2a:所有有地址客户关联的售后单)。GeoJSON 全量打包(省+市+区县),运行时按 adcode 懒加载。后端不改(复用 `regionCounts`)。

---

## 2. GeoJSON 与数据架构

### 2.1 GeoJSON 生成与打包
- 构建脚本 `scripts/gen-geo.mjs`(一次性,构建期联网):从阿里 DataV.GeoAtlas 按 adcode 下载 GeoJSON,输出到 `src/renderer/geo/<adcode>.json`:
  - 全国 `100000.json`(各省多边形)
  - 每省 `<省adcode>.json`(该省地市)
  - 每市 `<市adcode>.json`(该市区县)
  - adcode 列表来自已打包的 `china-divisions.json`(经 `toAdcode` 归一化为 6 位)。
- 脚本限速 + 失败重试;校验样本文件合法。**产物提交入库**,运行时纯离线。
- 全量约几十 MB,接受(已与用户确认)。

### 2.2 编码匹配(纯函数 `toAdcode`)
- `regionCounts` 的 `code` 来自 china-division;DataV 用 6 位 adcode。
- `toAdcode(code: string, level: RegionLevel): string`:6 位则原样;否则省 `code+'0000'`(2 位)、市 `code+'00'`(4 位)、区县原样(6 位)。**实现前先核对 `china-divisions.json` 实际 code 位数**,据此让 `toAdcode` 正确(若已是 6 位则为恒等)。纯函数单测。

### 2.3 运行时数据(复用,不改后端)
- 各级仍用 `api.regionCounts(level)`;下钻层级 → 用的级别:全国→`province`、某省→`city`、某市→`district`。
- 当前下钻区域显示哪些区由其 GeoJSON 决定;每个 feature 按其 adcode 从 `regionCounts(level)` 的 `code`(经 `toAdcode`)取 count,缺失=0。

### 2.4 模块
- `src/renderer/geo.ts`:
  - `toAdcode(code, level)`(纯)。
  - `loadGeo(adcode): Promise<unknown>`:动态 `import('./geo/<adcode>.json')` + 内存缓存。
  - `mapData(features, countsByAdcode): { rows: {name, value}[]; max: number }`(纯):由 GeoJSON features(取 `properties.adcode`/`properties.name`)+ `adcode→count` 生成 echarts 数据与最大值,缺失=0。
- echarts 追加 `use([MapChart, VisualMapComponent])`(2a 已引入 BarChart 等)。

---

## 3. 界面与交互

### 3.1 统计页子切换
`StatsView` 顶部加「排行 / 地图」分段(默认排行,保留 2a)。「排行」显示级别分段(省/市/区县)+ 柱状图;「地图」渲染 `ReturnMap`(自带下钻导航,隐藏级别分段)。汇总条两模式共用。

### 3.2 `ReturnMap`(`src/renderer/components/ReturnMap.tsx`)
- 状态:`stack: { adcode, level, name }[]`,初始 `[{ adcode: '100000', level: 'province', name: '全国' }]`;`current = stack[stack.length-1]`。
- 渲染流程(`current` 变化时):`loadGeo(current.adcode)` →(用 alive/token 守卫)→ `api.regionCounts(current.level)` → `echarts.registerMap(current.adcode, geo)` → `setOption`(`series.type='map'`、`map=current.adcode`、`data=mapData(...).rows`;`visualMap` 连续 0→max、浅→陶土色;`tooltip` 显示「{name}:{value} 单」)。
- **下钻**:点区域(echarts `click`)→ 若 `current.level==='province'` 进 city、`==='city'` 进 district、`==='district'` 最深不下钻;由被点 feature 的 adcode + name 入栈(下一级 `regionCounts` 级别相应为 city/district)。
- **面包屑**:渲染 `stack` 各级名,可点任意上级 → 截断 `stack` 回到该级;或「← 上一级」弹栈。
- 加载中「地图加载中…」;`loadGeo` 失败「地图数据缺失」(兜底)。
- 卸载 `dispose` + 移除 resize 监听;`current` 变化重新 `setOption` 并 `resize()`。

### 3.3 视觉
地图卡片圆角 `surface` + `shadow-card`;`visualMap` 陶土色阶;面包屑用 `btn-ghost`/`text-muted`;与整体一致。

---

## 4. 测试策略
- **纯函数(TDD)**:
  - `toAdcode`:省/市/区县 → 6 位 adcode(fixture 断言;含已 6 位的恒等情形)。
  - `mapData(features, counts)`:给若干 feature(含 adcode/name)+ counts 映射,断言 rows 的 name/value(缺失=0)与 max。
- **`loadGeo` 缓存**:用可注入的 importer 测同一 adcode 第二次命中缓存(真实文件存在性靠 dev/构建)。
- **`ReturnMap`**:echarts 需 canvas,不做渲染单测;靠纯函数 + dev 手验。
- **`gen-geo.mjs`**:运行后校验样本 adcode(全国/某省/某市)文件存在且为合法 GeoJSON。
- **dev 手验**:统计页「地图」;全国→省→市→区县下钻;面包屑返回;tooltip;无数据区域最浅;颜色与排行一致。

---

## 5. 风险与兜底
- `gen-geo.mjs` 依赖 DataV 在线(仅构建期):不可用则实现者报 BLOCKED;产物提交后运行时离线。
- 编码不匹配区域按 0 着色,不报错。
- 包体积显著增大(已确认接受)。

---

## 6. 明确不做(YAGNI)
- 下钻最深到区县(不做街道/乡镇)。
- 不做地图的时间/状态筛选、导出、自定义配色。
- 不改后端聚合(复用 `regionCounts`)。
- 没有 DataV 数据的区域按 0,不特殊处理。
