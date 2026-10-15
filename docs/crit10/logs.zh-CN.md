# 本地日志、盲区与匿名导出

实现依据：[ADR0009](../adr/0009-business-observation.md)、[business-log.ts](../../src/server/business-log.ts)、[HTTP入口](../../src/server/index.ts)、[本地包装器](../../scripts/local-server.ts)。日志是观察证据，不是认证凭据，也不是完整操作录像。

## 查看（作者终端）

在规范目录，`node scripts/local-preview.ts status`确认使用固定存档。不要为观察创建另一个空库，也不要运行数据库写命令或读取/转发business-key。

```sh
# 本机8098：原始结构化业务事件（不含本地包装器的时间前缀）
tail -F .data/midpoint/little-worlds.sqlite.business.jsonl
# 本机诊断：启动、降级或非业务错误；不是可直接公开的证据
tail -F .data/midpoint/server.log
```

业务日志当前文件及`.1`各限1MiB；诊断server.log及`.1`各限256KiB。轮转淘汰旧事件；跨重启保留同一key才保留同一visitor别名；改key不改权限但破坏观察连续性。日志不是无限档案，也不保证断电前每行已刷盘。只看当前文件可能漏掉刚轮转内容。

未来获批部署新日志功能后，作者可用 `mise exec -- flyctl logs -a comp4020-final-ray0766` 看stdout；部署库路径按Dockerfile为`/data/little-post.sqlite`，业务文件在其旁。**此命令不是本轮已运行的检查。当前线上未部署本地新日志，不能把旧线上日志或本地8098结果说成线上Crit10验收。**

## 能与不能解释

| 记录/缺口 | 演练解释边界 |
| --- | --- |
| `actor=visitor-…` | 用独立key对内部身份HMAC生成，20位hex；同cookie/key下稳定，仅表示浏览器身份。不是姓名、跨设备账号、presence随机ID或权限凭据。未识别身份写anonymous，不能把所有anonymous当一个人。 |
| `action, planet, object, status, result, reason`；门成功结果可附`doorOpen, doorVersion` | planet/object只接受限定技术ID，可能缺失；不记录昵称、设计、坐标、完整body、URL查询、cookie、token、内部session hash。一次动作可能有预览/确认多行，也可能幂等重试未改状态。 |
| 地面/室内移动、飞行checkpoint、presence | 每actor/action/status最多每5秒一行；不能算帧数、精确路径、在线人数或精确操作次数。 |
| 重复拒绝/失败 | 同样按actor/action/status五秒采样，原因/目标不在采样键里；窗口内不同目标或原因也可能被省略。 |
| universe和blueprint成功读取 | 刻意不记；首次state创建记session.created，后续state读取记session.resumed。没有world.read成功事件不代表没看到世界。 |
| 认领、换装、保存、旅行等离散成功事件 | 不按上述五秒限频；仍不表示每一次真实输入都有事件或持久变化。character只记clay/fern/sky，interact只记pickup/deliver。 |
| UI输入、面板打开、Atlas选择、草稿、语言、刷新意图、渲染/延迟 | 无对应业务事件。室内颜色/家具、移动坐标未细记；门操作仅在成功响应目标匹配且格式合法时附实际`doorOpen/doorVersion`，拒绝不附、不会采用请求意图；参见[发现](permissions.zh-CN.md)。不能凭没有日志声称用户没点，或凭accepted声称对方已看见。 |
| 网络中断、进程被杀、未到达服务器、响应丢失 | 不一定有完成日志。无匹配事件只说明未找到证据，不证明是权限拒绝或没有写入。已持久化但响应丢失也可能出现。 |
| 文件写入失败 | 尽量继续stdout并报告storage unavailable；本地stdout也受诊断轮转限制。若业务日志与诊断都无记录，标证据缺失，不把故障抹成成功。 |

## 有限时间窗导出（演练发生后才执行）

先记录准确UTC起止，结束后尽快保存，避免轮转丢失。仅把下列两个业务文件复制到私有演练目录（缺失`.1`正常）；不要复制整个.data、SQLite、key、HAR、浏览器profile或诊断日志。以下从规范目录运行，目录已存在会拒绝，避免覆盖旧证据：

```sh
mkdir -m 700 .data/crit10-capture
cp .data/midpoint/little-worlds.sqlite.business.jsonl .data/crit10-capture/current.jsonl
if test -f .data/midpoint/little-worlds.sqlite.business.jsonl.1; then
  cp .data/midpoint/little-worlds.sqlite.business.jsonl.1 .data/crit10-capture/previous.jsonl
fi
```

复制期间仍可能轮转，两个文件不是原子快照；检查时间覆盖，有缺口或重复就注明，不把导出条数当准确操作总数。不停服务器、不改库来补证据。原副本只留私有目录。

下列命令只读副本，筛实际时间窗，把稳定别名及目标ID重标为本次P/W/O编号，只输出允许字段；不会写SQLite或读取key。先在命令中替换两个UTC占位时间；不是现成演练证据。

