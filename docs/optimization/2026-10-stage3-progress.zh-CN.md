# 匹配画质比较与阶段三代码进度

后续实现、DPR1切档修复与最终结果见[最终交付证据](2026-10-final-delivery.zh-CN.md)。本文保留历史状态。

这是阶段检查点，**不是最终交付**。性能比较针对第二阶段190de59的冻结前端候选，基线45584f8；当前阶段三工作树代码不在这组性能结果中。未push/部署、未启动真实8098。真实存档只读校验仍为schema16，24张业务表与优化前备份内容及行数一致；新增schema17只写入源码及隔离测试副本，未迁移真实库。

## 有限匹配比较已完成

同一隔离身份/家园、固定姿态、Apple M3/16GiB、有窗口Chrome155.0.8059.80、ANGLE Metal。桌面1920×1080、手机视口390×844触摸模拟，DPR1；不是实机手机。前测6场景+候选三档各6场景，共24场景，每场景3×2.5秒稳定采样（72个窗口）。等待真实body加载结束、欢迎完成、飞行HUD position且departure结束；原过早就绪试跑仍保留在上一检查点，不混入本比较。全部结果pageerror=0、稳定窗口>50ms帧=0。

| 场景 | 原版draw calls | 标准 | 流畅 | 精美 |
| --- | --- | --- | --- | --- |
| 桌面 hub | 484 | 484 | 288 | 484 |
| 桌面 room | 177 | 177 | 90 | 177 |
| 桌面 flight | 24 | 24 | 21 | 24 |
| 手机视口 hub | 326–332 | 326–332 | 133–136 | 326–332 |
| 手机视口 room | 166 | 166 | 79 | 166 |
| 手机视口 flight | 19 | 19 | 16 | 19 |

流畅在相同桌面Hub由484降到288（约40.5%），室内177→90（约49.2%），飞行24→21；手机Hub332–326→136–133。这是关闭额外屏幕描线/阴影后的实际绘制成本减少，伴随明确视觉取舍：不再有该描线和阴影；**不是相同画面的无损性能提升**。相同世界几何、控制和碰撞保持。DPR1时三档画布像素相同，精美/标准主要差在阴影贴图；高DPR像素上限1/1.35/1.8已有单测，尚未做这轮DPR2实测。

所有稳定窗口rAF p95：原版17.8–18.7ms，标准16.8–18.5ms，流畅16.8–18.6ms，精美16.8–18.7ms。已经接近显示刷新节奏，不能由这些波动宣称FPS大幅提升。CPU提交指标不是GPU计时。加载总体同量级，不能笼统声称更快；飞行冷加载仍包括登船/起飞流程。各次冷/热耗时及所有窗口见[前测](../evidence/final-optimization/matched-quality/before-standard/result.json)、[标准](../evidence/final-optimization/matched-quality/after-standard/result.json)、[流畅](../evidence/final-optimization/matched-quality/after-smooth/result.json)、[精美](../evidence/final-optimization/matched-quality/after-beautiful/result.json)。

## 短内存循环

基线做4次出门→进门；候选做4次出门→流畅/精美/标准→进门。首个循环预热后再观察3次重复，均以相同CDP强制GC方法读取JS heap和GL对象计数。菜单在室内不可见，最初驱动点击隐藏菜单超时；修正为真实出门后切档再入室，未更改产品契约。失败是测试驱动错误，未作产品回归判定。

- before-standard：预热后四个观测点JS heap为18,538,548 / 18,782,796 / 18,886,064 / 19,027,820 B；首末变化2.64%。GL计数四点均为{'buffers': 863, 'textures': 27, 'framebuffers': 15, 'renderbuffers': 8, 'programs': 55}。
- after-standard：预热后四个观测点JS heap为19,195,820 / 19,554,828 / 19,624,292 / 19,710,048 B；首末变化2.68%。GL计数四点均为{'buffers': 863, 'textures': 27, 'framebuffers': 15, 'renderbuffers': 8, 'programs': 69}。

