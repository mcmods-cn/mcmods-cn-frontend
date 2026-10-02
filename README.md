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
