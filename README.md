# DBA Command Finder

MySQL 运维命令在 MongoDB 里怎么做？输入一条 MySQL 命令、MongoDB 命令或中文关键词，查到对应写法、输出字段对照、版本差异和注意事项。没有等价命令时会明确说明，并给出可以改看的信号。

网站：<https://yinx0004.github.io/dba-command-finder/>

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

版本差异用 `since`（从哪个版本开始有）和 `until`（从哪个版本开始没有）表示，版本号指该数据库自己的版本。不要删掉旧版本的命令。

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

## 部署

推送到 `main` 后，GitHub Actions 运行测试、构建，并发布到 GitHub Pages。第一次使用前，需要在仓库的 Settings → Pages 里把 Source 设为 GitHub Actions。

## 许可

[Apache-2.0](LICENSE)
