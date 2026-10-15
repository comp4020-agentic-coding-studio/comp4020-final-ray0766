# 两项日志最小补修验证（2026-10-16）

起点：`integration/midpoint` / `2eaf52e`，工作区干净；`midpoint-integrated-v1`仍固定于`a0a9c6f`。仅修改business-log、两份日志定向检查与相关说明/导出字段；home、store、planets等权限实现不变，访客读取室内描述的政策问题未处理。

- 修复前新增两项单元回归均失败：实际房间编辑拒绝得到permission_refused；成功门结果缺doorOpen/doorVersion。原3项通过。
- 修复后[单元](../../spec/business-log.test.ts)5项、[HTTP](../../spec/business-log-api.test.ts)2项，共7项通过（3.49秒）。HTTP用临时目录、随机端口的独立legacy及home-sample服务；8098仅供全局首页/health探测，没有在真实库创建身份或操作门。
- HTTP覆盖：关门→结果false/version1；旧版本开门409→不附门状态；开门→true/version2；无变化重试→相同version2；另一身份编辑房间403→home_owner_required。单元另覆盖请求open与服务端结果相反、错误目标、无/坏快照、其他动作、拒绝/失败以及私有字段排除。
- typecheck与仅改动的3份TypeScript文件lint通过。未运行全量测试或浏览器。构建和8098更新通过统一入口执行；真实库用只读逐表摘要在更新前后核对，最终结果在交接中报告。

```sh
APP_URL=http://127.0.0.1:8098 EXPECT_WORLD_PROFILE=integrated node node_modules/vitest/vitest.mjs run spec/business-log.test.ts spec/business-log-api.test.ts --project app --maxWorkers=2 --configLoader runner
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/server/business-log.ts spec/business-log.test.ts spec/business-log-api.test.ts
```

[导出示例](logs.zh-CN.md)增加门状态两个允许字段，仍只导出已接受、目标ID合法、格式正确的门结果。保留38动作/23固定原因词表；不读取key或真实日志，不生成演练片段。门结果是服务端返回时的状态，不是后来永不改变的状态，也不证明另一客户端已看到；accepted不等于发生新改动。线上尚未部署新日志功能，不作线上已就绪声明。