```sh
python3 - '<开始ISO时间，例如YYYY-MM-DDTHH:MM:SSZ>' '<结束ISO时间>' <<'PYCODE'
import datetime as dt, json, re, sys
from pathlib import Path
def stamp(s):
    value = dt.datetime.fromisoformat(s.replace('Z', '+00:00'))
    if value.tzinfo is None: raise ValueError('Use an explicit timezone')
    return value
start, end = map(stamp, sys.argv[1:])
assert start < end
base = Path('.data/crit10-capture')
actors, worlds, objects = {}, {}, {}
def label(mapping, key, prefix):
    if key not in mapping: mapping[key] = prefix + str(len(mapping) + 1)
    return mapping[key]
rows, skipped = [], 0
for name in ['previous.jsonl', 'current.jsonl']:
    path = base / name
    if not path.exists(): continue
    for line in path.read_text().splitlines():
        try:
            e = json.loads(line); time = stamp(e['at'])
            if start <= time <= end: rows.append((time, e))
        except (ValueError, KeyError, TypeError): skipped += 1
# Fixed business-field vocabularies; no arbitrary body/error text is exported.
ACTIONS = set('api.unknown blueprint.read blueprint.saved coat.changed delivery.interacted flight.checkpoint flight.departed flight.landed gate.travelled ground.walked history.read history.snapshot home.door home.entered home.exited home.paths.applied home.paths.preview home.remodelled home.saved home.setup.confirmed home.setup.preview home.undo home.walked object.created object.deleted object.replaced object.undo object.updated planet.claimed presence session.created session.resumed ship.saved station.built station.preview terrain.applied travel.withdrawn world.read'.split())
REASONS = set('server_error gate_destination_refused gate_owner_required gate_proximity_required history_owner_required home_owner_required home_required identity_required invalid_request json_required method_refused not_found one_home_per_identity permission_refused planet_already_claimed planet_owner_required preparation_unavailable rate_limited request_too_large route_withdrawn stale_flight_checkpoint stale_ground_checkpoint state_conflict'.split())
uuid = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
out = []
for time, e in sorted(rows, key=lambda item: item[0]):
    actor = e.get('actor', '')
    if e.get('v') != 1 or not isinstance(e.get('action'), str) or e.get('action') not in ACTIONS or e.get('result') not in ('accepted', 'refused', 'failed') or type(e.get('status')) is not int or not 100 <= e['status'] < 600 or not isinstance(actor, str) or not (actor == 'anonymous' or re.fullmatch(r'visitor-[a-f0-9]{20}', actor)):
        skipped += 1; continue
    row = {'tSeconds': round((time-start).total_seconds(), 3),
           'actor': 'anonymous' if actor == 'anonymous' else label(actors, actor, 'P'),
           'action': e['action'], 'status': e['status'], 'result': e['result']}
    planet, obj = e.get('planet'), e.get('object')
    if planet == 'hub': row['planet'] = 'hub'
    elif isinstance(planet, str) and re.fullmatch('p-' + uuid, planet, re.I): row['planet'] = label(worlds, planet, 'W')
    if isinstance(obj, str) and re.fullmatch(uuid, obj, re.I): row['object'] = label(objects, obj, 'O')
    if e.get('detail') in ('clay', 'fern', 'sky', 'pickup', 'deliver'): row['detail'] = e['detail']
    if isinstance(e.get('reason'), str) and e.get('reason') in REASONS: row['reason'] = e['reason']
    if row['action'] == 'home.door' and 200 <= row['status'] < 300 and row['result'] == 'accepted' and 'object' in row and type(e.get('doorOpen')) is bool and type(e.get('doorVersion')) is int and 0 <= e['doorVersion'] <= 9007199254740991:
        row['doorOpen'], row['doorVersion'] = e['doorOpen'], e['doorVersion']
    out.append(json.dumps(row, ensure_ascii=False))
with (base / 'events.anonymized.jsonl').open('x') as file:
    file.write(''.join(line + '\n' for line in out))
print('Exported', len(out), 'records; skipped malformed/unsupported', skipped)
PYCODE
```

P编号按时间窗内首次事件分配，不代表座位顺序；author可私下关联，不能猜P1就是第一位同学。导出不去重，避免把同毫秒合法事件合并；如因轮转出现重复，保留来源限制说明。别名和目标虽已重标，这仍是可关联的化名观察数据，不能承诺不可识别个人。

人工复核导出和[空白记录](observation-template.zh-CN.md)：只选与结论相关的片段，包含拒绝/失败和未知，不选择性删除；截图裁掉姓名、通知、开发工具凭据。公开前只考虑`events.anonymized.jsonl`、无身份文字和裁切图，私下复核并取得分享同意。原业务日志、key、库和P↔姓名映射不进入Git/共享；导出也默认在gitignored目录，本轮不生成、不上传。若以后将审核片段纳入docs/evidence，应单独检查暂存范围、附真实时间窗/版本/删节与丢失说明，再提交；这些准备文件本身不是演练证据。
