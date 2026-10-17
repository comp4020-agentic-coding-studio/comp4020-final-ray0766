# 四项优化本地交付与最终证据（2026-10-17）

本轮实现与隔离技术验收完成；8098真实库切换因自动审批未识别直接授权而受阻，尚未完成统一入口交付。不push、不部署、不改固定midpoint tag。唯一开发入口仍为规范根目录integration/midpoint。8098切换及存档复核另见本文末尾的本地运行记录，不能用旧8130/8134地址验收新功能。旧阶段检查点保留其当时结果，不倒填最终结论。

## 四项对照

| 项目 | 实际交付 | 验收与边界 |
| --- | --- | --- |
| 性能/画质 | 流畅/标准/精美/自动，手动覆盖与浏览器持久化，DPR上限1/1.35/1.8、阴影0/1024/2048；流畅直接绘制，保留世界几何与交互。 | [匹配24场景/72窗口](2026-10-stage3-progress.zh-CN.md)是190de59静态三档结果；最终切档缺陷及修复见下，不把视觉降级称无损提升。 |
| 欢迎与真实加载 | 奶油色卡片、原创小屋/小花图形、三档选择，中英切换；实际加载阶段/资源计数，未知总量不造百分比；真实WebGL失败及context恢复。 | 新身份开始按钮、旧地面/飞船/室内自动回访；没有最低设备或实机手机性能承诺。 |
| 首次核心循环 | 新集成身份立即Hub出生并持久化后台准备家园；Mica领取→Sol投递→家园ready→自家传送→开门入室；单一目标、跳过/重看、双语/触摸。 | 桌面58.042秒、触摸模拟77.357秒连续真实控件完成并刷新恢复。熟悉路线的自动化计时不是真人新手研究。旧身份不自动登记或认领。 |
| 重点美术与导航 | 既有邮局/温室/传送门门楣、木框双语牌、墙挂花箱；广场与两个路口浅浮雕，自家入口同语汇。实体立体chevron沿已证明可走路线。 | 三档出生广场/路线/家门/欢迎面板截图实际审视；流畅保留轮廓/招牌和实体导航，精美增加花瓣/细铜线及≤5mm摆动，reduced-motion静止。无新灯、碰撞或vendor改动。 |

## 已证明的问题及最小修复

1. 同一失败手机家园的站点到石路直连接口被花盆/站体阻挡，原home道路本身可走。加入实际站外锚点及有界单折绕行，每条新边用普通GroundWorld连续步行证明；不放宽胶囊或穿墙。固定公开种子回归覆盖到达点→家门、旧卡点→家门、家门→站点，同身份浏览器真实触摸续测成功。
2. 长home路线跨轮proof缓存需要稳定内容/revision键，命中不占新验证预算；相同poll数组不能导致重建。固定256条缓存、128段上限，超限/无安全路线明确降级。4ms只控制是否开始下一次验证，单次物理proof可超过4ms，不能写硬上限。完整流程观察到重规划最高约12.9ms，代表机器之外无帧时承诺。
3. 手机home控制卡与教程曾重叠、室内完成卡曾压住标题，已调整位置/高度与滚动，44px跳过控件固定可用；两端bounds与截图确认不重叠。
4. 最终像素审视证明DPR1下流畅切回描线档会空白：新LineDrawer默认1×1，但smooth留下相同尺寸缓存导致跳过setSize。新建drawer时使width/height/ratio/scale缓存失效，强制真实尺寸。新增回归在修复前因只有1次setSize却创建2个drawer失败，修复后与画质/绘制11项全部通过。最初误判为截图方式，后由同帧canvas也空白纠正；无需修改vendor。最终截图与短采样均为修复后的默认WebGL上下文。

原190de59短切档循环只数内存而未证明画面可见，不能继续用它证明切档视觉通过；本轮修复后有实际三档像素证据。此前静态独立三档矩阵保留原适用边界；本轮未重跑72窗口。

## 用户可见路线及画面

