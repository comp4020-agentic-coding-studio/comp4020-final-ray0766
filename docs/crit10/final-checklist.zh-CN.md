# Crit10提交核对与Final边界

> 历史快照：本清单保留2026-10-21的Crit10核对状态。下文“research-note.md仍缺”和“此后Final仍需单独完成”描述当时阶段，不是当前待办；研究短文及Final交付现已完成，且已完成超过34小时的保留用户回访。当前状态见[发布总览](../releases/final-2026-10.md)、[研究短文](../../research-note.md)及[回访与同步证据](../evidence/production-return-sync-20261027/README.md)。原始观察与未测范围不改写。

核对2026-10-21。官方：[Crit10](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/)、[cutoff规则](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/studio-crit-model/)、[Final](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)。

本次周三15:30班；cutoff为2026-10-21 13:30 Australia/Sydney（02:30 UTC）。推送、可用部署和反思需要在cutoff前具备；不能把演练结束作为首次提交反思的时间。

| 项目 | 可追溯证据与边界 |
| --- | --- |
| 多身份、共享状态及服务端权限 | [矩阵](permissions.zh-CN.md)、隔离HTTP双身份拒绝测试、现有多人检查；真人观察仍按实际记录判断。室内布局描述不保密，进入/编辑受限制。 |
| who-did-what日志及持续保留 | [ADR0009](../adr/0009-business-observation.md)、[日志说明](logs.zh-CN.md)、持久卷旁的有限轮转文件；不承诺无限档案或每一帧。 |
| 正式发布、备份、当前SHA的CI | [发布记录](release-verification.md)；只有对应SHA的终态成功及线上验收才能算完成。 |
| 两位同学URL-only、独立profile、作者日志讲解 | [用户报告](peer-report.zh-CN.md)确认试玩且运行正常；没有逐动作/日志匹配材料，不能补造。课堂中作者仍须能从日志讲解。 |
| PROCESS与开发提交 | [PROCESS](../../PROCESS.md)已更新事实过程和commit/compare链接。 |
| 第三篇反思 | [crit-10.md](../../reflections/crit-10.md)根据用户已提供的突破和方向整理；不声称完整日志追踪或零缺陷。 |
| README、公共说明与限制 | [README](../../README.md)描述实际arrival、匿名身份、房间数据边界和设备提醒；正式[/readme/](https://comp4020-final-ray0766.fly.dev/readme/)随部署更新。 |

`check:evidence`只检查文件和链接形态，不审真人证据、研究立场或线上行为。当前发布不能拿旧722项通过替代；以本次CI数量和结果为准。禁用的相机测试仍不在课程默认check内。

## 此后Final仍需单独完成

- COMP8020根目录`research-note.md`仍缺。它是Final的600–800词批判研究论证，不是Crit10的附加个人反思；不代替用户选择观点。
- 真实手机性能、公开负载、隔日保存和课堂具体日志讲解不能由模拟视口或定向测试包办。已有证据的条件和限制见[Crit9验证](../evidence/crit9-realtime/verification.md)。
- 对所有新增人工观察保留版本、时间、实际动作和未观察项，不把[空白模板](observation-template.zh-CN.md)当完成证据。

官方Final截止列为2026年11月9日中午，具体提交安排以课程通知为准。
