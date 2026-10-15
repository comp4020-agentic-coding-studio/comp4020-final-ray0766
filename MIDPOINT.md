# 本地中期整合入口

后续开发统一使用：

- 目录：`/Users/ray/Desktop/Study/ANU-Master/8020/comp4020-final-ray0766`
- 分支：`integration/midpoint`
- 本地地址：http://127.0.0.1:8098
- 私有配置：`.data/midpoint/config.json`
- 真实存档：`.data/midpoint/little-worlds.sqlite`（从 workshop 的 schema16 一致性备份，非8143样例）

在上述目录，使用 Node24 或更新版本：

```sh
node scripts/local-preview.ts status
node scripts/local-preview.ts start
# 修改完成，需要重新构建并重启时：
node scripts/local-preview.ts restart
# 仅停止本入口拥有的进程，保留存档：
node scripts/local-preview.ts stop
```

`pnpm local` 是同一入口的快捷方式。start 对已运行服务不重复启动；restart 先构建，构建失败保留旧服务。端口被其他进程占用时会拒绝启动，不自动杀进程。入口验证规范目录、分支、端口、数据库和集成标记，拒绝样例或旧世界覆盖。无需先运行 pnpm install 或安装新运行时。

这是后续功能开发的共同基线。继续在本目录、本分支修改，按改动做针对性验证，提交前查看 git diff；不要再在 final-workshop-v1、旧 Claude worktree 或旧 v11 目录开始下一轮。旧目录和分支仍保留作历史参照，不能仅凭更新时间覆盖当前源码。生产启动与部署配置保持原有约定；本入口仅监听本机。

`.data/midpoint` 是私有运行和恢复目录，不纳入 Git。其下 archive/20261016 保存原数据库、重复文件及逐文件哈希清单；releases 保存本入口构建，runtime 为当前构建和源码的链接。server.json 记录拥有的进程，server.log 及 .1 各限256KiB；SQLite 旁业务日志及 .1 各限1MiB，观察密钥独立保存。不要把此目录当清理缓存，也不要用浏览器清除身份作为修复方法。备份应使用 SQLite backup API 保证一致性。

代码与资料来源、保留边界和验收记录见 [整合来源](docs/integration/midpoint-sources.zh-CN.md)。原始问题与 Final 待办见 [Bug 汇总](docs/BUG-SUMMARY.zh-CN.md)。
