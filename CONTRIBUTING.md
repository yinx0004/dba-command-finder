# 参与贡献

网站的内容都在 `data/` 里，页面由构建脚本生成。补一条对照、改一个版本号，都只需要改 YAML，不用改代码。

- [数据在哪里](#数据在哪里)
- [一条记录怎么写](#一条记录怎么写)
- [增加、修改、删除](#增加修改删除)
- [验证 lab](#验证-lab)
- [部署](#部署)

## 数据在哪里

```
data/
  mappings/<category>/<id>.yaml   # 一件运维任务一个文件
  databases.yaml                  # 收录的数据库、各自的角色和 lab 验证的版本
  categories.yaml                 # 类别和顺序
  site.yaml                       # 默认对照的两个库，以及首页翻译器的「试试」示例
  redirects.yaml                  # 改名、合并后，旧链接跳转到哪里
```

字段的完整定义见 [src/lib/schema.ts](src/lib/schema.ts)，完整的例子见 [data/mappings/session/list-active-sessions.yaml](data/mappings/session/list-active-sessions.yaml)。

## 一条记录怎么写

一条记录对应一件 DBA 要做的事，例如「查看正在执行的会话」。**每个数据库各写一段**，写在 `databases.<数据库>` 下面。任意两个库之间的对照在构建时组合出来，所以加一个数据库，只要在相关记录里各加一段，不用为每一对库单独写。

### 能不能做到：`support`

| 值 | 含义 |
|---|---|
| `full` | 能完整做到 |
| `partial` | 能做，但输出或语义有差别；差别写在这个库的 `notes` 里 |
| `none` | 做不到。`commands` 留空，`notes` 写原因，`alternatives` 写可以改看什么 |

没写某个数据库，表示还没收录，页面上显示「未收录」，不等于做不到。

两个库之间的对照标签由双方的 `support` 推出：
- 两边都是 `full`：显示「等价」；
- 目标库是 `none`：显示「无对应」；
- 其他情况：显示「近似」。

### 版本：`since`、`deprecated_in`、`removed_in`

每条命令都可以标这三个版本，版本号都是该数据库自己的版本号。

| 字段 | 含义 |
|---|---|
| `since` | 从哪个版本开始有 |
| `deprecated_in` | 从哪个版本开始废弃，还能用，页面上会标出来 |
| `removed_in` | 从哪个版本开始不能用 |

旧版本的命令不要删，读者可能还在用旧版本。

读者在页面上选了自己的版本以后：
- 用不了的命令会划掉，并写明原因；
- 只有该版本线较新的补丁里才有的命令，会标「需要 8.0.22 及以上」；
- 搜索结果、类别页和翻译器只给出这个版本能用的写法。

版本选择保存在浏览器里。链接里带 `?mysql=5.7&mongodb=6.0` 时以链接为准，方便把筛选好的页面发给别人。判断逻辑在 [src/lib/version.ts](src/lib/version.ts)，有单元测试。

### 输出字段：`fields`

如果这件事有输出字段，在顶层的 `fields` 里给每个字段定一个和数据库无关的 id，再在各数据库的 `fields` 里写它自己的字段名，字段对照表就会自动生成。

### 在哪个进程上执行：`on`

有的数据库不止一种进程，例如 MongoDB 的 mongod、mongos 和 config server，Redis 的单机、集群和 Sentinel，PostgreSQL 的主库和备库。这些角色登记在 [data/databases.yaml](data/databases.yaml) 的 `roles` 里。命令用 `on` 写明能在哪些角色上执行，页面会在命令旁边显示角色标签：

```yaml
- cmd: db.serverStatus().connections
  on: [mongod, mongos, configsvr]
```

不写 `on` 就不显示标签。各角色写法相同的命令只写一条，列出所有角色；写法不同时分成几条，各自标上角色。

### 写法约定

- SQL 关键字一律大写。函数名和类型跟随各库的官方手册：MySQL 写 `COUNT()`、`BIGINT`，PostgreSQL 写 `count()`、`bigint`。
- 标识符按真实名字写，不要改大小写。MySQL 会把 SQL 里写的名字原样作为输出的列名，字段核对靠的就是这个。
- 需要读者替换的部分写成 `<table>`、`<user>` 这样的占位符。

`npm test` 会检查 SQL 关键字的大小写。

## 增加、修改、删除

| 操作 | 做法 |
|---|---|
| 新增 | `npm run new -- <category>/<id>` 生成模板，填完所有 TODO |
| 修改 | 直接改 YAML；每个条目页底部都有「在 GitHub 上编辑此页」 |
| 改名、换类别、合并 | 移动或合并文件，并在 `data/redirects.yaml` 加一条 `from` / `to`，旧链接会跳到新页面 |
| 删除 | 一般不删：设 `status: deprecated`，有替代条目时填 `replaced_by`。只有内容本身写错才删文件，同时加跳转 |

`npm test` 会检查：

- 字段是否符合 schema；
- 文件名和 `id`、目录和 `category` 是否一致；
- `related`、`replaced_by`、`alternatives.see`、跳转引用的条目是否存在；
- 是否还留着 TODO；
- SQL 关键字是否大写；
- README 徽章上的版本是否和 `data/databases.yaml` 一致；
- [tests/search-golden.yaml](tests/search-golden.yaml) 里的搜索用例是否仍然排在第一。改了关键词或搜索逻辑后结果变了，这里会报出来。遇到搜不到或排序不对的情况，请在这里加一条用例。

## 验证 lab

页面上的每条命令都会在真实数据库上**原样执行**。要验证的版本写在 [data/databases.yaml](data/databases.yaml) 的 `lab_versions` 里。

| 数据库 | 怎么执行 | 怎么判断成败 |
|---|---|---|
| MySQL | `mysql` 命令行 | 退出码 |
| MongoDB | 镜像自带的 `mongosh` | 退出码 |
| Redis | `redis-cli`，命令从标准输入送入，一行一条 | 输出里有没有 `ERR`、`WRONGTYPE`、`NOPERM` 这类错误前缀，因为 `redis-cli` 碰到错误回复也返回 0 |
| PostgreSQL | `psql`，遇到错误立即停止 | 退出码。启动时带 `shared_preload_libraries=pg_stat_statements` 和 `wal_level=logical`，和常见的生产配置一致 |

### 规则

- 版本在 `since` 和 `removed_in` 之间：命令必须执行成功。
- 早于 `since`，或从 `removed_in` 起：命令必须报错。这样版本区间写错也能被发现。
- 字段对照里的字段名必须出现在命令的实际输出里。这里指 `opid`、`connections.current` 这类普通字段名或点路径；「COLLSCAN 阶段」这类描述性写法不检查。验证通过的字段名旁边会显示 ✓。

字段检查只确认字段名出现在输出里，不确认它出现在哪一行。例如 `effectiveUsers` 只出现在内部线程上，客户端连接上没有，这种情况要用 `skip` 写明。

### 本地运行

需要 Docker。

```bash
npm run lab                                   # 全部数据库和版本
npm run lab -- --db mysql --version 8.0       # 只跑一个版本
npm run lab -- --db mysql --only explain      # 只跑一条记录（不写入结果）
npm run lab:merge                             # 汇总结果；之后 npm run build，页面会显示验证过的版本
```

本地跑不了的情况：
- **Apple Silicon**：MySQL 5.7 镜像只有 amd64 版本，会通过模拟运行，比较慢。
- **MongoDB 8.0**：最新镜像拒绝在 Linux 内核 6.19 到 7.0.13 上启动。如果 Docker（例如 OrbStack）的内核在这个范围内，本地跑不了 8.0，CI 不受影响。

### 准备数据：`verify`

命令里有 `<table>` 这类占位符，或者执行前需要先准备数据时，在该数据库那一段加 `verify`：

```yaml
mysql:
  commands:
    - cmd: SHOW INDEX FROM <table>;
  verify:
    setup: CREATE TABLE t (id INT PRIMARY KEY, a INT, KEY idx_a (a));
    vars: {table: t}
    # teardown: ...   # 最后执行，出错不影响结果
```

每条记录都在一个单独的空库里执行，占位符 `<db>` 会自动填成这个库的名字。Redis 没有按名字区分的库，所有记录都用 0 号库。

### 特殊情况

| 情况 | 怎么写 |
|---|---|
| 命令行工具（`mysqldump`、`mongodump`、`pg_dump`……） | 给命令加 `shell: true`，lab 会在容器里用 bash 执行。MySQL 容器里已经写好 `~/.my.cnf`，命令不用带 `-u`、`-p`。需要先准备文件（例如恢复前先有一份备份）时，用 `verify.setup_shell` |
| 没法自动执行的命令（例如 `KILL` 需要另一个连接） | 加 `skip: {zh: 原因}`，页面上会显示「未自动验证」和原因 |
| 只能在 lab 没有的角色上执行 | lab 只跑 `roles` 里标了 `lab: true` 的角色：MongoDB 副本集、Redis 单机、PostgreSQL 主库。`on` 里没有这些角色的命令会被自动跳过，页面上显示 `roles_unverified` 写的原因，不用再写 `skip` |
| 准备步骤在旧版本上会失败 | 如果一条记录的命令在某个版本上全都应该报错（例如 Redis 8.0 才有的 `FT.*`），它的 `setup` 在那个版本上失败也不算失败。只要有一条命令应该成功，`setup` 就必须成功 |
| 某个字段没法检查 | 在字段名后面加 `skip: {zh: 原因}`。整条记录的字段都查不了（例如只有从库上才有）时，用 `verify.skip_fields` |
| 字段从某个版本起才出现 | 给字段加 `since`，更早的版本上就不检查它 |

## 部署

推送到 `main` 后，GitHub Actions 依次运行测试、每个数据库版本的 lab 和构建，全部通过后发布到 GitHub Pages。任何一个 lab 失败都不会部署，所以线上不会出现没通过验证的命令。PR 上跑同样的检查，只是不部署。