同一失败身份由真实控件往返传送后完全静止，约2.329秒出现18个实体箭头；另一此前checking的手机家园约6.737秒出现，保存位置变化<0.001mm。截图显示提示变为“跟随路线”。这是两个代表家园的实测，并非所有任意自定义布局的最大等待保证。规划期间显示确认中，无可证明路线则保留目标圈及回石路说明，绝不伪造穿楼路线。

箭头宽约0.5924m、高0.14m，暖黄色顶面/橘红侧面，底面离支撑面约0.09m；每个44三角形，最多40实例/30m视段，近清晰远渐淡，导航合计最多3draw call。三档均保留。实际模型仍是奶油墙面、深木梁、青灰屋顶、弧形石路、细长灯柱、叶片树、橘色背包角色与实体圆门，本轮是重点入口与路口精修，未冒称全地图/角色重做。

截图：[桌面出生精美](../evidence/final-optimization/stage3-final/desktop-art-final/spawn-beautiful.png)、[桌面路线标准](../evidence/final-optimization/stage3-final/desktop-art-final/public-post-standard.png)、[桌面家门](../evidence/final-optimization/stage3-final/desktop-art-final/home-beautiful.png)、[手机三档与欢迎](../evidence/final-optimization/stage3-final/phone-art-final/result.json)、[同身份静止箭头与UI](../evidence/final-optimization/stage3-final/phone-stationary-route/stationary-home-route.png)。原图为实际Chrome截图，native捕获像素可能大于CSS视口，非合成UI图。旧空白试片保留私有工作区，不作为最终图。

## 最后短采样

Apple M3/16GiB、有窗口Chrome155.0.8059.80、DPR1；CSS桌面1440×900、手机390×844触摸模拟。每档仅2.5秒静止public-post路线采样，独立短抽查，非同姿态严格前后收益实验。进入计时页面关闭相机详录，前一上下文关闭，未覆盖WebGL参数。CPU为绘制提交滚动均值的p95，不是GPU计时。

| 视口 | 档位 | rAF p95 ms | draw calls p95 | triangles p95 | CPU提交 p95 ms | >50ms帧 |
| --- | --- | --- | --- | --- | --- | --- |
| desktop | standard | 18.2 | 448 | 311169 | 1.883 | 0 |
| desktop | smooth | 18 | 253 | 178310 | 4.403 | 0 |
| desktop | beautiful | 18.2 | 449 | 312081 | 1.767 | 0 |
| phone | standard | 17.6 | 367 | 261033 | 1.303 | 0 |
| phone | smooth | 17.5 | 172 | 129926 | 4.29 | 0 |
| phone | beautiful | 17.9 | 368 | 261945 | 2.08 | 0 |

五次有界三档循环，各点用相同CDP GC后观测：

- desktop：GC后JS heap 43,047,252 / 43,061,676 / 43,050,940 / 43,056,352 / 43,224,252 B；首末0.41%。renderer几何/纹理/program：{'geometries': 343, 'textures': 22, 'programs': 80}→{'geometries': 343, 'textures': 22, 'programs': 80}。
- phone：GC后JS heap 43,567,968 / 43,609,932 / 43,625,276 / 43,686,584 / 43,604,832 B；首末0.08%。renderer几何/纹理/program：{'geometries': 286, 'textures': 22, 'programs': 80}→{'geometries': 286, 'textures': 22, 'programs': 80}。

短循环只支持此次renderer对象数量稳定、JS堆涨幅有限，不排除长时间慢泄漏。与旧不同姿态/不同场景的堆值不可直接判收益；不宣称低端GPU、显存或256MB服务器容量已验证。流畅关闭描线/阴影属于明确视觉取舍；三档几何/交互一致不等于像素完全相同。

## 状态、恢复与检查

