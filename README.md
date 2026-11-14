# DBA Command Finder

MySQL 运维命令在 MongoDB 里怎么做？输入一条 MySQL 命令、MongoDB 命令或中文关键词，查到对应写法、输出字段对照、版本差异和注意事项。没有等价命令时会明确说明，并给出可以改看的信号。

网站：<https://www.solidstack.io/dba-command-finder/>

*A lookup site for DBAs moving between MySQL and MongoDB. Chinese first; English pages will follow.*

## 本地运行

需要 Node.js 22.12 或更高版本。

```bash
npm install
npm run dev      # http://localhost:4321/dba-command-finder/
npm test         # 数据校验 + 搜索回归测试
npm run build    # 生成静态站点到 dist/
```

## 数据在哪里

所有内容都在 `data/` 里，页面由构建脚本生成，不需要改代码：

```
data/
  mappings/<category>/<id>.yaml   # 一条运维意图一个文件
  databases.yaml                  # 收录的数据库
  categories.yaml                 # 类别和顺序
  site.yaml                       # 网站展示哪一对数据库，以及首页「DBA 最常查的」
  redirects.yaml                  # 改名、合并后旧链接的跳转
```

一条记录对应一件 DBA 要做的事（例如「查看正在执行的会话」），**每个数据库各写一段**，写在 `databases.<数据库>` 下。任意两个数据库之间的对照由构建时组合出来，所以加一个数据库只要在相关记录里各加一段，不用为每一对数据库单独写。字段说明见 [src/lib/schema.ts](src/lib/schema.ts)，完整例子见 [data/mappings/session/list-active-sessions.yaml](data/mappings/session/list-active-sessions.yaml)。

每个数据库用 `support` 说明自己能不能完成这件事：

- `full`：能完整做到
- `partial`：能做，但输出或语义有差别，差别写在这个数据库的 `notes` 里
- `none`：做不到；`commands` 留空，`notes` 写原因，`alternatives` 写可以改看什么

没有写某个数据库，表示还没收录，页面上显示「未收录」，不等于「做不到」。

两个数据库之间的等价程度由双方的 `support` 推出：两边都是 `full` 显示「完全等价」，目标库是 `none` 显示「无等价」，其他情况显示「近似」。

如果这件事有输出字段，在 `fields` 里给每个字段定一个和数据库无关的 id，再在各数据库的 `fields` 里写它自己的字段名，字段对照表就会自动生成。

每条命令可以写三个版本字段，版本号都指该数据库自己的版本：

- `since`：从哪个版本开始有
- `deprecated_in`：从哪个版本开始过时（还能用，页面上标「已过时」）
- `removed_in`：从哪个版本开始不能用

不要删掉旧版本的命令，用户可能还在用旧版本。

### 在哪个进程上执行

有的数据库不止一种进程，例如 MongoDB 的 mongod、mongos 和 config server。这些角色登记在 [data/databases.yaml](data/databases.yaml) 的 `roles` 里，命令用 `on` 写明能在哪些角色上执行，页面会在命令旁显示角色标签：

```yaml
- cmd: db.serverStatus().connections
  on: [mongod, mongos, configsvr]
```

不写 `on` 就和以前一样，不显示标签。各角色写法相同的命令只写一条，列出所有角色；写法不同时分成几条，各自标上角色。

### 版本筛选

页面顶部的「我的版本」可以选 MySQL 和 MongoDB 的版本线，选项就是 `data/databases.yaml` 里的 `lab_versions`。选了之后：

- 意图页上，所选版本用不了的命令会变灰并说明原因；只在该版本线的较新补丁里才有的命令，会标「需要 8.0.22 及以上」；验证标记里自己的版本会加粗。
- 搜索结果、类别页和首页里，每条只显示所选版本能用的第一条命令。

选择保存在浏览器里。链接里带 `?mysql=5.7&mongodb=6.0` 时以链接为准，方便把筛选好的页面发给别人。判断逻辑在 [src/lib/version.ts](src/lib/version.ts) 的 `onLine` 和 `firstUsable`，有单元测试。

## 增加、修改、删除

