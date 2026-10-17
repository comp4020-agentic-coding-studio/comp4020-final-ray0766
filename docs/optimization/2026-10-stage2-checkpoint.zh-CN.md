# 第二阶段本地检查点：画质与欢迎加载

状态：**实现检查点，不是四项优化最终交付；性能与完整体验尚未验收。** 开发基点12d1bc1，integration/midpoint。仅本地提交；没有push、部署或重启真实8098服务。固定midpoint-integrated-v1仍为a0a9c6f。真实存档未写入：只读重算24张业务表的行数及内容摘要，与20261017T033354Z私有恢复点完全一致，见[数据保护校验](../evidence/final-optimization/stage2-checkpoint/database-check.json)。测试使用8130基线副本及8134候选副本，不能把候选画面视为真实服务已更新。

## 已实现内容

- `src/client/quality.ts`统一自动/流畅/标准/精美策略、菜单与欢迎页选择器、手动偏好持久化。像素比上限分别1/1.35/1.8，阴影0/1024/2048；流畅关闭屏幕描线通道，保留世界几何、交互与碰撞。自动策略从标准起步，低能力提示可降档，实际前台世界就绪后45帧热身、180帧窗口观察，最多评估两窗且只降档；手动选择优先。没有提示数据不判兼容失败，也没有未经验证的最低设备声明。
- `village-drawing.ts`流畅使用直接绘制并释放描线目标，其他档按需重建；`presentation.ts`和室内阴影随档位更新。主循环接线不更换已验收室外相机及室内SimpleFollowCameraRig。测量dataset给出实际档位、通道数与renderer资源数量，资源数量不是GPU字节。
- `index.html`在模块下载前显示轻量欢迎壳；`welcome.ts`复用现有加载任务与实际计数、编译阶段，不伪造百分比。只有状态和世界准备完成才允许开始；已开始回访及旧进度自动进入。当前首次判断暂用本地欢迎标记加现有revision/位置条件，下一阶段显式新身份元数据仍待接入。
- 网络失败提供重试；实测WebGL创建失败/上下文丢失才显示图形失败面板。丢失时暂停绘制并提供重载，重载保留已有未保存退出保护。欢迎页重挂载和室内对话框关闭逻辑已作定向修复。中英双语与触摸布局已接入。

## 代表场景前测

[完整原始结果](../evidence/final-optimization/stage2-before/result.json)。Apple M3/16GiB，有窗口Chrome155.0.8059.80、ANGLE Metal Apple M3；DPR1。同一隔离身份/家园、固定姿态，桌面1920×1080和本机390×844触摸模拟，非实机手机。每场景三段2.5秒稳定采样，全部列出，未挑最佳窗口。冷缓存为新context禁用网络缓存，热缓存为一次预热后重载；未清OS/驱动缓存。

| 场景 | 桌面三段rAF p95(ms) | 手机视口三段rAF p95(ms) | 桌面/手机draw calls | 桌面/手机强制GC后JS heap(B) |
| --- | --- | --- | --- | --- |
| Hub | 17.0 / 17.3 / 16.8 | 16.8 / 16.8 / 17.1 | 484 / 340–334 | 41,547,116 / 41,384,340 |
| 室内 | 17.1 / 17.3 / 17.3 | 17.3 / 17.2 / 17.1 | 177 / 166 | 17,595,728 / 17,554,708 |
| 飞行 | 16.9 / 17.3 / 17.4 | 17.7 / 17.7 / 17.7 | 24 / 19 | 48,387,336 / 48,196,032 |

Hub冷/热加载：桌面3246/2621ms，手机2858/2516ms；室内2513/951ms、1525/901ms。飞行原始耗时保留在JSON，但包含登船/起飞动作，且就绪判断后来发现过早，不能作为最终加载指标。rAF不是GPU耗时，提交CPU计数不是GPU计时，post-GC JS heap不是总内存。

第一次标准档候选试跑已保留为[未验收结果](../evidence/final-optimization/stage2-checkpoint/preliminary-after-standard.json)。飞行首窗口出现33.3ms且热加载仅131/182ms，检查确认驱动只等dialog关闭，未等嵌入欢迎页/飞行HUD真正就绪，属于**测试驱动证据不足**，尚不能认定产品回归或性能提升。驱动已改为等待body加载完成、欢迎可开始/消失及flight HUD position；尚未用修正驱动完成匹配前后重跑。其他样本也只作阶段记录，不宣布整体性能达标。

## 已完成定向验证

- 当前typecheck、9个相关TS文件lint、git diff --check通过；5个定向测试文件共40项通过（quality 8、welcome 8、loading 6、drawing 2、panel 16）。未运行全量/长时间浏览器套件。
- 候选前端实际build完成312模块；已有chunk大小提示，不代表性能验收。服务端未改动。
- 真实有窗口Chrome手机视口冒烟：首次中文欢迎→开始→菜单选择流畅→实际调用WEBGL_lose_context→显示图形恢复面板→重载自动回访且仍为流畅，全程pageerror为0，见[结果](../evidence/final-optimization/stage2-checkpoint/result.json)。流畅实际pipeline=direct、额外屏幕通道0，draw calls136、triangles108810、renderer几何163/纹理9/program52；该新身份与固定前测家园不同，**不能以136对比484宣称减少比例**。
- 已直接检查[首次欢迎](../evidence/final-optimization/stage2-checkpoint/welcome-phone.png)、[流畅画面](../evidence/final-optimization/stage2-checkpoint/smooth-phone.png)、[实际图形丢失恢复](../evidence/final-optimization/stage2-checkpoint/graphics-recovery-phone.png)；390×844内容可见，村庄轮廓/色彩保留，流畅无屏幕描线/阴影是明确的档位取舍。完整三档各场景视觉仍未验收。

## 后续与阻碍

没有环境/权限阻碍。当前主动停在可复核本地检查点，便于父会话及时同步；不是因测试失败停止开发。下一步：

1. 修正驱动下重跑同身份/同姿态飞行前后，完成三档代表场景对照和加载阶段拆分；在相同GC条件进行画质/室内切换循环与服务RSS检查。保存全部窗口，不能用新家园和旧Hub硬比较。
2. 完成网络失败/重试、英语、室内/飞行旧进度回访、照片捕获时切档、首次中断重载的有限定向验证。auto/手动策略已有单测，真实低端GPU尚未测。
3. 再实施仅新身份Hub出生、可重启后台家园任务，保护所有旧身份位置/飞船/室内状态；接入Mica→Sol→自家门的一次一目标教程，跳过/重看不得重置进度。
4. 重点场景与真实球面可走路网导引美术随后实施。已有v15路网读取审计，尚未改场景资产/服务器/碰撞；不得将两点直线作为路面导航。
5. 全部四项完成后再统一技术与Chrome视觉验收、本地提交；push/部署继续等待用户明确授权。用户视觉意见可在已有截图上提出，不能替代我们未做完的技术验收。

继续执行位置：私有测试驱动在本机workspace的`optimization-scenes.mjs`与`stage2-checkpoint-smoke.mjs`；基线服务8130/PID26744、候选8134/PID27983的元数据在`.data/optimization-runs/20261017T033354Z/`。凭证、测试身份state、SQLite和business-key只留Git忽略私有目录；本次公开证据仅测量/截图，不含凭证或真实会话数据。