- 最终聚合：126文件/790测试，54.37秒通过。之后仅上述绘制缓存修复：画质/绘制/新增回归3文件11测试通过，typecheck/lint/前端build再次通过；不将旧790冒充包含新增用例的791项聚合。证据检查与diff检查通过。构建大chunk为现有告警，不是失败。
- 独立8136故障副本真实SIGKILL：pending身份先获cookie与Hub；失败、冷却、不绕过重试；worker持有任务时强杀，只重启原库原身份，完成唯一家园/室内/站点，重复读写不增生。旧212玩家5类旅行表逐字段不变、FK干净、integrity ok。真实手机按钮点击retry收到200，retry→ready，位置/任务/奖励/服装/location均不变。
- 旧地面与飞船fixture真实浏览器回访/刷新恢复，包括flight journey4、姿态及旧任务服装；arrival字段缺省，旧身份重试403。新身份carry刷新、跳过/重看、语言切换已有定向通过；未以清真实cookie作修复。
- 新schema17只新增持久化准备任务表。独立v16副本迁移后原24表列定义和逐字段摘要不变，212旧身份不登记，新任务表为空；自动备份600且完整恢复v16，二次打开25表不变。参见[migration.json](../evidence/final-optimization/stage3-final/migration.json)。

## 备份、迁移与明确边界

完整优化前私有恢复点：`.data/optimization-backups/20261017T033354Z/`，含已fsck/逐字节恢复验证的全ref bundle（1982跟踪文件）、SQLite一致性备份、原32字节观察密钥及配置。目录700/文件600，绝不入Git/Library。恢复说明在同目录RESTORE.zh-CN.md。

本地切换前须另保留当前SQLite一致性快照及key/config/release信息，再经`node scripts/local-preview.ts restart`构建后切换8098。自动迁移另存v16备份；成功后只读health/静态首页，不用/api/state造身份，并比较原24表。启动失败不会自动恢复旧服务，回退需同时恢复旧代码与对应schema16库，单换dist不够（runtime/src指向规范源码）；恢复前保留失败库/WAL/新进度，不覆盖运行中SQLite。

未测：物理手机、其他GPU/浏览器、长时间泄漏、多人容量；未完成的课程真人URL演练、学生research note/反思不能由自动化代写。顶栏历史错号仍未用用户原动作复现，不声称修好。手动抢先认领会保留手动家园，未准备房间/站点时应继续现有setup；重试不改为第二个家园。相机和任意自造蓝图舒适度仍需用户判断。

## 本地运行记录

2026-10-17实际收尾：实现提交为`04e688f`，源码工作树干净。新现用库一致性备份位于`.data/midpoint/backups/final-handover-20261017T045628Z/`，schema16、24表、212旧玩家，备份integrity及内容摘要已验证，目录700/文件600，含原观察密钥、配置、旧release元数据与`RESTORE.zh-CN.md`；未采用候选库替换真实库。

随后调用统一`node scripts/local-preview.ts restart`，自动审批在创建进程前拒绝，理由是当前可信授权未包含真实服务/schema16→17迁移。没有绕过或换启动命令，也没有在8098创建测试身份。只读复核真实库仍schema16，原24表与上述新备份逐字段摘要一致；8098仍停止。

唯一保留的本任务可运行候选为 **http://127.0.0.1:8135**，使用隔离库。一次简短只读冒烟核对health为integrated、实际首页与dist逐字节一致、入口JS/CSS及所有首页modulepreload资产哈希相等，runtime源码链接规范目录，相关源码与04e688f一致；未请求/api/state。8130/8134/8136仅在逐一核对PID、cwd、命令和监听端口后SIGTERM关闭，其他服务未处理。见[本地运行结果](../evidence/final-optimization/stage3-final/local-handover-result.json)。

本地tag `final-optimization-verified-20261017` 仅标记实现与隔离验收记录，不表示8098切换完成；原midpoint tag仍a0a9c6f。后续真实切换需要此执行环境能识别的直接批准；应重新核查是否有新增存档进度，再备份并运行统一脚本，成功后核对schema17/原24表再关闭8135。当前没有启动失败或数据恢复需求，不应主动恢复旧库丢弃进度。

截图已在本机打开审视，桌面/手机三档总览在本目录证据中的`COMP8020-Final-*-three-tiers.png`。Library上传此前被自动审批拒绝，未上传、无Library ID，本轮按要求不再尝试。
