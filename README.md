# Mcmods-cn Frontend

Mcmods-cn 的 Next.js 前端，包含站点主页、登录、用户中心、后台管理和 Markdown 工具。

## 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- 正在运行的 `mcmods-cn-backend`

## 本地开发

```bash
npm install
npm run dev
```

默认访问地址为 <http://localhost:3000>，默认后端地址为 <http://localhost:8080>。

复制无凭据的示例文件后按环境修改：

```bash
cp .env.example .env.local
```

所有 `NEXT_PUBLIC_*` 值都会在构建期内联到浏览器产物，不能包含密码、令牌或其他秘密；修改后必须重新构建并重启。配置面如下：

| 变量 | 生产要求 | 用途 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | 必填 | 浏览器访问的后端 API 根地址；本地默认 `http://localhost:8080` |
| `NEXT_PUBLIC_SITE_URL` | 必填 | robots 与 sitemap 的公开站点 origin；本地默认 `http://localhost:3000` |
| `NEXT_PUBLIC_YGGDRASIL_API_ROOT` | 可选 | `X-Authlib-Injector-API-Location` 发现头；配置后自动补尾部 `/` |
| `NEXT_PUBLIC_ICONFONT_SYMBOL_URL` | 与 integrity 成对可选 | Iconfont Symbol 脚本地址 |
| `NEXT_PUBLIC_ICONFONT_SYMBOL_INTEGRITY` | 与 URL 成对可选 | 固定脚本的单个 SHA-384 SRI 摘要 |
| `NEXT_PUBLIC_CSP_CONNECT_ORIGINS` | 可选 | 浏览器额外外连 origin；直传 OSS 时列出每个签名上传 origin |
| `NEXT_PUBLIC_CSP_IMAGE_ORIGINS` | 可选 | 内建图片来源之外的额外图片/CDN origin |
| `NEXT_PUBLIC_CSP_MEDIA_ORIGINS` | 可选 | 允许的外部音视频 origin；默认无外部来源 |
| `NEXT_PUBLIC_CSP_FONT_ORIGINS` | 可选 | 允许的外部字体 origin；默认无外部来源 |

生产构建要求 API 和站点地址为绝对 HTTPS URL，且不得包含凭据、查询参数或 fragment；站点地址只能是 origin。Yggdrasil 地址若配置也必须符合相同安全限制。任一必填项缺失或格式无效都会让构建失败，不再静默生成错误的发现头、robots 或 sitemap。

`NEXT_PUBLIC_ICONFONT_SYMBOL_URL` 必须是 Iconfont 项目生成的精确 `https://at.alicdn.com/t/c/font_*.js` Symbol 链接，而不是 `iconfont.cn` 首页。下载脚本后，用它唯一的 SHA-384 SRI 值固定在 `NEXT_PUBLIC_ICONFONT_SYMBOL_INTEGRITY`；只配置其中一项或任一格式无效时，启动会关闭失败。共享图标组件使用 `icon-playground`、`icon-drawio`、`icon-permissions`、`icon-edit`、`icon-expand` 和 `icon-swap` 等 Symbol ID；对应 Symbol 可用前仍保留可读回退。

CSP来源变量使用逗号分隔的精确origin（例如`https://bucket.oss-cn-beijing.aliyuncs.com`），不接受路径、凭据、查询参数、通配主机或`https:`整类来源；生产只接受HTTPS。`connect-src`默认仅含本站、API和Turnstile，直传OSS的单段及分片URL origin必须在部署时加入`NEXT_PUBLIC_CSP_CONNECT_ORIGINS`。图片内建闭集为本站/API、`oss.mcmods.cn`、GitHub头像/原始资源、Modrinth、Forge CDN和Minecraft纹理；其他业务CDN须显式加入图片列表。媒体和字体没有任意HTTPS回退。变量均为公开构建配置，不得放入凭据。

PlantUML 渲染默认关闭，浏览器只会请求同站的 `/plantuml/svg/...` 路径，不内建任何公共 PlantUML 服务。需要启用时，部署方必须把 `/plantuml` 反向代理到自己控制的自建 PlantUML 实例，并确认代理不会把图表源码转发给第三方；管理端不能改为外部绝对 URL。独立 PlantUML 工具也使用相同的同站路径。

## 常用命令

```bash
npm run check
npm run build
npm run start
```

- `check`：运行 ESLint 和 TypeScript 类型检查。
- `build`：创建生产构建。
- `start`：启动已生成的生产构建。

