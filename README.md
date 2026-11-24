# MCMods-cn 前端

Minecraft 百科与资源社区的 Next.js App Router 应用。游客可浏览项目、教程、讨论、资料、配方和媒体。登录用户按服务端权限投稿、编辑或审核。游戏客户端导出 ZIP，用户在资料工作区选择目标版本并上传，后端校验并导入，资料经独立审核或已授权的发布流程后公开展示。[游戏导出 Mod](https://github.com/mcmods-cn/mcmods_exporter) · [Go API 与 Worker](https://github.com/mcmods-cn/mcmods-cn-backend)

## 本地开发

CI 与发布容器使用 Node.js **24.19.0**。本轮验证使用 npm **11.17.0**、Next **16.4.6**、React **19.2.4**。使用锁文件安装依赖。在准备修改 Next 入口、路由或组件前，阅读本版本随包提供的文档。[项目约定](AGENTS.md)

在 `localhost:8080` 启动后端，并将其 `FRONTEND_ORIGIN` 设为 `http://localhost:3000`。浏览器和 Next 服务端都需要能够访问配置的 API 地址。启动后可检查后端就绪状态并访问首页。[后端就绪检查](http://localhost:8080/ready) · [前端首页](http://localhost:3000)

```bash
npm ci
cp .env.example .env.local
npm run dev
```

后端 README 的隔离示例分别使用 API `http://127.0.0.1:8081` 和前端 `http://127.0.0.1:3001`。采用该示例时，在 `.env.local` 同步 API、站点与可选 Yggdrasil 地址，用 `npm run dev -- --hostname 127.0.0.1 --port 3001` 启动前端。浏览器访问和后端允许的前端 origin 使用同一组地址。

## 修改入口

| 需求 | 从这里开始 |
| --- | --- |
| 页面与分类检索 | `app/` 下的 `page.tsx` 连接领域组件。首页的分类只导航到已有目录，筛选、游标和历史由目录管理。见 [首页](app/_components/home-page.tsx)、[目录状态](app/_lib/catalog-state.ts) |
| 新 API、权限显示和会话 | 在 `app/_lib/*-api.ts` 中定义领域类型和操作，调用 [apiRequest / backendFetch](app/_lib/api.ts)。登录用户和有效权限来自 [auth](app/_lib/auth.ts)。实际读写及项目范围检查由 Go API 执行 |
| 资料与批量导入 | [资料工作区](app/_components/mod-content-workspace.tsx) → [导入面板](app/_components/mod-catalog-data.tsx) → [ZIP 预检、上传、任务](app/_lib/mod-export-api.ts)。复用 [上传器](app/_lib/oss-upload.ts)、[按账号和版本恢复](app/_lib/mod-export-upload-store.ts)、[可取消轮询](app/_lib/job-polling.mts)。使用 exporter 仓库的 schema 和样例协调字段变更 |
| 编辑与展示 | [编辑器外壳](app/_components/editor/editor-shell.tsx)、[文件选择与拖放](app/_components/file-drop-zone.tsx)、[共享配方卡](app/_components/unified-recipe-card.tsx)、[Markdown](app/_components/markdown-renderer.tsx)。Three.js 模型与皮肤视图位于 `components/` |
| 后台与翻译 | 在 [面板定义](app/_components/admin-panels.tsx) 注册入口、可见条件和编辑能力，按权限和领域 API 取数。界面词条在 [八套词典](app/_locales)，支持简单 `{name}` 插值。[后台数据保护](docs/admin-data-integrity.md) · [表单、缓存和失败恢复](docs/frontend-state-recovery.md) |

## 浏览器可见的构建配置

所有 `NEXT_PUBLIC_*` 值都会在构建期内联到浏览器产物，修改后必须重新构建并部署。数据库密码、OSS 密钥、邮件和 AI 供应商凭据属于后端的私密运行配置。

| 变量 | 生产要求 | 用途 |
| --- | --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | 必填 | 浏览器访问的后端 API 根地址，本地默认 `http://localhost:8080` |
| `NEXT_PUBLIC_SITE_URL` | 必填 | robots 与 sitemap 的公开站点 origin，本地默认 `http://localhost:3000` |
| `NEXT_PUBLIC_YGGDRASIL_API_ROOT` | 可选 | `X-Authlib-Injector-API-Location` 发现头，配置后自动补尾部 `/` |
| `NEXT_PUBLIC_ICONFONT_SYMBOL_URL` | 与 integrity 成对可选 | Iconfont Symbol 脚本地址 |
| `NEXT_PUBLIC_ICONFONT_SYMBOL_INTEGRITY` | 与 URL 成对可选 | 固定脚本的单个 SHA-384 SRI 摘要 |
| `NEXT_PUBLIC_CSP_CONNECT_ORIGINS` | 可选 | 浏览器额外外连 origin，直传 OSS 时列出每个签名上传 origin |
| `NEXT_PUBLIC_CSP_IMAGE_ORIGINS` | 可选 | 内建图片来源之外的额外图片/CDN origin |
| `NEXT_PUBLIC_CSP_MEDIA_ORIGINS` | 可选 | 允许的外部音视频 origin，默认无外部来源 |
| `NEXT_PUBLIC_CSP_FONT_ORIGINS` | 可选 | 允许的外部字体 origin，默认无外部来源 |

生产构建需要绝对 HTTPS 地址。站点地址只接受 origin。API 和可选 Yggdrasil 地址允许路径，均禁止凭据、查询参数和 fragment。配置错误会终止构建。

例如 API 根地址配置为 `https://gateway.example.test/service` 时，浏览器、站点标题和 Logo 访问均使用 `/service/api/v1/...`。反向代理应转发该前缀下的请求到对应 API 路由，并保留请求方法、授权头及响应状态。

后端为 `mcmods_session` 设置 `Path=/api/`。使用 `/service` 前缀时，代理需将该 Cookie 的路径调整为 `/service/api/`，并保留 `Secure`、`HttpOnly` 和 `SameSite`。验收时使用实际代理完成登录、`/auth/me` 与退出，确认 Cookie 只发往对应 API 路径。

使用图标 Symbol 时填写形如 `https://at.alicdn.com/t/c/font_*.js` 的精确地址，以及对应文件的 SHA-384 SRI 摘要。只配置其中一项会导致配置校验失败。Symbol 加载前页面保留文字回退。

CSP 允许的来源使用逗号分隔的精确 origin，例如 `https://bucket.oss-cn-beijing.aliyuncs.com`。生产环境只接受 HTTPS。默认连接范围含本站、API 和 Turnstile，OSS 单段与分片签名使用的 origin 都要加入 `NEXT_PUBLIC_CSP_CONNECT_ORIGINS`。默认图片来源含本站、API、`oss.mcmods.cn`、GitHub 头像与原始资源、Modrinth、Forge CDN 和 Minecraft 纹理。额外 CDN、外部媒体和字体使用表中的专用配置。[CSP 实现](app/_lib/csp-policy.mts)

PlantUML 默认关闭。启用时将同站的 `/plantuml` 反向代理到自建 PlantUML 服务，确保图表源文停留在部署方控制的系统中。浏览器渲染与独立绘图页面都使用同站路径。

## 验证与发布

```bash
npm run check
npm test
export NEXT_PUBLIC_API_BASE_URL=https://api.example.test
export NEXT_PUBLIC_SITE_URL=https://www.example.test
export NEXT_PUBLIC_YGGDRASIL_API_ROOT=https://api.example.test/api/yggdrasil/
npm run build
npx playwright install chromium
npm run test:browser
npm audit --audit-level=high
```

以上 `.test` 地址用于浏览器夹具。生产环境用实际的公开 HTTPS 地址。Chromium 套件启动本机 standalone 产物，由本地夹具供应合成身份、API 响应和事件。要连同原版火把像素用例一起运行，在完成生产构建后提供 Minecraft 1.20.1 的 `minecraft` 单命名空间、`all` 导出原 ZIP。该用例读取模板、背景及火把图标，在浏览器中检查工作台输出格。缺少原包时，该专项会跳过。[配方绘制验证](browser-tests/recipe-slot-pixels.browser.mts)

```bash
MCMODS_TEST_VANILLA_GEOMETRY_ZIP=/path/to/minecraft.zip npm run test:browser
```

### 版本与验收记录

发布前请按目标提交核对 GitHub Actions 中的构建、单元测试和 Chromium 结果。跨仓验收记录另行标注实际使用的前端产物、原始游戏包和外部服务。[前端 CI](https://github.com/mcmods-cn/mcmods-cn-frontend/actions/workflows/ci.yml) · [三仓验收台账](https://github.com/mcmods-cn/mcmods-cn-backend/blob/main/docs/governance.md#当前版本与验收)

下表记录 2026-11-23 对前端 `a71d99fb30227b5931468e078989b70ace882589` 的验收。`.test` 浏览器产物从 `e3015bb` 构建，之后两条提交仅调整实时消息与退出测试夹具，应用源码与锁文件逐文件一致。标准镜像在 `a71d99f` 单独构建。

| 检查 | 结果与运行范围 |
| --- | --- |
| `npm run check`、`npm test`、生产构建 | ESLint、TypeScript 和构建成功。418 项单元测试通过，零失败、零跳过 |
| `npm run test:browser` | 336 项通过，零失败、零跳过。使用 Playwright 1.62.1、Chromium `151.0.7922.34` 和合成 API。像素专项使用 `71e548a` 的 Fabric 开发原包，另含 9 项软件 WebGL 用例 |
| `npm run test:live` | 1 项通过，真实 Go API 和隔离 PostgreSQL 覆盖登录、收藏持久化、菜单退出及会话撤销。前端使用 Next 开发实例，控制器 `2861d71` 仅调整启动调度冲突检查，后端 Go 字节与 `db0acc9` 一致 |
| 站点隔离联调 | 标准前端镜像以 `nextjs`（UID 1001）启动，运行镜像 ID 为 `sha256:a26ee3a47387b16beb0008c980bcf6ca9451dfad4b5f21575bda6be6c4a8cafd`。可信本地 HTTPS `/service` 网关联通真实 API、PostgreSQL 18.6、Redis 和 JetStream |

早期 Chromium 运行曾因临时空间不足而失败。独立的前次完整套件另有两项软件 WebGL 超时，候选复跑全部通过。实体 GPU 和目标生产配置继续单独验收。账号回归可在同一隔离环境提供 `MCMODS_LIVE_FRONTEND_ORIGIN`、`MCMODS_LIVE_API_ORIGIN`、`MCMODS_LIVE_ACCOUNT` 和 `MCMODS_LIVE_PASSWORD` 后运行。使用合成账号，凭据仅存放于隔离运行环境。[账号测试](browser-tests/live-backend.mts) · [界面实拍](docs/ui/README.md)

真实资料链使用后端 `db0acc9`、前端 `a71d99f` 和 exporter `5d058d3`。Minecraft 1.20.1 Fabric 开发客户端生成的未修改 ZIP 的 SHA-256 是 `31a50489c64c63ee843f350ad84a0c1668dffecd3229795b1389cdca651782e1`。断点和续传保持同一上传，完成请求依次返回 201 和 200，导入队列实际投递与确认各一次、零重投。审核前匿名读取返回 403，独立审核后可匿名查看资源和配方。对象传输使用隔离的 OSS 协议夹具。正式发行 JAR 入世界仍需有效的标准 Minecraft 会话，目标云存储尚待验收。[三仓验收](https://github.com/mcmods-cn/mcmods-cn-backend/blob/main/docs/governance.md#当前版本与验收) · [公开配方实拍](docs/ui/resource-steps-public-recipe.png)

### 发布与回滚

本地查看生产产物时，使用发布容器采用的 standalone 服务器。静态文件需一同提供。

```bash
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
HOSTNAME=127.0.0.1 PORT=3000 node .next/standalone/server.js
```

生产发布与回滚均按**完整镜像与对应构建配置**切换。先用对应后端版本的 `cmd/db-initialize` 安装或核验 PostgreSQL 结构，再启动 API 与 Worker。确认 API 支持后台面板独立读取、OAuth 按字段 PATCH、AI 配置修订号和显式密钥清除、条件退出和当前导入状态。设置目标域名和代理路径后重新构建前端，检查 `/authentication-write-config` 指向目标 API。回滚时同时核对对应后端与数据库配置。旧 API 的条件退出路由返回 404/405 时，页面允许检查当前账号。OAuth 设置保留未保存的草稿，支持 PATCH 的实例恢复后可重试。[后端安装与恢复](https://github.com/mcmods-cn/mcmods-cn-backend/blob/main/README.md#数据库安装发布和恢复)

登录不保持时核对后端允许的前端 origin 与 Cookie 设置。浏览器上传失败时核对签名地址的 CSP origin。缺少样式或出现静态资源 404 时检查 `public`、`.next/static` 是否和同一次构建的 `server.js` 一同部署。GitHub 镜像发布工作流由 `v*` 标签或手动触发，使用仓库配置的公开变量构建，并同时标记版本和源码 SHA。[容器发布工作流](.github/workflows/release-container.yml)

## 依赖审查

2026-11-21 锁文件审查将 Next 升到 16.4.6、sharp 升到 0.35.5。自托管应用提供 Next 图片优化接口，允许的远端主机由 `next.config.ts` 限定。站点 Logo 接口先向后端确认设置写权限，再核对文件大小和 PNG、JPEG、GIF、WebP 的文件头。只有匹配后才调用原生解码器，随后校验实际格式、尺寸和动画帧预算。[Next 图片优化公告](https://github.com/advisories/GHSA-2464-fhr4-w9xw) · [sharp 公告](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) · [站点 Logo 净化](app/_lib/site-logo-image.mts)

该次 `npm audit` 报告的受影响包条目从 15 降至 4。剩余 4 条来自同一个 KaTeX 低危公告，涉及数学标记解析和 Markdown 展示。这条通告的前提是运行环境已受原型污染。当前渲染器显式传入 `trust: false`。插件声明兼容 KaTeX 0.16，升级时需核对它们的版本范围并重新验证公式渲染。本次没有复现该前提条件。[KaTeX 公告](https://github.com/advisories/GHSA-238p-pmpm-9mq7) · [Markdown 渲染](app/_components/markdown-renderer.tsx)

## 文档与验收证据

- [前端截图与界面验收](docs/ui/README.md) 记录浏览器视口、数据范围和测量。
- [当前界面行为](docs/frontend-state-recovery.md) 与 [后台设置和审核](docs/admin-data-integrity.md) 说明恢复边界和权限语义。
- [模型与蓝图渲染器](lib/mcmods-exporter/renderer/README.md) 说明从导入修订读取资产与释放 WebGL 资源的调用方式。
- [历史审计](docs/audit) 保留 2026 年 10 月至 11 月的验收、修复和认证时序材料，各文档中的测试结果对应当时的提交。维护者可从本页命令重新验证当前版本。

## 代理环境中的容器构建

Dockerfile 支持可选 BuildKit secret `proxy_ca`。需要企业代理 CA 时，使用只读 secret 为这次 `npm ci` 增加信任。常规环境可以省略此 secret。

```bash
docker build \
  --secret id=proxy_ca,src="$CODEX_PROXY_CERT" \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.test \
  --build-arg NEXT_PUBLIC_SITE_URL=https://www.example.test \
  --tag mcmods-cn-frontend:local .
```

`CODEX_PROXY_CERT` 指向构建环境授权的 CA 文件。示例采用测试域名。可用 `docker run --rm -p 127.0.0.1:3000:3000 mcmods-cn-frontend:local` 将测试容器仅绑定到本机。

## 真实资料目录回归

`browser-tests/audit-recipe-live.mjs` 是显式运行的真实浏览器检查，不替换 API 响应。
后端的隔离资料夹具必须已通过普通 HTTP 创建人工资料、独立审核，并完成具名导入。
夹具 runtime 应声明精确三仓库提交、受控回环前端 origin、人工/导入/混合资料公开 ID 和已验证的数量/概率。

```sh
MCMODS_AUDIT_RECIPE_RUNTIME=/absolute/path/to/owned-fixture/runtime.json \
  node browser-tests/audit-recipe-live.mjs
```

需要已安装的 Playwright Chromium 和可用的图形显示。检查使用正常浏览器身份，逐项对照真实目录响应与页面，验证数量、概率、短链、刷新和浏览器历史。
存在实际几何样本时，另检查桌面/触摸视口的交互范围、绘制范围及键盘 Tab 焦点；缺少的 fluid/gas/缩放样本不会被推断为通过。
运行器把独立结果、实际 API 响应摘要、截图、源码摘要和提交组合写入夹具目录的新子目录，不覆盖旧失败。
若浏览器服务来自另一份干净 checkout，可显式指定 `MCMODS_AUDIT_FRONTEND_CHECKOUT`；其提交必须与 runtime 的编译来源一致。
API 小页分页和数据库/审计后置条件由后端的只读观察器分别验证；本脚本不宣称真实队列、生产 bucket 或完整发布验收。

复跑真实游戏包时，先在后端运行 `TestAuditLiveGameJourneyFixture`。它为本次测试准备独立的数据库 schema、文件持久化的 JetStream、回环 HTTP API 与对象存储替身，并生成投稿人和审核人的合成会话。使用清单中的地址启动前端，再用下面的浏览器脚本核对上传 SHA-256、匿名读取边界、审核后的配方槽位和图片像素。Fabric、Forge 原包及生产提交随本轮后端一起交付。凭据文件仅留在测试目录内。[后端复跑步骤](https://github.com/mcmods-cn/mcmods-cn-backend/blob/main/docs/testing-isolated-environment.md#真实游戏包经浏览器和-jetstream-的验证)

```bash
MCMODS_AUDIT_JOURNEY_RUNTIME=/absolute/path/to/owned-fixture/runtime.json \
  node --test browser-tests/audit-game-live.mts
```
