# Crit10：正式入口、证据与演练

核对日期：2026-10-21（Australia/Sydney）。规范开发分支为 `integration/midpoint`。正式应用：**https://comp4020-final-ray0766.fly.dev/**；公开说明：[/readme/](https://comp4020-final-ray0766.fly.dev/readme/)；[本次发布记录](release-verification.md)区分候选验证与已完成发布。

班次由用户确认：周三15:30。按课程提前两小时的规则，本次 cutoff 为 **2026-10-21 13:30 Australia/Sydney（02:30 UTC）**；上课为15:30（04:30 UTC）。反思必须在cutoff前已推送，不能等演练后才首次补交。依据：[官方 Crit10](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/)、[Studio crit model](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/studio-crit-model/)。

## 当前证据

- 服务端以匿名浏览器cookie区分身份；权限契约与依据见[权限矩阵](permissions.zh-CN.md)、[ADR0009](../adr/0009-business-observation.md)。室内进入/编辑由主人控制，但布局描述不是保密数据。
- 持久业务日志记录稳定化名、动作及接受/拒绝结果，轮转与采样限制明确，见[日志说明](logs.zh-CN.md)。
- [开发过程](../../PROCESS.md)包含真实commit/compare链接；[Crit10反思](../../reflections/crit-10.md)依据用户的中文回答翻译整理，回答突破和开发者方向两题。
- 用户确认同学已试玩，观察是“网站正常运行”。这是对两位同学URL-only、独立profile、作者看日志问题的概括回答；没有提供日期、具体动作或日志对应片段。见[用户报告及证据边界](peer-report.zh-CN.md)，不能把空白模板或自动化检查当现场记录。
- 线上版本、备份、迁移和本次CI以[发布记录](release-verification.md)的终态为准；此前Crit9的绿色CI不证明新版本。

## 现场材料

- 作者先读：[主持人清单](host.zh-CN.md)、[权限矩阵](permissions.zh-CN.md)、[日志及匿名导出](logs.zh-CN.md)。
- 参与者只收：[正式URL](participants.zh-CN.md)。不要预先发送本目录、攻略或操作路线。
- 当场填写：[空白观察记录](observation-template.zh-CN.md)。只写确实观察到的动作、作者解释和未确定项。
- [提交核对与Final边界](final-checklist.zh-CN.md)区分本次Crit10和以后Final的要求。

本机8098和独立候选8137不是同学电脑上的公开入口，也不作为本次发布目标。本次不替换8098冻结产物、不重写其存档。2026-10-16的[日志补修记录](log-fix-verification.md)是历史技术证据，不是后来真人演练或当前线上状态。
