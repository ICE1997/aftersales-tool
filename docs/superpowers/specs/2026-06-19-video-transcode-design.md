# 视频转码 — 设计

> 状态:待评审。日期 2026-06-19。

## 目标

给视频材料增加**转码**,主要为**上传拼多多做准备**:转成兼容格式(默认 H.264 mp4)、压缩到更小体积、支持格式转换(mov/HEVC/… → 目标格式)。附带好处:H.264 输出在应用内/Windows 也能正常预览。

复用已有的 `ffmpeg-static`(打包路径已修为 `app.asar.unpacked`,见 `Thumbnailer` 的 `FFMPEG`)。

## 行为决策(已拍板)

- **输出**:**生成新文件、保留原视频**(非破坏性)。新文件落在原视频**同目录**,文件名默认派生、可改,重名自动去重。文件系统即真相 —— 新文件就是一个普通材料,转完由 watcher 自动刷新出现。
- **触发**:**手动**。选中含视频的材料 → 工具栏「转码」→ **参数对话框**。一套参数应用到所选的全部视频,**顺序排队**逐个转。
- **不做**:时长裁剪/剪辑、转码替换原文件、导入时自动转码、全局队列面板。

## 转码对话框(高自由度可调)

设计原则:**给用户最大自由度** —— 关键参数都可改,同时有合理默认,新手直接用默认也能出可上传的 mp4。

| 参数 | 选项 / 输入 | 默认 |
|---|---|---|
| 输出格式 | 下拉(容器·编码):`mp4·H.264`(拼多多兼容+可预览)/ `mp4·H.265` / `mov·H.264` / `mov·H.265` / `webm·VP9` / `mkv·H.264` / `mkv·H.265` | mp4·H.264 |
| 分辨率 | 原始 / 1080p / 720p / 480p / **自定义**(填长边像素,或 宽×高);只缩不放、保持比例、偶数化(长边预设=1920/1280/854) | 原始 |
| 画质模式(二选一) | **质量(CRF)**:数值输入(0–51,越小越清越大;默认随编码 x264=23/x265=28/vp9=33) ‖ **目标码率**:kbps 输入(如 4000) | 质量(CRF) |
| 帧率 | 原始 / 60 / 30 / 24 / **自定义** fps | 原始 |
| 音频 | 重编码(mp4/mov→AAC、webm→Opus) / **保留原音轨(copy)** / **去掉音频** | 重编码 |
| 输出文件名 | 文本(默认派生,如 `原名-720p`),同名去重 | 派生 |
| 高级:附加 ffmpeg 参数(默认折叠) | 文本,原样按空格切分追加到命令(空=不影响);带"高级/后果自负"提示 | 空 |

- 选 H.265 / webm / mkv 时对话框给一行兼容性提示(避免又转出 Windows 播不了 / 拼多多不收的)。
- 默认(mp4·H.264 + 原始分辨率 + CRF 23 + 原始帧率 + 重编码音频)= 一键出可上传可预览的 mp4。

## 架构 / 数据流

- **`Transcoder` 服务(主进程,新)**:用 `FFMPEG` 路径跑 ffmpeg。`transcode(srcAbs, destAbs, opts, onProgress, signal): Promise<void>`,以 `signal`(AbortSignal)支持取消(杀进程)。
- **纯函数(可单测,不跑 ffmpeg)**:
  - `buildTranscodeArgs(srcAbs, destAbs, opts): string[]` —— 由参数拼 ffmpeg 参数数组:
    - 编码 `-c:v libx264 / libx265 / libvpx-vp9`;
    - 画质模式:CRF → `-crf N`(vp9 再加 `-b:v 0`);码率 → `-b:v {kbps}k`;
    - 分辨率(非"原始"):`-vf scale=...:force_original_aspect_ratio=decrease` + 偶数化(自定义=按填的长边或宽×高);
    - 帧率(非"原始"):`-r {fps}`;
    - 音频:重编码 `-c:a aac`/`libopus` ‖ 保留 `-c:a copy` ‖ 去掉 `-an`;
    - mp4/mov 加 `-movflags +faststart`;
    - 末尾追加"附加 ffmpeg 参数"(按空格切分;空则忽略)。
  - `parseDurationMs(stderrChunk): number | null` 与 `parseProgressMs(stderrChunk): number | null` —— 从 ffmpeg stderr 解析 `Duration:` 与 `time=`,百分比 = `progressMs / durationMs`(0–100,封顶 100)。
- **IPC**:
  - `materials:transcode(no, relPath, opts) -> Material` —— 计算目标文件名(同目录、去重)、启动 ffmpeg、完成后返回新材料;过程中通过 `transcode:progress` 事件推 `{ relPath, percent }`。
  - `materials:cancelTranscode(relPath)` —— 取消当前任务(杀进程、删半成品)。
- **输出落盘**:目标绝对路径 = 原视频同目录 + 输出文件名 + 目标扩展名;写入后即普通材料。
- **预加载**:`transcodeMaterial(no, relPath, opts)`、`cancelTranscode(relPath)`、`onTranscodeProgress(cb)`(事件订阅,返回退订函数,与 `onMenu`/`onMaterialsChanged` 同款)。

## 交互

- 工具栏「转码」仅当**选中包含视频**时可用;打开对话框,确认后**顺序队列**逐个转。
- 进度:对话框显示进度条;批量显示 `第 N/总数 · 当前文件名 · %`。
- **取消**:杀当前 ffmpeg、删半成品、停止后续队列。
- 完成:提示「已生成 N 个」;失败:抓 ffmpeg stderr 尾部 → 提示「转码失败:<原因>」,继续/中止后续由实现决定(默认:记录失败、继续队列)。
- 选中里的非视频(图片/文件夹)忽略。

## 错误 / 边界

- 输入无法解码 / ffmpeg 非零退出 → 失败提示,清理半成品。
- 取消 → 不留半成品文件。
- 目标文件名与现有冲突 → 去重(`-1`、`-2`…)。
- ffmpeg 不可用(路径解析失败)→ 提示「转码不可用」。

## 测试

- 单测(纯、快):`buildTranscodeArgs`(覆盖 各编码 / CRF vs 码率 / 原始与自定义分辨率 / 帧率 / 三种音频模式 / 附加参数追加 / mp4 faststart)、`parseDurationMs`/`parseProgressMs`(样例 stderr 行 → 毫秒/百分比)、文件名去重。
- 集成(可选,1 个):用 ffmpeg 生成一段极短测试视频,跑一次真实转码,断言输出文件存在且可被 ffmpeg 读取。

## 不做(YAGNI)

- 剪辑/裁剪、替换原文件、导入自动转码、全局转码队列面板、转码结果体积预估、ffprobe(时长从 ffmpeg stderr 解析)。
