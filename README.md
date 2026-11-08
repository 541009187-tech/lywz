# 留言墙 · Cloudflare Pages 动态版

便签风格的留言墙，页面 + 后端函数（Pages Functions）+ KV 存储，**没有 SQL 数据库**。

## 文件

- `index.html`：网页（便签墙）
- `style.css`：样式
- `wall.js`：前端逻辑
- `functions/api/[[path]].js`：后端接口，部署后自动变成 `/api/*`
- `functions/msg.js`：原来的旧接口，保留没删

## 存储

复用仓库原有的 KV 绑定 **`MSG_KV`**，不需要新建数据库、不需要改绑定。

新留言写在 KV 的 `wall:messages` 键里，不动旧键 `msg_list`，以前那批留言还在。

## 部署

仓库连着的 Pages 项目（`lywz-esc.pages.dev`）会在 push 到 `main` 后自动构建，等一两分钟即可。

如果提示「后台还没绑定存储：KV 变量名要叫 MSG_KV」，检查：
项目 → 设置 → 绑定 → 是否有 KV 命名空间绑定，变量名是 `MSG_KV`；改完要重新部署一次。

## 接口

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/messages?limit=9&offset=0&order=new&q=&client_id=` | 读留言 |
| POST | `/api/messages` | 贴留言 `{name, content, color, client_id}` |
| POST | `/api/messages/<id>/like` | 点赞 `{client_id}`，同一人只算一次 |
| DELETE | `/api/messages/<id>` | 撤下，请求头带 `X-Delete-Token` |

## 备注

- 最多保留最近 3000 条留言；KV 单值上限 25MB。
- 点赞、撤下凭证存在浏览器 localStorage，换浏览器就没了。
