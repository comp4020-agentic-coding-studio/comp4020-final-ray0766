# Crit10 演练准备（尚未演练）

核查：2026-10-16，`integration/midpoint`，应用基线 `a0a9c6f`（中期标签 `midpoint-integrated-v1`）。本包只记录准备和源码核对，不代表真人结果或线上验收。

依据：[官方 Crit10](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/)。两位同学使用独立 Chrome profile，仅凭 URL 使用共享应用；作者不操控应用，只从服务端日志说明谁做了什么。权限应由服务端检查并说明，日志需持续保留。最终要求另见[官方 Final](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)。

- 作者先读：[主持人清单](host.zh-CN.md)、[权限矩阵与发现](permissions.zh-CN.md)、[日志及匿名导出](logs.zh-CN.md)。
- 参与者入口：[只发 URL](participants.zh-CN.md)。不要把本目录、主持人清单、玩家指南或预设操作路线提前发给同学。
- 现场使用：[空白观察记录](observation-template.zh-CN.md)。
- 演练后：[Final 剩余清单](final-checklist.zh-CN.md)。

当前本机 `http://127.0.0.1:8098` 已运行新日志代码；同一 Mac 的独立 profile 可做本地准备性演练。这个地址在同学自己的电脑上指向他们自己的机器，不能作为远程入口，也不满足官方已部署要求。当前交接中的线上仍是 Crit9，尚未部署本地新日志功能；本轮不访问生产或执行部署，不能声称线上 Crit10 已就绪。

本轮核查工作区起点干净，分支/HEAD符合规范；未发现 Claude CLI，Claude GUI 存在不等于没有其他编辑，因此安装文档前再次检查状态。只调用本地健康探针，没有调用身份API、操作浏览器或打开数据库，不改 README、PROCESS、个人反思或研究立场。

2eaf52e准备包核验结果：8份Markdown的68个本地链接及源码行号可解析；导出示例只做语法与固定词表覆盖检查，未读取真实日志、未执行导出或生成真人证据。`node scripts/check-evidence.ts`、`git diff --check`通过；前者只找到现有crit8/9，不代表crit10完成。本轮未运行应用测试、浏览器测试、构建或部署。

后续两项日志最小补修已完成定向验证，见[补修记录](log-fix-verification.md)。房间描述可见性取舍仍待用户答复，未改变权限。新日志仍仅在本地，未部署线上；没有新增真人演练或反思证据。
