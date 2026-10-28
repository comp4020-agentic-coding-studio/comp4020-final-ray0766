# Little Worlds：历史问题与本轮修复总结

> 历史快照：本清单记录下述基线阶段的核查，不是当前Final未完成项目列表。P05的课程交付随后已完成；后续修复、发布及超过34小时回访见[发布总览](releases/final-2026-10.md)。旧失败、当时的待验项与真实未测范围保留，不能将后来完成的结果倒填为当时已验证。

核查基线：`6d19175`，分支 `final/local-readiness-20261016`。本文件所在提交为本轮修复版本。

本清单区分运行中的主项目、旧工作树、不可变资源快照和独立模型模块。历史失败记录保留，不把后来通过的结果倒填到旧记录，也不把源模块的失败直接当作当前游戏故障。本轮不改镜头、地图尺寸、存档协议或发布配置，不推送部署。

## 本轮已证明并修复

| 编号 | 问题与复现 | 最小修复 | 证据与边界 |
| --- | --- | --- | --- |
| F01 | 室内点击“布置房间”并改颜色后，刷新离页事件没有被取消；保存失败或等待确认时同样没有保护。蓝图、船坞已有离页保护，房间遗漏了。 | 仅在室内存在未保存布置时拦截 `beforeunload`；保存成功或明确取消后解除；组件释放时移除监听。不自动提交草稿，不改房间/门/镜头。 | [真实控件回归](../spec/panel-loading.test.ts)：新用例在修复前 `expected false to be true`，修复后整个文件 16 项通过，覆盖失败、等待、确认、取消和释放。原生浏览器弹窗是否展示仍受浏览器策略影响；这不是手机强制结束进程的恢复机制。 |
| F02 | `docs/player-guide.md` 仍把新访客描述成“从公共港飞出去认领”，并写 C10 日志尚未完成；这是旧阶段快照，与当前新身份自动获家园、`6d19175` 日志实现不一致。 | 增加明确的当前使用说明，并把原说明整体标为历史快照；保留旧内容供追溯。 | [当前指南](player-guide.md)、[状态创建](../src/server/store.ts)、[日志决定](adr/0009-business-observation.md)。只纠正现状说明，不改已批准 README、PROCESS 或学生反思。 |

## 已修复的历史问题：本轮不重复重做

