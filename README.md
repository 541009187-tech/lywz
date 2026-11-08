# 留言墙 · Cloudflare Pages 动态版

便签风格的留言墙，页面 + 后端函数（Pages Functions）+ KV 存储，**没有 SQL 数据库**。

## 跟仓库的关系

- `index.html`：网页本体（便签墙），放在仓库根目录，等于站点首页。
- `style.css` / `admin.css` / `reply.css`：便签墙样式、管理员样式、回复样式。
- `wall.js`：前端逻辑（读写接口、渲染便签、点赞、回复、管理员）。
- `functions/api/[[path]].js`：后端接口，部署后自动变成 `/api/*`。
- 存储复用仓库原有的 KV 绑定 **`MSG_KV`**（`functions/msg.js` 用的就是它），所以**不需要新建数据库、不需要改绑定**。
- 新留言写在 KV 的 `wall:messages` 键里，不会动旧键 `msg_list`，以前那批留言还在。
- 旧的 `functions/msg.js` 保留没删，老接口 `/msg` 依然能用。

## 部署

仓库连着的 Pages 项目（`lywz-esc.pages.dev`）会在 push 到 `main` 后自动构建，等一两分钟就好，无需任何后台设置。

如果站点打不开或提示「后台还没绑定存储：KV 变量名要叫 MSG_KV」，检查：
项目 → 设置 → 绑定 → 是否有一个 KV 命名空间绑定，变量名是 `MSG_KV`；改完要重新部署一次。

## 管理员

- 名字固定为中文「管理员」。
- 密码不写在代码里：代码里只有默认密码的 SHA-256 摘要；想换密码，往 KV 写一个键
  `wall:admin_password`（值就是新密码明文），后端会优先用 KV 里的值。
- 登录后签发 32 位 token 存在 KV 的 `wall:admin_tokens`，有效期 7 天；退出登录会把这条 token 删掉。
- 管理员权限：撤下任何留言、撤下任何回复。

## 接口

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| GET | `/api/messages?limit=9&offset=0&order=new&q=&client_id=` | 读留言（带 `replies` 与 `reply_total`） |
| POST | `/api/messages` | 贴留言 `{name, content, color, client_id}` |
| POST | `/api/messages/<id>/like` | 点赞 `{client_id}`，同一人只算一次 |
| DELETE | `/api/messages/<id>` | 撤下留言，请求头带 `X-Delete-Token` 或 `X-Admin-Token` |
| POST | `/api/messages/<id>/replies` | 发回复 `{name, content, client_id}`，返回 `token` 与 `reply_total` |
| DELETE | `/api/messages/<id>/replies/<rid>` | 删回复，请求头带 `X-Delete-Token` 或 `X-Admin-Token` |
| POST | `/api/admin/login` | 管理员登录 `{name, password}` |
| POST | `/api/admin/logout` | 退出，请求头带 `X-Admin-Token` |
| GET | `/api/admin/check` | 校验管理员凭证是否有效 |

## 说明

- 留言上限：代码里保留最近 3000 条，KV 单值上限 25MB。
- 回复：一条留言最多 30 条回复，单条 120 字。
- 防刷：前端限制 200 字，后端二次裁剪；同一访客点赞只计一次。
- 点赞、撤下凭证都在浏览器 localStorage 里，换浏览器就没了，属正常现象。
- 本地预览：`npx wrangler pages dev . --kv MSG_KV`（需要 Node）。