项目统一使用 npm，并提交 `package-lock.json` 以保证依赖版本可复现。

## 编辑与浏览器偏好

更新日志编辑器允许临时清空更新时间；提交时才检查有效时间，不会在输入过程中使页面崩溃。切换界面语言会刷新分类名称，保留当前未保存的版本、正文和时间；切换到其他更新日志会建立独立编辑状态。保存失败时保留输入，供用户修正或重试。

模组、整合包、其他大型项目及 Markdown 演练场在切换界面语言时保留未保存的内容；资源切换建立独立编辑状态。导入轮询在离开编辑页面后取消本页请求。浏览器禁用持久存储时，访客 Markdown 草稿仅在当前标签页保留，界面会明确提示关闭或刷新可能丢失。

社区文章翻译由用户主动触发；客户端轮询有 90 秒上限，离开文章或切换目标语言会取消本页请求，迟到结果不能替换其他文章或语言的正文。已有原文在失败或超时时继续展示。取消客户端请求不代表取消已经在后端入队的任务或供应商请求。

资料统计使用界面词条与语言格式化数字，浏览器拒绝会话存储时仍可展示页面，并以有界内存集合保留本标签页的访问去重。

个人设置分别保存昵称、签名、时区和名片统计位置，不覆盖其他尚未提交的编辑。收藏夹已有删除确认及默认收藏夹保护；创建、删除和公开状态变更期间防止重复提交，失败时保留列表以供重试。

管理员 AI 成本页在后端返回 `requestBudget` 时增加最近 30 天的请求预留和结算明细。`reserved` 为请求前预留，`settled` 为供应商返回用量后的结算，`usage_unknown` 表示未取得实际用量；未知用量保留保守估算，不能视作免费。人民币费用以管理员配置的模型价格计算，未与真实供应商账单核对。旧后端缺少此字段时保留原统计并明确提示预算统计不可用。

语言和主题可以在桌面页头或移动端页头的设置菜单中切换。浏览器拒绝本地存储时，本标签页仍能切换主题和语言、发起请求；关闭页面后偏好可能无法保留。主题使用服务端一致的首屏快照，再读取浏览器偏好，且响应系统主题和其他标签页的主题设置变化。

`npm run test:browser` 包含更新日志的空时间校验、语言切换保留修改、禁用浏览器存储以及移动端键盘切换场景。这些场景使用真实生产前端与明确的 API fixtures，用于验证界面恢复行为，不代替数据库持久化和真实前后端联通验证。运行前先执行生产构建并安装 Playwright Chromium。

发布容器 workflow 从仓库 Variables 读取上表的全部公开构建参数，Dockerfile 在构建阶段显式接收这些值。未配置的可选值保持空；Yggdrasil 发现头可省略。CSP 与图标脚本配置同样需要重新构建镜像，不能仅在已生成容器运行时注入。

认证客户端按会话代际处理 `/auth/me`，退出、跨标签会话变化或新登录后，旧请求的迟到响应不会恢复过期用户。认证事件由浏览器模块统一处理：同一跨标签事件只失效一次并共享一次读取，完成后发布给所有已挂载组件；退出立即发布空会话，不在退出请求清理 cookie 前重新读取旧身份。UI 词条使用 `{name}` 的简单插值（不是 ICU）；插值只做一次，参数值中的占位符作为普通文本保留。本地覆写仅接受非空字符串，损坏的 localStorage 内容回退到内建词条。短链接导航仅接受本站 HTTP(S) 目标，并保留路径、查询参数和 fragment；无效目标显示可重试错误。

创作者认领及项目编辑员申请在部分附件上传失败后保留成功文件的 ID；逐项重试仅上传失败项，申请提交失败后保留证明文字和附件供重试。上传或提交期间暂时禁止编辑、关闭和重复操作，账号或目标变化会创建独立的申请实例。离页后不再上传该批次下一文件，也不把迟到结果写入新申请；当前已发出的对象存储请求不承诺取消，已上传的真实文件仍遵循现有文件管理与清理规则。

更新日志的分类独立按每页 100 项读取，存在更多分类时提供“加载更多分类”。后续页失败可以重试，当前选择及未保存编辑保持不变；编辑已有日志时，即使当前分类不在第一页也继续显示。界面语言变化重新读取该语言的第一页和游标，保留后页已选分类，不把不同项目或语言的游标混用。该补全需要后端分类分页接口及首屏分页标识，旧后端没有标识时继续使用原首屏列表；无需数据库迁移。