| 编号 | 历史现象 | 后续修复或当前依据 | 本轮验证边界 |
| --- | --- | --- | --- |
| H01 | 贴墙压缩镜头时朝天。 | 当前使用 `legacyOutdoorCameraPose` / `clipLegacyCameraBoom`，保留 4f0d596 路线和室内 `IndoorFollowRooms` + `SimpleFollowCameraRig`；压缩时保持视线方向。[交接镜头审计](integration/candidate-handoff.md)、[现用相机回归](../spec/legacy-ground-camera.test.ts)。 | 没有恢复 v11，没有重设计镜头；舒适度仍由用户亲测。 |
| H02 | 低速斜穿门框/台阶门槛或手机摇杆贴楼梯栏杆时卡住。 | `862fa4c` 使用有界向外滑动，保持输入距离、胶囊体、速度和碰撞规则。[运动复查](evidence/movement-review/verification.md)、`spec/door-step.test.ts`。 | 历史桌面/触控回放通过，不等于任意用户蓝图都无碰撞。 |
| H03 | 建筑/道路/径向坐标上的穿墙、异常跳高、地面支撑与保存高度不一致。 | 共享 `GroundWorld`、服务端路径重放和独立高度；径向墙跳修复见 `29bc9f6`，后续街道分级和门洞检查见 [物理证据](evidence/physics-v1/verification.md)、[v10 汇总](integration/village-world-v10.md)、[主星球规划](integration/planned-main-planet-v12.md)。 | 不改已保存建筑变换；历史代表路线的通过不是全几何证明。 |
| H04 | 模型门心绕序、控制台碰撞高约 3 cm、台阶坡道盒、梁柱约 10 mm 缝等。 | 历史交接报告这些源模块问题已修；主项目通过固定来源快照和独立物理适配集成，见 [R3](integration/r3.md)、[LOD/契约证据](evidence/lod-r4/verification.md)、[资源库存边界](integration/workshop-module-audit.md)。 | 本轮未逐项重放源模块测试，不能由“源模块报告已修”推导所有主场景都已验证；不去无关模块仓库搬修。 |
| H05 | 传送站不知站哪、登机圈与操作提示不明确。 | 站点交互区、星港塔、登机圈及控制台已接入；目的地仅家园↔公共港。[传送站记录](integration/teleport-stations.md)、[服务端检查](../src/server/teleport.ts)。 | 登机和传送仍要求服务端保存的接近位置；不恢复全局起飞或任意星球传送。 |
| H06 | 访客能否写他人建筑、进入私人房间或读历史；重复/过期旅行请求。 | 服务端拥有权、版本、旅程/序号、visitEpoch 和事务检查；[双会话权限记录](evidence/crit9-realtime/verification.md)、`spec/home-owner-access.test.ts`、`spec/teleport-station.test.ts`。 | 访客可操作近处的共享外门是现有规则，不能因此进入或编辑房间；不把门的公开开关当越权。 |
| H07 | 建家、首次传送的重计算阻塞其他玩家。 | `50d8741` 后用有界、去重 worker 队列；`d898047` 失败时返回 503 和退避，禁止回主线程同步补算；提交前再校验、事务落盘。[C9 决定](adr/0008-multiplayer-preparation.md)。 | 保留队列、去重和事务；发起者仍可能等待，不能把单次响应改善当大规模容量保证。 |
| H08 | 旧身份无家园时，公共传送门没有原因或下一步说明。 | `6d19175` 增加双语说明，复用“找到飞船”，沿既有飞行→降落→认领→建造路径；不自动改旧身份。[回归](../spec/teleport-guidance.test.ts)。 | 与 H09 不是同一问题；刷新不会给旧身份自动分配家园。 |
| H09 | 已有家园的旧主人尚没有传送站。 | 主人首次站在家园时准备补站；有容量/选址障碍时给出说明，手动预览建站；拆掉的站不会偷偷重建。[传送站记录](integration/teleport-stations.md)、`spec/teleport-station.test.ts`。 | 已认领星球不等于已经设置了可进入的小屋；必要时用“Set up my home”。 |
| H10 | 尚有新移动或请求等待时显示 “Progress saved”；旧确认覆盖更新的待保存状态。 | `6d19175` 用地面/飞行批次凭据区分 pending、in-flight、ack；恢复废弃旧凭据。[保存跟踪](../src/client/save-progress.ts)、`spec/flight-save-feedback.test.ts`。 | 未改保存协议或 350 ms 定时器；未确认移动仍可能丢失。 |
| H11 | 保存蓝图、放置预览、保存船设计之间的反馈和丢稿风险。 | 历史 `f6222e4`、`bcc6986` 修复保存/回滚与建造输入边界；蓝图保存与放置明确分开，船坞保留失败草稿。[保存/UX 集成](evidence/save-ux-integration/verification.md)、[飞船验证](evidence/ships/verification.md)。 | “Save blueprint” 只存私有库，仍要放置或应用才能改变世界；F01 补齐的是房间离页保护。 |
| H12 | `harbour-resources` 报 `document is not defined`。 | `7cf5325` 补正确 canvas 测试环境；随后真正暴露的重复释放由 `c0df8ea` 修复，而非跳过所有权检查。[后续验证](evidence/crit9-realtime/verification.md)。 | 早期文件写“仍失败”是当时结果，不能覆盖之后的修复。 |
| H13 | `home-paths` 慢/超时，部分重测试在 CI 机器上耗时超过默认上限。 | `170ab72` 用精确键共享拟合缓存解决反复 refit；`4fb7e11`、`ff0cd01` 按实际 CI 耗时调整测试预算。[C9 后续记录](evidence/crit9-realtime/verification.md)。 | 不提高运行时视觉/安全/性能预算，也不因一个测试慢就认定整个游戏卡顿。 |
| H14 | arm64 与 x86-64 重生成道路台账有最后一位浮点差异。 | `bccc59d` 要求键/类型/标志/数量相同，数值容差 1e-12；1e-9 位移等故障仍失败。 | 这是跨 CPU 数值比较修复，不是放松地形/碰撞标准。 |
| H15 | 旧 README 状态、链接和文档词数与已发布版本不一致。 | `4897412` 重写、`cad0371` 记录发布、`60d54ae` 修正 README 状态和 GitHub 链接；本轮 F02 另处理早期 player guide。 | 历史 evidence 和 handoff 保留当时结果，并由本清单指出后续结论；不伪造或重写个人反思。 |
| H16 | 发布预检抢占资源、命令合并保留 `sleep infinity`、超时、镜像 tag/digest 不一致、仓库可用性竞态、自动停机后没有启动。 | 对应修复及恢复过程见 [发布事故时间线](evidence/crit9-realtime/verification.md)：备份式预检、精确镜像、重试、明确启动和恢复流程；最终 `d807bcf` 成功。 | 本轮只读检查 `.github/workflows`、Dockerfile 和 fly.toml，没有运行生产命令或更改部署配置。 |
| H17 | 第二位新玩家到达时，小机器无 swap 导致内存抖动/服务失去响应。 | `8193418` 加 512 MB swap，保留课程机器和卷；后续公开双会话检查见同一[发布记录](evidence/crit9-realtime/verification.md)。 | 仓库记录的成功不是本轮生产复测或无限负载承诺。 |
| H18 | C10 缺少可区分“谁做了什么”的持续服务端业务日志。 | `6d19175` 已加独立匿名标识、允许字段、结果/原因、采样、2×1 MiB 轮转及 stdout。[ADR 0009](adr/0009-business-observation.md)。 | 日志 key 不是认证凭据；日志会轮转，并非无限审计档案。真人演练尚不能由自动化代替。 |

