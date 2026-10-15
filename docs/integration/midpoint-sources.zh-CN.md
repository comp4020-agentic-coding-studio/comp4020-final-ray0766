# 中期整合来源与边界（2026-10-16）

## 整合原则

有效功能合流到根目录 `integration/midpoint`，以 `73b679e` 为共同祖先。没有把所有旧目录逐文件覆盖，也没有把过时实验恢复成有效产品。此次仅新增规范本地入口、保护和交接说明；游戏行为继承该祖先。未推送或部署，main 与 origin/main 不移动，保留原分支、worktree 与源模块。

## 来源证据

| 来源 | 核对结果与处理 |
| --- | --- |
| 已交付 main `60d54ae` | 已包含于祖先；线上 Crit9 本次未改动 |
| 根目录原 main `f4160de` | 已在整合祖先中，历史保留 |
| `final/local-readiness-20261016` | `6d19175` 业务日志、旧身份提示、保存反馈；`73b679e` 室内未保存离页保护和历史 Bug 核对，全部继承 |
| final-build-ux `95fcb5b` | 稳定 patch-id 与已合入 `bcc6986` 相同，不重复 cherry-pick |
| final-multiplayer-sync `84ddfae` | 与 `a4809b1` 相同 |
| final-onboarding `1f7a66e` | 与 `cf38f7c` 相同 |
| final-save-recovery `798f145` | 与 `f6222e4` 相同 |
| 其余正式功能分支 | 已是73b679e祖先；详见私有 archive 的 refs.json |
| diag/fly-machine | 三个分支独有生产诊断／恢复提交保留历史，未引入本地入口或运行生产操作 |
| planet-claude-modules `14e244f` | 独立源码干净；宿主 src/assets/claude-geometry/PROVENANCE.json 保留114项源文件、124项资源哈希及历史覆盖来源，不重新覆盖 vendor |
| 根目录100个未跟踪“2”副本 | 63个与对应文件相同，37个不同但都可追溯历史版本；先复制、逐文件哈希校验，再移入私有 archive，未作为新功能覆盖 |
| workshop 未跟踪 crit8-update-live.spec.ts | 原件保留、另存副本和哈希；未默认为有效验收或纳入配置 |
| 旧 v11 little-worlds-village | Git 定向读取超时；保留原目录，不宣称已检查其全部未提交内容，不重新启用废弃相机 |

## 存档与恢复

根目录旧 schema4 存档为99玩家、42星球、24对象；workshop schema16 为212玩家、93星球、282对象、52蓝图库、6室内、262历史事件，非 home-sample。旧库玩家、星球、对象ID均包含在新库中，三类 rootOnly 均为0。采用新库的较新状态，不回灌旧值；这不是合并登录身份。

用 SQLite 一致性备份建立 `.data/midpoint/little-worlds.sqlite`，建立时所有业务表行数及逐表内容摘要与 workshop 备份相同，integrity_check 为ok。原 root 和 workshop 数据库仍在原处；archive/20261016 另存两库及 database-table-manifest.json。原根目录构建产物也已存 root-dist 和逐文件哈希。所有档案在私有 .data 内，没有提交账号或存档内容。

新入口不创建空替代库，不修改浏览器身份。服务第一次读取保存记录时仍可能执行已有合法懒恢复逻辑；因此上线后不能要求实时库文件字节永久不变。恢复某个快照会放弃快照之后的新进度，须先备份当前库并明确选择时间点，不能自动覆盖。

## 验收记录

在73b679e上已完成正式 app+legacy-http 聚合117文件／733测试，typecheck、lint、build及证据检查；废弃相机测试维持独立。此次入口改动只做新增测试、类型、lint、构建和无身份只读HTTP检查，不重新运行完整浏览器或长相机回放。实际结果记录于同目录 midpoint-verification.json。

保留已接受室外4f0d596路线与室内SimpleFollowCameraRig；视觉由用户验收。顶栏星球号反馈尚未用原飞行／传送路径复现，不能标成已修复。旧身份无家园时传送限制、认领路径，以及地面／飞船自动保存与室内显式保存的已知边界，统一参见 docs/BUG-SUMMARY.zh-CN.md 和 docs/player-guide.md。
