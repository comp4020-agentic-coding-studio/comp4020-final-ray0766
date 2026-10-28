# 主系统视觉适配交接（给 Claude 的工程接口）

> 历史交接快照：以下保留早期视觉适配接口与当时的协作边界。“新样板尚未接入”“发布继续暂停”不是当前Final状态。当前人物、界面和音乐功能已经完成并发布，见[发布总览](releases/final-2026-10.md)及[玩家指南](player-guide.md)；本记录不再作为当前实施或发布指令。

本轮只准备主系统适配入口，保留当前默认画面。用户方向是把所有视觉统一为温暖、柔和、小巧精致的风格；现有建造、送件、串门、物理、飞船、terrain、history、保存和权限全部保留。新样板尚未接入，也未替用户选择颜色、造新材质或改变世界布局。发布继续暂停。

## 已集中到主项目的入口

| 入口 | 责任和当前行为 |
| --- | --- |
| `src/client/presentation.ts` → `PRESENTATION` | 主世界 ACES / sRGB / 曝光 1.03；预览曝光 1；公港与普通星球各自的太阳、环境补光、雾、阴影覆盖和环境亮度；轨道 RoomEnvironment PMREM 与光源参数。全是原值。 |
| `configureGroundLighting` / `groundPresentation` | 切星球和初始化复用同一份公港 0.43 / 普通星球 0.5 环境亮度，消除分散的重复赋值。只改渲染属性，不改世界、角色或灯光位置。 |
| `createWorldStyleLibrary` | 原有 medium 库，浏览器开启 scans；`shared-assets.ts` 仍缓存一份世界库，建筑和停泊/飞行飞船共享它。不开新材质系统，不改 preset / KitMaterial ID。 |
| `createWorldPracticalLights` | 原有 medium 固定灯池，2 spot + 2 point、0 shadow、reach 16。继续使用 vendor `FITTINGS` / `PRACTICAL_BUDGET`，不复制或篡改它们。 |
| `previewOptions` / `presentation-stage.ts` → `createPresentationStage(kind, container)` | 建筑、飞船、地貌、历史四个延迟加载面板的共同 Stage 创建入口。建筑/飞船用 hangar，地貌/历史用 dusk；medium、procedural、scans、无背景环境、无雾、FOV 44。仅建筑保持原有 `#151e24` 背景和显式关闭 AO，其余使用 Stage 默认背景。 |
| `presentation-materials.ts` | 主项目公港 `concrete/pale/metal/dark/copper/road/edge`、`cyan/amber/glass/facade` 参数；粗糙纹理 bump 和 anisotropy；三种外套、两个 NPC 外套、角色基本表面和面罩。保留工厂资源生命周期。 |
| `presentation.css` | 页面/对话框、ground/space paper/ink、任务强调色、历史与地貌面板共享底色和栏色、三个面板共享焦点色。旧 `style.css` / `immersive.css` 重复定义的 paper/ink 已收束；布局和选择器不改。 |

这不是运行时主题切换器。配置用于创建资源；换样板应重新构建并刷新，不要在已有材质缓存上偷偷修改全局对象。没有为了修改画风提高 LOD，也没有新增后处理链。`?textures=ktx2` 诊断开关和 WebP 默认继续经现有 `resource-policy.ts` 使用。

Stage 仍管理灯、材质、PMREM、异步环境加载与 dispose；主适配只传现有接口并统一曝光。当前 medium 没有 bloom/GTAO，主地面/飞行直接使用 renderer。HDRI 选择入口保留在 StageOptions.environment；实际仍是 procedural。vendor 的 HDRI 强度、radiance cap、mood light rig、bloom/AO 数值没有复制进主项目。若样板需要修改这些，须在 Claude 模块正式提供受控接口或已核验版本，不能在主适配中依赖私有字段补丁。

## 不能靠 vendor 更新自动覆盖的部分