| 操作 | 做法 |
|---|---|
| 新增 | `npm run new -- <category>/<id>` 生成模板，填完所有 TODO |
| 修改 | 直接改 YAML；每个页面底部有「在 GitHub 上编辑此页」 |
| 改名、换类别、合并 | 移动或合并文件，并在 `data/redirects.yaml` 加一条 `from`/`to`，旧链接会跳到新页面 |
| 删除 | 一般不删：设 `status: deprecated`，有替代条目时填 `replaced_by`。只有内容本身写错才删文件，同时加跳转 |

`npm test` 会检查：

- 字段是否符合 schema
- 文件名和 `id`、目录和 `category` 是否一致
- `related`、`replaced_by`、`alternatives.see`、跳转和首页推荐引用的条目是否存在
- 是否还有 TODO
- [tests/search-golden.yaml](tests/search-golden.yaml) 里的搜索用例是否仍然排在第一。改了关键词或搜索逻辑后结果变了，这里会报出来；遇到搜不到或排序不对的情况，请在这里加一条用例。

## 验证 lab

页面上的每条命令都会在真实数据库上**原样执行**：MySQL 用 `mysql` 命令行，MongoDB 用镜像自带的 `mongosh`，Redis 用 `redis-cli`（命令从标准输入送入，一行一条）。要验证的版本写在 [data/databases.yaml](data/databases.yaml) 的 `lab_versions` 里。

- 版本在 `since` 和 `removed_in` 之间：必须执行成功
- 早于 `since` 或从 `removed_in` 起：必须报错，这样版本区间写错也能被发现
- 字段对照表里的字段名（`opid`、`connections.current` 这类普通字段名或点路径）必须出现在命令的实际输出里。`COLLSCAN 阶段` 这类描述性写法不检查。页面上验证通过的字段名旁会显示 ✓

本地运行需要 Docker：

```bash
npm run lab                                   # 全部数据库和版本
npm run lab -- --db mysql --version 8.0       # 只跑一个版本
npm run lab -- --db mysql --only explain      # 只跑一条记录（不写入结果）
npm run lab:merge                             # 汇总结果，npm run build 时页面会显示验证过的版本
```

命令里有 `<table>` 这类占位符，或者需要先准备数据时，在该数据库那一段加 `verify`：

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

- **命令行工具**（`mysqldump`、`mongodump`、`mongoexport`……）：给命令加 `shell: true`，lab 会在容器里用 bash 执行。MySQL 容器里已经写好 `~/.my.cnf`，所以命令不用带 `-u`、`-p`。需要先准备文件时（例如恢复前先有一份备份），用 `verify.setup_shell`。
- **没法自动执行的命令**（例如 `KILL` 需要另一个连接）：给命令加 `skip: {zh: 原因}`，页面上会显示「未自动验证」和原因。
- **只能在 mongos 或 config server 上执行的命令**：lab 只有副本集（`roles` 里标了 `lab: true` 的角色）。`on` 里没有 mongod 的命令会被自动跳过，页面上显示 `roles_unverified` 写的原因，不用再写 `skip`。Redis 同理：lab 只跑单机 `redis-server`，集群（`on: [cluster]`）和 Sentinel（`on: [sentinel]`）的命令会被跳过。
- **Redis 命令的成败**：`redis-cli` 碰到错误回复也返回 0，lab 改看输出里有没有 `ERR`、`WRONGTYPE`、`NOPERM` 这类错误前缀。
- **没法检查的字段**：单个字段在字段名后面加 `skip: {zh: 原因}`；整条记录的字段都查不了（例如只有从库上才有的字段），用 `verify.skip_fields`。某个字段从某个版本起才出现在输出里时，给它加 `since`，更早的版本上就不检查它。

字段检查只确认字段名出现在输出里，不确认它出现在哪一行。例如 `effectiveUsers` 只出现在内部线程上，客户端连接上没有，这种情况要靠 `skip` 写明。

在 Apple Silicon 上，MySQL 5.7 镜像只有 amd64 版本，会通过模拟运行，比较慢。最新的 MongoDB 8.0 镜像拒绝在 Linux 内核 6.19 到 7.0.13 上启动，如果 Docker（例如 OrbStack）的内核在这个范围内，本地跑不了 8.0，CI 不受影响。

## 部署

推送到 `main` 后，GitHub Actions 依次运行测试、每个数据库版本的 lab、构建，全部通过后发布到 GitHub Pages。任何一个 lab 失败都不会部署，线上不会出现没通过验证的命令。PR 上跑同样的检查，只是不部署。

## 许可

[Apache-2.0](LICENSE)
