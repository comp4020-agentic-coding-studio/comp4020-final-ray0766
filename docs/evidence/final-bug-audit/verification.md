# Final 历史问题核查与最小修复：本轮验证

基线 `6d19175`，本记录所在提交为修复版本。未推送、合并 main、部署、改 Fly 配置或操作生产数据库。

## 先复现，再修复

`spec/panel-loading.test.ts` 新增真实房间控件用例：进入房间、开始布置、改为 sage、派发可取消的 `beforeunload`。修复前第一项断言失败：`expected false to be true`，即草稿已改而离页没有被拦截。

`HomeInterior` 仅增加一条随原有 AbortSignal 释放的离页监听，条件为 `active && dirty`。没有自动保存、缓存草稿、改变 door/room 协议或镜头。回归还检查保存拒绝、等待确认时保持保护；收到保存确认、明确取消或组件释放后解除。

修复后 `panel-loading.test.ts` 全文件 **16 项通过**。此检查使用 jsdom 和真实控件回调，WebGL 资源准备被隔离；不把它写成原生浏览器弹窗或视觉验收。

## 编号定向检查

只开一个临时 Chrome 1440×900 上下文，使用 8143 专属测试身份；不读取真实浏览器 cookie。测试只在此新身份上分别恢复到 Little world 12 和 Little world 13，检查 `/api/universe` 的当前星球、顶栏、暂停菜单和渲染 draw calls。

两次名称均一致、各记录 34 draw calls，见 [planet-label-probe.json](planet-label-probe.json)。这不是用户原始飞行/传送路径的复演，不能宣布错名问题已修；仍列为待复现。上下文和该次 Chrome 进程已关闭。

## 最终检查：只运行一次 aggregate

使用现有 Node 24 和锁定依赖，无安装、无断言/预算调整：

```sh
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node scripts/check-evidence.ts
git diff --check
```

以上全部通过。证据检查确认 Crit 8/9 反思存在，不代表 Crit 10 反思或 COMP8020 research note 已完成。

客户端和 worker 按现有 build 两步构建到独立 `bug-audit-runtime/dist`、`build/worker`，均通过；worker 来自 124 个输入文件。Vite 的既有大 chunk 告警保留，没有提高阈值。

最终 aggregate 使用专属随机 localhost 端口、新建 integrated 数据库；legacy HTTP 组仍由仓库配置自己建立独立 legacy 库。没有把 HTTP 测试指向 8143 或现用库。

```sh
APP_URL=<本次专属 integrated 地址> EXPECT_WORLD_PROFILE=integrated \
  node node_modules/vitest/vitest.mjs run --project app --project legacy-http \
  --maxWorkers=2 --configLoader runner --reporter=dot
```

结果：**117 个文件、733 项测试全部通过，89.30 秒**。限制两个 worker 只是控制并发，不减少检查。20 个已明确禁用的旧相机 spec 文件依原有配置保持隔离，没有跑超过 20 分钟的旧极点回放。日志中的 worker 启动失败/503 是故障注入用例的预期输出，最终结果通过。

16 项定向检查与 aggregate 重叠，不相加成额外独立覆盖率。本轮没有完整浏览器套件、性能压力测试或生产复验。

## 8143 隔离预览更新

- 只在核对 PID 和 cwd 后停止本任务自己的旧 8143 进程和已经完成的 aggregate 临时服务；没有结束其他服务。
- 保留同一 `private/candidate.sqlite`，更新前建立 `before-final-bug-audit.sqlite` 一致备份；现存 3 个测试身份全部保留，日志匿名密钥不变，SQLite `quick_check=ok`。
- 新产物在 `releases/final-bug-audit`；旧产物归档到 `releases/6d19175`，旧哈希资源保留，避免已打开页面的资源立即失效。原项目 dist/build 不覆盖。
- `http://127.0.0.1:8143` 更新后 `/healthz`、首页、`/readme/` 和全部入口 JS/CSS 均为 200；新入口 `index-Srmta34n.js`，私密数据库/日志/key 路径为 404，见 [preview-smoke.json](preview-smoke.json)。静态/worker 产物扫描未发现日志或密钥。
- 不修改用户真实 cookie；专属 cookie 名仍为 `little_home_sample_p8143`。`/__preview/no-home` 和 `/__preview/new-home` 只在独立本机 harness 中存在，不进入应用源码或发布包。重新点击这些入口会创建/切换临时身份，正常刷新则继续当前身份。

## 用户亲测

1. 刷新 8143 获取新资源，用新家园身份走进房间，开始布置并修改颜色或家具；未保存时刷新应有浏览器原生确认。选择留在页面应保留当前预览。
2. 保存成功后刷新不应再因房间草稿拦截，并应恢复已保存布置。明确取消后也应解除保护；失败/等待中的保存继续保护草稿。
3. 重现原始 13/12 错名操作时记录 URL、操作顺序和顶栏/Atlas 截图。当前没有证据支持重命名、重编号或改存档。
4. 镜头舒适度、门框/台阶手感、手机飞船亮度、真实设备性能与两位同学的 URL-only Crit 10 演练仍需人工验证。

手机系统强制关闭、浏览器崩溃等情形不保证触发 `beforeunload`，本轮修复不承诺未保存草稿的崩溃恢复。