| 对象 | 现有路径、边界与后续适配点 |
| --- | --- |
| 主项目 `service.light` | `shared-assets.ts` 显式分支优先于 `PARTS`。使用公港 dark/metal/amber/pale 材质，底部到最高螺栓约 2.23m；本次完全保留几何。它当前只有 emissive 表面，没有登记 vendor emitter，不能声称新灯池调色会自动覆盖它，也不能自动换成 vendor 同名模型。 |
| 公港和旧六种建造物 | `harbour.ts` / `build-art.ts` 使用 `harbourMaterials`。材质基础已集中；程序立面纹理、标牌画布、树/花颜色、轨道公港缩略模型仍由主项目各工厂拥有，需要 Claude 给出映射后逐项处理。不得更换道路、建筑、港口坐标或碰撞包络。 |
| 本地角色、两名 NPC、远程角色 | `character.ts` 的 `courier` 被主世界和 presence 复用。外套/面罩/表面入口已集中；躯干小件、背包、四肢配色、接地阴影仍在模型工厂。本轮未改变动画、骨架或尺寸。需要同一套角色视觉说明，不能仅更新建筑模块。 |
| 建筑和蓝图预览 | `libraryMaterials(StyleLibrary)` / `KitMaterial` 继续解析到 preset/custom/glass/glow。保留全部 material key、part ID、`sharedResource` / `ownedResource` 与 dispose 语义。建筑编辑器的选中/悬停/无效放置等反馈还在 `WorkshopView`，不能把这些状态颜色都统一成普通材质。 |
| 停泊、飞行、船坞飞船 | `ship-model.ts` / `shipyard.ts` 复用 `createShipModel` 与用户保存的 ShipDesign。当前船坞库由 Stage 独立管理，世界库全程共享。保留 paint-zone key、注册号、用户已有涂装值与推力接口；默认新配色不能重写用户存档。 |
| 地貌 | `terrain-model.ts` 单独创建 `TerrainKit`，不是通过 `StyleLibrary` 控制全部地表。`buildPlanet` 的 field/env/foundations/clearings 与服务端相同；主画布透明大气壳的 alpha 合成修正要保留。风格化材质不能修改 seed、高度函数、海面、地表接触、地基或 RESTRICT 规则。 |
| 历史回放 | `planetPreview` 使用 Stage library 渲染蓝图，地貌仍走 TerrainKit。legacy null 地貌另有主项目灰绿预览材质。只读回放必须继续读取原 snapshot，不能借换风格改写事件或历史地形。 |
| 轨道、返航门和 HUD | `space-art.ts` 仍有 NASA 月球贴图、程序星球/大气/星环；`scene.ts` 仍有返航门/标牌；各面板专属 CSS 仍保留原值。本次只整理共享参数，不删这些内容。需小样确定后分别适配，不能误认为替换一份 palette 就覆盖全应用。 |

## 不可变契约

- 保留资源与文档 ID、版本化静态资源 URL、蓝图/船设计/terrain 编解码格式。
- 一单位一米，+Y up / +Z exterior；门洞、floor、楼梯、锚点、连接点、法线和存档变换不动。小巧感通过批准的视觉设计与镜头表达，不能整体 scale 几何造成穿模。
- 飞船 solidBounds、radius、方向与推进器锚点不动；ship 设计和所有保存变换不动。
- physics collider、移动/转向/相机控制、服务器速度和接近距离检查不动。
- 数据库 schema、拥有权、历史私有性、幂等和 RESTRICT 不动；不得迁移旧星球或缩地图。
- 延迟加载、扫描纹理格式回退、固定灯池、材质共享和释放契约不动。

本轮没有修改 `src/assets/claude-geometry`。固定快照仍是 R3 `a4546bb` 加 R4 `e7a6b4d` 的三个文件，62 个来源文件以 PROVENANCE.json 哈希核验。独立 Claude 源工作区只读；其中新增未提交工作不作为集成来源。

## 等 Claude 提供的内容

1. 用户可审核的一个小样：同一门洞建筑、角色、灯、飞船、地表在地面/预览/轨道中如何统一；附桌面和手机视角，明确哪些只是材质变化。
2. 固定提交与改动文件清单、资源相对路径、许可证、旧资源保留策略。不要只给未提交工作区或覆盖旧版本的同名贴图。
3. 现有 `KitMaterial`、StyleLibrary preset、paint zone、TerrainKit，以及上表主项目公港/角色材料槽的映射。明确用户既有涂装是否原样显示；保留色值与 ID。
4. 预期的 scans / procedural / HDRI、曝光、灯池及后处理配置。若现有 Stage/StyleLibrary 无法表达，提供最小明确的接口差异，不引入第二套主题引擎或逐帧全场景材质遍历。
5. 列出不可变尺寸/锚点/碰撞未变的证据，以及 medium/low LOD 的渲染预算与材质资源释放检查。单纯美术更新不得夹带地图、物理或存档变更。

收到批准样板后才实施颜色和材质替换。本文件是工程交接，不是学生反思、完成的新画风报告或发布承诺。
