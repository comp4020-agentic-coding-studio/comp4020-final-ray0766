# 权限矩阵与源码核对

原始核查基线`a0a9c6f`；2026-10-21按集成版复核，并补充arrival重试与隔离HTTP检查，见[验证记录](release-verification.md)。下表“允许/拒绝”是当前服务端契约，不是本轮真人验证结果。[ADR0009](../adr/0009-business-observation.md)决定以匿名浏览器身份区分人，保留主人对私有创作的修改权、共享室外空间；代价是没有跨设备账号和身份恢复。

| 资源/动作 | 当前服务端边界 | 可追溯依据（代码；现有检查） |
| --- | --- | --- |
| 身份与一般API | GET state可创建身份；cookie由服务器哈希查验。其他业务API须有效身份，客户端不能指定owner；POST另查Origin、JSON及限流。清cookie或换profile会成为另一身份，同一profile的标签页共享身份。 | [index.ts](../../src/server/index.ts#L51)；[store.ts](../../src/server/store.ts#L197)；[business-log-api](../../spec/business-log-api.test.ts) |
| 室外星球/建筑/已放置蓝图 | 有身份可读星球列表及当前星球公共几何，含别人已放置蓝图的部件；不是他人私有命名/分组蓝图库。公共港不归个人。 | [planets.view](../../src/server/planets.ts#L154)、[universe](../../src/server/store.ts#L234)；[planet-api](../../spec/planet-api.test.ts) |
| 建筑新增、移动、删除、替换、撤销；地形 | 只准目标星球主人；公共港/访客403。另查版本、容量、碰撞、场景/地形约束；不是拥有权就可任意穿墙或覆盖。 | [owns](../../src/server/planets.ts#L81)、[写入口](../../src/server/planets.ts#L173)、[replace](../../src/server/planets.ts#L110)；[planet-api](../../spec/planet-api.test.ts)、[terrain](../../spec/terrain.test.ts) |
| 认领 | 公共港403；他人已认领409；每身份至多一个家园。新集成身份先进入港口，后台持久准备家园；旧无家园身份保留；源码claim本身未要求已落地，UI飞行认领路径不是安全条件。 | [claim](../../src/server/planets.ts#L162)、[创建](../../src/server/store.ts#L260)；[planet-api](../../spec/planet-api.test.ts) |
| 家园准备重试 | 仅当前新arrival身份可重试自己的准备，不允许提交任意请求字段；旧身份403。接受请求不保证后台已完成。 | [HTTP入口](../../src/server/index.ts)、[retryArrivalHome](../../src/server/store.ts)、[arrival homes](../../src/server/arrival-homes.ts)、[定向HTTP检查](../../spec/business-log-api.test.ts) |
| 私有蓝图库 / 自己飞船 | 库按服务端owner隔离，保存蓝图须有家园；放置使用自己库内容（共享站点目录例外）。飞船保存按当前身份player_id，不接收他人owner；查版本/落地状态。已放置几何不保密。 | [blueprints](../../src/server/blueprints.ts#L19)、[ships](../../src/server/ships.ts#L7)；[blueprints检查](../../spec/blueprints.test.ts)、[ships检查](../../spec/ships.test.ts) |
| 房间进入 / 布置保存 / 建家与外观 | 进入和布置只准主人，另有距离、门、版本和所在场景条件；访客403。建家、补路、改造/撤销也查主人及当前状态。 | [home.enter](../../src/server/home.ts#L174)、[save](../../src/server/home.ts#L215)、[setup](../../src/server/home-setup.ts#L51)、[paths](../../src/server/home-paths.ts#L11)、[remodel](../../src/server/store.ts#L367)；[owner-access](../../spec/home-owner-access.test.ts) |
| 房间描述数据读取 | **并非主人专属**：当前星球的home descriptor向访客返回室内material/items等完整描述（canEdit=false只表示编辑权）。不能宣称“私室数据只有主人看得见”。 | [descriptor](../../src/server/home.ts#L103)→[state](../../src/server/store.ts#L203)；[现有测试也断言访客与主人interior相同](../../spec/home-door.test.ts#L52) |
| 外门开关 | 近处、落地的访客也可开关共享外门；查visitEpoch、doorVersion和门扫掠占用，不等于可进入私室。旧存档访客若原已在室内可安全离开，不因此获得重入/编辑权。 | [setDoor](../../src/server/home.ts#L200)、[exit](../../src/server/home.ts#L193)；[home-door](../../spec/home-door.test.ts#L52)、[旧访客恢复](../../spec/home-owner-access.test.ts) |
| 历史列表 / 快照回放 | 必须目标星球主人，别人/公共港403；回放读取不会写当前世界，持久建筑变更在原事务内追加历史。 | [history](../../src/server/history.ts#L35)、[入口](../../src/server/store.ts#L252)；[history检查](../../spec/history.test.ts) |
| 传送 / 手工补站 | 仅当前身份家园↔公共港，须站近、落地、室外；不能用别人的站或提交第三星球目标。无家园409；重复请求/旧visitEpoch受检查。补站也要目标主人。 | [teleport](../../src/server/teleport.ts#L151)、[ownerPlanet](../../src/server/teleport.ts#L115)；[teleport-station](../../spec/teleport-station.test.ts) |
| 移动/飞行/换装/任务 | 只操作服务端当前身份；服务器验证路径、序号、旅程、速度/邻近和任务状态。不能通过presence授予编辑权。 | [navigation](../../src/server/navigation.ts)、[ground](../../src/server/ground.ts)、[store](../../src/server/store.ts#L315)；[presence](../../spec/presence.test.ts) |
| presence可见性 | 只返回同星球、同室外/室内scope的地面附近身份；位置重读权威状态，公开随机ID是短期presence标识，与日志别名不同；不是全部在线人或远程飞船列表。 | [presence.ts](../../src/server/presence.ts#L14)；[presence-visit](../../spec/presence-visit.test.ts) |

## 2eaf52e 源码核对发现与后续状态

1. **已证实可见性边界，是否属缺陷需明确承诺**：`home.ts:105`无所有权过滤返回完整interior，store.state将其带入响应；home-door测试明确覆盖此行为。因此“房间主人专属”目前只适用于进入/编辑。若产品要承诺布局内容保密，最小方案是区分公共door/外观描述与主人室内数据，并调整响应类型/客户端及该测试，补访客读隔离检查；不能只加canEdit或隐藏按钮。此次不将政策选择擅自当修复实施。
2. **日志原因遗漏已最小修复**：2eaf52e时`home.save`实际错误`Only the home owner can edit the room.`未匹配`edit this room.`；现在已匹配实际固定字符串，403/refused分类为`home_owner_required`。服务器拒绝逻辑、状态码和错误响应不变；[定向日志单元检查](../../spec/business-log.test.ts)与[隔离HTTP检查](../../spec/business-log-api.test.ts)覆盖，不输出错误全文。
3. **门结果细节已最小修复**：成功的`home.door`现在可附`doorOpen`布尔值与`doorVersion`安全整数，只取成功响应`currentPlanet.homeDoor`，并核对请求目标buildingId。拒绝、失败、快照缺失/格式不合法/目标不同均不附状态，也不从请求open推测结果。无变化重试会记录相同结果版本，不能算新一次开关。材料/家具/坐标仍不记，不加入完整body。见[补修验证](log-fix-verification.md)。

未发现新的写权限绕过证据；这不是全系统安全证明。源码未保证的限制不写成已实现：例如claim没有落地前置条件、房间描述非保密、旧室内访客保留位置。任何后续收紧都应单独评估兼容性，不能借Crit10文档改真实存档。