## 仍存在（已证实且尚未修复）

本轮没有另外确认且尚未处理的运行时缺陷；F01/F02 已修。下面的待复现、未测项目和接受限制不冒充已证明故障，也不因此宣称项目零 bug。

## 待复现或待用户验收

| 编号 | 现象/风险 | 当前判断及下一步 |
| --- | --- | --- |
| P01 | 顶栏显示 Little world 13，实际认为在 12。 | 本轮新建隔离身份，真实 Chrome 分别恢复到 12/13：服务端 currentPlanet/player.planetId、顶栏、暂停菜单均一致，均有 draw calls；见 [定向记录](evidence/final-bug-audit/planet-label-probe.json)。未复现，未改编号或存档。这不是用户原始飞行/传送过程的复演；若再出现，需要当时 URL、操作顺序、顶栏/Atlas 截图和相应保存响应。 |
| P02 | 飞船手机亮度的旧基线失败。 | 历史线索指向旧浏览器/模块基线；本轮没有同版本、同场景、同曝光的当前失败证据，不盲目改灯光/材质或降低阈值。用户在新预览的手机尺寸及真实设备判断；[飞船证据](evidence/ships/verification.md)与[LOD 证据](evidence/lod-r4/verification.md)明确源模块/主场景的区别。 |
| P03 | 任意新造建筑、门洞、屋顶、路缘仍可能有碰撞或遮挡。 | 已修记录覆盖代表样本，不构成全空间证明。遇到新场景应保存具体蓝图/坐标和动作再定向修，不重做已验收镜头，不降低胶囊或放宽穿墙。 |
| P04 | 物理手机帧率、GPU/显存、长时间泄漏及多人容量。 | 未充分测量，不是已经证实的 bug。旧源模块 251,369 > 250,000 三角形或旧满载 845/722 draw calls 只能说明各自样本；不能直接套到现用版本。 |
| P05 | C10 真人演练、批判性 research note、Crit 10 反思。 | 属于未完成的课程交付，不是运行时缺陷。两位同学必须仅凭 URL 使用，作者据日志说明；不编造体验、反思或研究论证。 |

## 接受的边界与不应重复“修复”的测试问题

- 匿名 cookie 不是跨设备账号。清 cookie、换浏览器/设备会失去原身份入口；没有账户恢复。不能以重置真实 cookie 的方式“修复”拥有权。
- 刷新只恢复服务端已确认状态；保存中的移动、未保存蓝图/放置/船设计/房间草稿不等于已落盘。原生离页提示是保护，不是自动保存或崩溃恢复。
- 当前 [`vitest.config.ts`](../vitest.config.ts) 排除 **20 个 spec 文件**，不是“20 个已证实运行功能 bug”。历史列出过其中 9 个失败文件；v11 rig/cutaway/certification 不在现用路线，一份旧极点回放超过 20 分钟。本轮不运行它们、也不删它们换全绿。
- 单位向量误当米、用隐藏 IAB 的时间测帧率、自动驾驶绕路失败、拿错 fixture 的建筑、测试环境缺 DOM、人工降 schema 而表结构没同步等，需先判定驱动/基线是否有效。[物理证据](evidence/physics-v1/verification.md)、[展示驱动记录](evidence/presentation-adapter/verification.md)、`76e95f0`、[双语基线对照](integration/bilingual.md)保留区别；不改生产规则迎合无效测试。
- bundle 大小告警是优化机会，不能写成构建失败；手机视口模拟不等于真实手机性能。
- 已有家园首次补站、旧身份没有家园、新建身份自动获家园、保存蓝图后另行放置，是四个不同状态，排查时不能混成一个传送/建造故障。

## 本轮验证与后续

本轮复现/修复、最终 aggregate、预览更新和未执行项统一记在[验证记录](evidence/final-bug-audit/verification.md)。没有更多经本轮定向证明而尚未修复的运行时缺陷，并不等同“零 bug”。

用户亲测优先：F01 房间保存前/后刷新提示；P01 原始错名操作；门框/台阶实际手感和贴墙镜头；手机亮度与可读性。再次出现时只修可定位的具体问题。