候选预热后的GL buffer/texture/framebuffer/renderbuffer/program数量稳定；shader program较基线多14是切换档位后保留的编译变体。两者JS堆均有小幅单调增长，候选末值约19.71MB、基线19.03MB，差约3.6%；**短循环不足以排除慢泄漏，不能称内存验收全绿**。后续只需定位该小幅增长或更长的有界重复，不反复扩大整套浏览器测试。RSS结束快照：隔离基线40592KiB、候选100080KiB，CPU均0.0%；进程经历不同预热且非峰值，不能把该快照当服务内存优化证明。

## 阶段三代码已落盘并接线，尚待功能测试

- 新增`arrival-homes.ts`持久化后台队列与schema17任务表；HTTP新integrated身份立即Hub/SPAWN+cookie，生成家园/站点不等待首响应。任务去重、失败冷却/显式重试、重启续跑、站失败不重建房屋，ready要求房屋和站真实可用。旧身份不登记、不自动认领，后台不移动玩家。`POST /api/arrival/retry`只操作当前身份自身任务。
- 新增`tutorial.ts/css`，main已接入单目标Mica领取→Sol投递→实际家园ready→Hub gate→自家门→服务端确认入室，跳过、重看、中断恢复、中英及键鼠/触摸。只依确认的quest/ownership/location推进，不重置任务、位置或奖励。旧身份继续实际飞行/认领/建造说明；新pending身份的门提示不会误称尚未认领。
- 新增`tutorial-navigation.ts`和`tutorial-route.ts`，复用真实v15道路，最多40箭头/30m路线/1目标圈。新连接使用普通物理回放证明，固定GPU缓冲，按场景revision失效，贴当前support。单次物理proof最长8m/.06m步，4ms预算只控制是否再发下一次，尚未证明单次proof<4ms。
- 新增`village-polish.ts`：既有入口门楣/木框双语牌/悬挂花饰、广场和两个路口浅浮雕，最多3个draw call，精美附加微小花瓣细节，reduced-motion静态。不改vendor、镜头、碰撞或存档模型。实际美术与完整路线尚未在浏览器验收。

当前整个工作树**typecheck通过**，git diff --check通过。本轮新增server/tutorial/navigation等功能spec已编写，**尚未运行**，也未build阶段三或跑完整核心循环。上一阶段40/40不能当作这轮新功能已通过。

已发现并正在修复导航缓存集成风险：长home路线超过每轮6次proof时需跨轮累计；缓存命中不能消耗新proof预算。另Colony每秒poll会产生内容相同的新routes数组，不能只按数组引用清缓存，否则跨轮永远重来。代理正补稳定内容签名、长路线与revision失效用例，下一轮先检查这部分最终落盘，再做定向测试。单次连接验证的耗时、真实SPAWN→Mica→Sol→gate通路、实际家园station→door及人工抢先认领时的教程说明仍待验证。

## 下一轮优先顺序

1. 审核最终导航缓存修补，运行新arrival/tutorial/navigation/gate的定向测试，修复实际失败；新的HTTP首访用例必须指向阶段三隔离构建，不能对8130旧基线误跑。
2. 单次构建/启动新隔离候选（不要更新真实8098），验证首响应、后台完成、完整真实控制≤5分钟路线、刷新/中断/跳过重看/语言/触摸/飞船旧存档，记录真实阅读时间边界。
3. 完成重点美术/路线视觉、阶段三新增绘制成本与proof耗时验证；四项完成后只统一跑一次aggregate及授权浏览器验收，再统一交付。仍需用户另行授权才push/部署。

本轮只提交本文和脱敏性能证据。阶段三源码保留为**未提交工作树**，不要reset/clean或让其他任务覆盖。基线8130和第二阶段候选8134继续保留；当前源码已不同于其冻结dist，不能用这两个地址验收阶段三。
