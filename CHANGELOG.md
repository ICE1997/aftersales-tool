# Changelog

## [0.4.0](https://github.com/ICE1997/aftersales-tool/compare/v0.3.0...v0.4.0) (2026-06-19)


### Features

* **ui:** add 发起对话 button — open the 拼多多 IM app to the order chat ([8a80ccb](https://github.com/ICE1997/aftersales-tool/commit/8a80ccbb88f21a63d135a7edf90efc7231e972d7))

## [0.3.0](https://github.com/ICE1997/aftersales-tool/compare/v0.2.5...v0.3.0) (2026-06-19)


### Features

* applied-time bucket aggregation with adaptive granularity ([2db6ce9](https://github.com/ICE1997/aftersales-tool/commit/2db6ce9513752c6f6e473c4b354d66e460445571))
* AppliedTimeBarChart echarts component ([f100c2b](https://github.com/ICE1997/aftersales-tool/commit/f100c2bc3bf6566c1835930ecd94e4681ab86a16))
* appliedTimeBarOption echarts builder ([dd7fea8](https://github.com/ICE1997/aftersales-tool/commit/dd7fea81a28746ef28ef0e5ad425496f38c69e06))
* bucket single-day ranges by hour in applied-time chart ([73d2adc](https://github.com/ICE1997/aftersales-tool/commit/73d2adcf40caffedcfa91e51c5eb42cd317b630a))
* collapsible AppliedTimePanel wiring chips, custom range and chart ([431e558](https://github.com/ICE1997/aftersales-tool/commit/431e558f19c90ed88d546f5f48ffb7dd1ff64067))
* date-preset chip row component ([78846e4](https://github.com/ICE1997/aftersales-tool/commit/78846e4825053baa46299f67734b636a4f7e3f69))
* date-preset ranges for aftersale applied-time chart ([08a7658](https://github.com/ICE1997/aftersales-tool/commit/08a7658707d8b5020bc13457f28c6624ead42297))
* embed applied-time distribution panel in tickets view, default today ([20d5586](https://github.com/ICE1997/aftersales-tool/commit/20d558689a673eafe775939cf9f3be30e83dfb5c))
* **enrich:** parseSheet + detectColumns + planEnrich core ([aedab5f](https://github.com/ICE1997/aftersales-tool/commit/aedab5fae48d1d8841f11cc8d982834513aed6cd))
* **enrich:** tickets:enrichRegion ipc + preload ([fdbec5d](https://github.com/ICE1997/aftersales-tool/commit/fdbec5d5549c921df4dfce66ac61be83533d45e7))
* **enrich:** 补充信息 button + result dialog ([8b31d87](https://github.com/ICE1997/aftersales-tool/commit/8b31d871a36fe16bd76736abb9982a9db6614359))
* **export:** default the exported zip filename to the aftersale number ([dfd17dc](https://github.com/ICE1997/aftersales-tool/commit/dfd17dc8473651455bf2d64d503a7db8342f810f))
* **export:** offer 打开位置 to reveal the export location after exporting ([fefcb1c](https://github.com/ICE1997/aftersales-tool/commit/fefcb1cf2cda30bb151600861c8ad95dac7bb4b4))
* **filter:** add 售后原因 filter facet ([0ec2f6a](https://github.com/ICE1997/aftersales-tool/commit/0ec2f6adf52085ce61f82aeb9b7997fc3027c3d7))
* **import:** rename button to 导入售后单; update status of existing tickets ([b167faf](https://github.com/ICE1997/aftersales-tool/commit/b167faf8aadd95a0eb0e35ff95b13b7da5f5fe4f))
* **materials:** add nameTaken and moveFile to MaterialRepo ([e34a578](https://github.com/ICE1997/aftersales-tool/commit/e34a578e19c2b2d5f8713988cd836d4af005ea31))
* **materials:** add shared path/name helpers, materialDir ([22618e7](https://github.com/ICE1997/aftersales-tool/commit/22618e7708eafa5c94b1a3766ab553792a727595))
* **materials:** copy absolute path of a material or directory ([1269465](https://github.com/ICE1997/aftersales-tool/commit/1269465dc94357384e22f30e2dbf575fca5cbfc8))
* **materials:** create files named after material name in one per-folder dir ([881605d](https://github.com/ICE1997/aftersales-tool/commit/881605d58a715cb657ee38a24e5b5bfec37d4b6b))
* **materials:** debounced fs.watch MaterialWatcher ([8d64db6](https://github.com/ICE1997/aftersales-tool/commit/8d64db65b341b5a582dc82dc349074b9a3675342))
* **materials:** drag files from the OS into the grid to add them ([76e9fd3](https://github.com/ICE1997/aftersales-tool/commit/76e9fd3bbbfe9986d4cb13c68c2a45347e62ce8c))
* **materials:** drag-to-move (files + folders) and selectable folders for export ([2d1d103](https://github.com/ICE1997/aftersales-tool/commit/2d1d1036a8327334b9105919deb35ad16fbbacbb))
* **materials:** filesystem-as-truth — wire FileTree/relPath through ipc, preload, renderer ([6337132](https://github.com/ICE1997/aftersales-tool/commit/63371321f77b4e3f76203766269e54cef49e4896))
* **materials:** FileTree service (scan + fs ops) ([237c884](https://github.com/ICE1997/aftersales-tool/commit/237c884eec15280da7f7ba1585ed352d999fa19c))
* **materials:** live fs.watch auto-refresh + manual 刷新 ([e51eaf9](https://github.com/ICE1997/aftersales-tool/commit/e51eaf9c1d064ec92baf5cd4624ee03083a393ba))
* **materials:** material-fs helpers to mirror logical folders to disk ([01c9b7d](https://github.com/ICE1997/aftersales-tool/commit/01c9b7deaa5a0f4228cde06fd0708b25c1cf2412))
* **materials:** mirror folder create/rename to disk + ensure root dir on open ([907dd52](https://github.com/ICE1997/aftersales-tool/commit/907dd5216c03bd4da72af5f58d46618a37be0cde))
* **materials:** move/clean files on disk when renaming or removing folders ([bb50ecd](https://github.com/ICE1997/aftersales-tool/commit/bb50ecd40bbb6d8e6f702740b55383b3960bb000))
* **materials:** open material directory in the OS file manager ([daf03dd](https://github.com/ICE1997/aftersales-tool/commit/daf03ddac01576223c88596ea905dbbc6c852226))
* **materials:** path-keyed lazy thumbnail cache ([d2f4013](https://github.com/ICE1997/aftersales-tool/commit/d2f4013a02fb7af9838cc4ac408205f6c4fddafb))
* **materials:** per-card hover actions — open dir / copy path ([aa039aa](https://github.com/ICE1997/aftersales-tool/commit/aa039aae261ce451dd959d2d2570081b15f4331d))
* **materials:** relocate file on disk when moving material between folders ([ae06518](https://github.com/ICE1997/aftersales-tool/commit/ae06518c7a95af1e5d295bd537266908fd87c347))
* **materials:** relPath-based Material model + meta helpers ([d63b90a](https://github.com/ICE1997/aftersales-tool/commit/d63b90a1c33ddf56f0fe718ee06937372b102d6b))
* **materials:** rename a material (edit its filename) ([3dcd86d](https://github.com/ICE1997/aftersales-tool/commit/3dcd86d72c067e91ce123ed5be89f5b9700e86c7))
* **materials:** require a material name in the new-material dialog ([7d35116](https://github.com/ICE1997/aftersales-tool/commit/7d35116c703e834528cc71eea610ae956657f98f))
* **materials:** selectable empty folders; consistent card hover actions ([3bc5f58](https://github.com/ICE1997/aftersales-tool/commit/3bc5f584806fee62c82a348f5ae7f4166244a54b))
* **transcode:** ipc + preload — run job, stream progress, cancel ([ada9e24](https://github.com/ICE1997/aftersales-tool/commit/ada9e24ed100de9b9cb53a6446848e3f745aa4dc))
* **transcode:** options type + pure ffmpeg arg builder & progress parsers ([ed88fdd](https://github.com/ICE1997/aftersales-tool/commit/ed88fdd3ba6e7a4d282068eab4d515bf6b0a2872))
* **transcode:** shared ffmpeg path + Transcoder service (progress + cancel) ([c2a8f77](https://github.com/ICE1997/aftersales-tool/commit/c2a8f771fdfb1e0327be27b8a5ea7dd0c1d2ae61))
* **transcode:** TranscodeDialog + toolbar queue with progress & cancel ([0bb25a3](https://github.com/ICE1997/aftersales-tool/commit/0bb25a3a2d5d8d179ec26d74ebaa58b7f9459ffb))
* **ui:** add chat/appeal/compensation quick-jump buttons to order detail ([614a995](https://github.com/ICE1997/aftersales-tool/commit/614a995c265b2d648d3c59248863f7dd12f9854d))
* **ui:** add chat/appeal/compensation quick-jump buttons to order detail ([c857b87](https://github.com/ICE1997/aftersales-tool/commit/c857b8717f3957110d20967b735378db635a03df))
* **ui:** consolidate stats below the filters; add 区域分布 sub-tab ([686f8c3](https://github.com/ICE1997/aftersales-tool/commit/686f8c34e1f4a4b0c3d83faa70f3a9dc67b6ff5d))
* **ui:** in-place folder creation with inline validation ([c1b549e](https://github.com/ICE1997/aftersales-tool/commit/c1b549eb0745c41f1dda8a6e4732222556676ecc))
* **ui:** split tickets list and applied-time chart into sub-tabs ([c54d4ea](https://github.com/ICE1997/aftersales-tool/commit/c54d4ea11bb2a876dc97e26390b51302e58d1cd9))
* **ui:** themed date pickers via react-day-picker ([e4fe913](https://github.com/ICE1997/aftersales-tool/commit/e4fe9134c1f4f0fa57ceafe65823849e43d351fb))
* **ui:** 设置/关于 in the native menu; in-app About dialog (author Kiza) ([c10fe74](https://github.com/ICE1997/aftersales-tool/commit/c10fe742f030eeb6114b8daa9b4852f957f94356))


### Bug Fixes

* drop duplicate 申请时间 date control from applied-time panel ([b53e0fc](https://github.com/ICE1997/aftersales-tool/commit/b53e0fc57fd1fcc67926a057dfb411271e11e50d))
* **enrich:** count resolved rows for withRegion; clear stale error on success ([e09c73f](https://github.com/ICE1997/aftersales-tool/commit/e09c73f1898bc4dacc35d3f6d077ad72f3812f0e))
* harden folder-name validation and guard rename path collisions ([573bf29](https://github.com/ICE1997/aftersales-tool/commit/573bf29b98b19fc9cf51d2a411a537ee32f1f221))
* **materials:** broadcast watch events to all windows; preserve selection on external refresh ([046d56b](https://github.com/ICE1997/aftersales-tool/commit/046d56b334c08ba5ee2d7b0f4e48eeb9157ea4b5))
* **materials:** drop unused import in FileTree ([933c6be](https://github.com/ICE1997/aftersales-tool/commit/933c6be7efd093774cf13003675df1f3c8d88d15))
* **materials:** hide the folder select checkbox when it has no materials ([e0530a7](https://github.com/ICE1997/aftersales-tool/commit/e0530a70c0c8b84694f4681ca87c453a40d308e8))
* **materials:** make the whole grid area a file-drop target (min-h-full) ([f219484](https://github.com/ICE1997/aftersales-tool/commit/f219484ce8472739554b1e37e92f7ccd5fd0c784))
* **materials:** use the entered name as the created file's name ([0ab3400](https://github.com/ICE1997/aftersales-tool/commit/0ab340054d8b0945046f6238434a7918000d6fec))
* **region:** drop greedy prefix match; add 、 separator ([2e4a523](https://github.com/ICE1997/aftersales-tool/commit/2e4a523e926269e4cfb5b29eeac7b5033effe834))
* **thumbnails:** resolve ffmpeg path to app.asar.unpacked in packaged builds ([44841a7](https://github.com/ICE1997/aftersales-tool/commit/44841a731bfd37c606e1bcffc5ff8121e91b1b90))
* **transcode:** sanitize output name, guard re-entrancy, clamp CRF ([8942e98](https://github.com/ICE1997/aftersales-tool/commit/8942e9810281a79ab18409f5f4c6c3040aca58b1))
* **ui:** don't apply an applied-time filter by default ([86a5329](https://github.com/ICE1997/aftersales-tool/commit/86a5329f9eb08381e6e027bbf0560e8e4271de99))
* **ui:** keep current view after a renderer reload ([fb16506](https://github.com/ICE1997/aftersales-tool/commit/fb1650649d9422276564cca985bdc5cd5d64fc43))
* **ui:** make card overlay controls legible on white thumbnails ([1480664](https://github.com/ICE1997/aftersales-tool/commit/1480664ce087ebb7e23f5c67128f3a28f0441367))
* use functional setFilter updater in applied-time onRangeChange ([ea8a7d6](https://github.com/ICE1997/aftersales-tool/commit/ea8a7d6fd081e580edb9bab060d6ddf6e35535c5))

## [0.2.5](https://github.com/ICE1997/aftersales-tool/compare/v0.2.4...v0.2.5) (2026-06-17)


### Bug Fixes

* **search:** substring search across all text fields (LIKE) ([cbacded](https://github.com/ICE1997/aftersales-tool/commit/cbacded7951401a952519c256a01ed1e28437dd7))
* **tickets:** preserve list position & selection on detail return; don't navigate on text-select ([b98da84](https://github.com/ICE1997/aftersales-tool/commit/b98da8477c08d978694f8d4ae2b70299751476d5))


### Miscellaneous Chores

* release 0.2.5 ([3ea24e2](https://github.com/ICE1997/aftersales-tool/commit/3ea24e209445fffdbc4bc5bd78010f3948f63a04))

## [0.2.4](https://github.com/ICE1997/aftersales-tool/compare/v0.2.3...v0.2.4) (2026-06-17)


### Miscellaneous Chores

* release 0.2.4 ([37cdbc7](https://github.com/ICE1997/aftersales-tool/commit/37cdbc7d93bc2a9d34ebec287b8c51e2be240c73))
