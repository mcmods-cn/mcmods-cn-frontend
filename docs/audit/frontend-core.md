# 前端核心审查记录

基线：mcmods-cn-frontend `4f82c9075636cc4f1f6d3eb07de37a3fffd1de58`。范围以 `review-manifests/frontend_core.json` 的 203 个人工文件为准，基线共 19,825 行。此次沿任务分支工作，未切换/提交/推送；分支与最终提交由主执行者汇总。本文仅说明 frontend-core 执行证据，不替代整个前后端审计。

## 文件覆盖与方法

逐模块完整读取 API 客户端、权限/会话、上传/草稿、所有分配路由、八语言资源、Three.js 渲染/解析与对应配置/说明。长文件分段读取；路由批次、ja 长行、en 1301–1810、zh 长属性行出现输出截断后均补读。

核心审查者完整读取 202 个原有文件。`zh-CN.ts` 由 frontend-ui-b 协作审查者另行全文逐段读取，记录在其独立 zh 台账；核心审查者阅读相关修改块并复核八语言契约。协作复查并合并最终 SHA256 后，原范围 203 个文件均完整读取/语义审查；此覆盖与执行测试覆盖是不同概念。不能仅据文件完整读取宣称每条业务已验证。所有原范围文件均为人工维护文件，无本范围排除项；第三方库、lockfile、生成代码的全局排除由主台账记载。

`review-frontend-core.json` 保存路径、基线/最终 SHA256、行数、实际读取段、职责、调用链、问题和验证状态。新增测试与正式文档单列；台账自身是机器汇总元数据，不递归自签指纹。最终复查保留基线读取证据，并按最终 diff 的改变块补读、重新核对调用方和指纹；大型未变更字面量与基线逐行比对，而不把旧行号当作新读取证据。

最终核心台账共229条：原范围203个完整审查，加22个新增测试/说明文件完整复查，以及4个协作组件区域的部分审查；共225完整、4部分、0未审，原分配范围排除0。四个组件全文覆盖由UI-A独立台账负责，不能把区域记录再次计为全项目漏审或重复全文覆盖。验证记录与台账本身属于机器汇总元数据，不递归登记。

## 已确认问题与修复

| ID | 优先级 | 根因与影响 | 修改位置 / 调用链 | 验证 |
| --- | --- | --- | --- | --- |
| FE-CORE-001 | P1 | 旧 `/auth/me` 响应能恢复已退出身份、替换刚登录的新账号；退出事件又立即启动 bootstrap | `auth.ts` 加身份代次和明确退出状态，save/clear/expiry/跨标签页同步均参与；`useAuthSnapshot` 调用方由 UI 代理协调 | auth_core 两条迟到响应断言，红→绿 |
| FE-CORE-002 | P2 | cookie 会话后台 logo 上传路由只接受 Bearer，真实登录用户被拒；兼容 cookie 后需要写盘前 Origin 检查 | `api/site-logo/route.ts` 只转发 mcmods_session，精确同源 Origin、后端 admin.config.write 许可、10 秒权限查询上限；UI-A 取消 sentinel Bearer | node 环境真实 NextRequest + 临时目录两条红→绿；非管理员/生产文件未操作 |
| FE-CORE-003 | P1 | cookie sentinel 导致所有账号共享 `exporter:session` 恢复命名空间，可能恢复另一账号的本地包/签名票据；每次 open IndexedDB 不 close | `mod-export-upload-store.ts` 真实账号 ID + 编码项目/版本键，未就绪禁写；事务结束 close，版本切换 close；UI-A 传 ready/user.id | taskKey 两条；原生 Chromium IndexedDB 实际创建、更新、恢复、账号隔离、删除、升级，连接升级 blocked→ready |
| FE-CORE-004 | P2 | 项目 unfollow 返回 204，通用 API 仍强制 JSON data，成功被显示成错误 | `api.ts` 仅明确 204 允许无体，其余成功仍要求 envelope；已查 backend project follow handler | api_core 204 + malformed 200 红→绿 |
| FE-CORE-005 | P2 | localStorage override 任意结构、数字、空字符串或损坏参数导致崩溃/空白按钮；replaceAll 替换字符串解释 `$&`，参数会再次插值 | `i18n-provider.tsx` 验证已知键/字符串/参数；Object.hasOwn 遍历；单次字面插值；导出 plain 参数校验供 UI-A AI 结果使用 | 非文本/空值回退、字面参数断言；资源 AST/格式测试 |
| FE-CORE-006 | P2 | UI 语言切换后 html.lang 永远 zh-CN，读屏与日期等语言语义不符 | I18nProvider 在 locale 改变更新 document.lang；现有八 UI 语言 LTR | 实际 React provider 切 en-US 与 document.lang 断言红→绿；SSR 仍默认 zh-CN，浏览器验收由 root 汇总 |
| FE-CORE-007 | P2 | 隐私设置或 storage quota 拒写令 API 修改、语言选择、目录排序/分组抛错或不更新 | api 页面内稳定 clientID、auth 可选跨标签页广播、i18n 内存优先回退、catalog-state 继续状态/URL 更新 | storage 禁读/禁写、可读但 quota 拒写、sort URL 与 group 交互红→绿；不会假称偏好已持久化 |
| FE-CORE-008 | P2 | 收藏整合包下载总发 Bearer cookie-session，干扰后端 cookie 鉴权 | favorite-api 使用 backendFetch + include，仅真实 JWT 发送 Bearer | transports 下载头/文件 URL 释放断言 PASS；外部 Modrinth 真实导出未调用 |
| FE-CORE-009 | P2 | public shortlink 只捕获 ApiError，网络失败无限加载；旧响应可能跳转已切换资源，未约束目标 | 路由 AbortController、内部路径校验、按 publicId 保存失败状态、现有返回首页恢复入口 | 传输失败恢复与外部目标拒绝两条红→绿 |
| FE-CORE-010 | P1 | 草稿“编辑→已自动保存→恢复初始值”不再保存；提交完成可被迟到 autosave 重开；StrictMode 取消恢复后永远跳过 | use-auto-draft 最近成功快照比较，提交等待正在写入，恢复初始化可取消重启与代次保护 | 三条实际 hook 回归红→绿；数据库完成端逻辑见后端审计 |
| FE-CORE-011 | P2 | 无法解析的 MTL map 保留原文，Three MTLLoader 绕过 revision 资产索引请求外部地址 | minecraftBlockModel 的 MTL 重写移除未索引 map；材质允许缺贴图，模型不删除 | 实际 Three OBJ/MTL 构建与 TextureLoader 请求 spy，红→绿 |
| FE-CORE-012 | P2 | 六语言 modIds 子对象仍是旧 min/max 键，缺新版本选择键；多语言 upload 文案把扫描前状态说成已公开；通用必填/画布限制中文误导 | 六语言真正短译文替换旧键；已查所有调用；en/zh 保留契约；扫描状态提示与校验上限同步 | TypeScript AST 无重复键；八有效词典键/非空/参数两断言，36 键差异→0；语义质量仍不是全量语言验收 |
| FE-CORE-013 | P1 | 每请求 nonce CSP 与静态 prerender HTML 不兼容，production 17 脚本被阻导致页面完全不能 hydrate | layout await connection 动态请求 SSR；保留严格 script-src；重新全文读 Next16.3.8 connection/CSP 文档 | root 真浏览器基线17 CSP错误→production页面真实401、表单保留输入、strict-dynamic及CSP错误为空，已PASS；最新整体版本浏览器另由root记载 |
| FE-CORE-014 | P2 | import 每轮 delay 加 abort listener 不删；pre-aborted multipart 仍开始 | mod-export-api delay 完成/取消均移除监听；oss-upload 在分片分支前检查 signal | 两个 polling 周期监听一一释放、预取消不创建 XHR，transports PASS |
| FE-CORE-015 | P2 | 无 WebGL 环境构造异常冒泡崩整页；已卸载的结构仍加载/回传封面；skin/cape 部分失败漏释放纹理 | 三 canvas 在首 animation frame 初始化可取消，局部错误；结构取消保护与 firstPerson 初值；纹理逐项登记与迟到释放 | WebGL 三条红→绿；迟到/部分失败纹理两条 PASS；这些是模拟构造/纹理流程，未证明全部真实 GPU 视觉 |
| FE-CORE-016 | P2 | 作者认领证明可空/没有长度界限，审核列表无可达分页；后端单连接查询会自阻 | 配套后端 proof/owned attachment 与分页契约；CreatorClaimsPanel / ModReviewQueuePanel 的 50 条翻页、越界纠正、请求取消；ClaimCreatorDialog 保留输入并拒绝空证明 | 5 个真实 React 组件回归 PASS；API 为明确 mock，实际 PostgreSQL 权限/证明/事务见后端补审证据 |
| FE-CORE-017 | P2 | 日志策略已保存但清理部分失败，旧界面不能表达保存与清理两种状态 | LogCleanupPanel 仅接受 typed LOG_CLEANUP_FAILED / saved / 合法 normalized config，保留已保存策略并提示失败 | 旧 catch 1 FAIL/1 PASS →新 catch 2 PASS；不吞清理错误、不伪报成功；八语言真实 provider 说明保存时清理，未新增后台删除 |

正式运行契约已写 `docs/frontend-runtime-contracts.md`；资产边界与渲染生命周期写 `docs/renderer-client-contracts.md`。renderer README 修复不存在的文档链接和错误的 revision API 路径。

稳定问题状态单列在 `issues-frontend-core.json`：17 个确认问题，15 个已修复并在列明场景验证，2 个部分验证（FE-CORE-012 全语言语义/长文视觉、FE-CORE-015 完整真实 GPU 视觉未验收，已修代码及确定性回归分别通过）。没有把未取得的整体体验证据算成通过。本分配范围未找到权威完整的独立历史问题清单，不据“约20项”推导遗留数量；下面的风险/决策项也不混入已确认缺陷数量。

跨组计数以同一根因为准：FE-UIA-008 归并 FE-CORE-002，FE-UIA-010 归并 FE-CORE-003；FE-CORE-016 的证明与后端 BE-SUP-011/012 是关联链，列表UI缺分页与后端无界查询分别有代码证据。UI-B 最终更正皮肤 update 排除不可变 kind（FE-CONTRACT-002）及评论取消订阅返回 `{active:false}` 的精确 union（FE-CONTRACT-003），核心已实际读最终单行 diff 与调用方并更新指纹；两个静态契约修正只引用其主ID，不虚称原来存在运行Bug或重复新增核心ID。

UI-A追加回归发现 FE-UIA-011（P1）的另一窗口：A资料PUT尚未返回时B已登录，旧A结果仍调用无条件saveAuth将全局身份回写A。按root独占分配，核心新增同步isCurrentAuthUser及saveAuth可选expectedUserID，当前和响应ID双匹配才接受；无expected的登录保持兼容。UI-A实际user-home上传/PUT前后已接入身份与卸载检查，核心实际读最终调用段，组件验收归其主台账。真实认证Hook原4场景3FAIL/1PASS；再发现同ID授权覆盖与profile取消pending权限刷新各1条红灯；核心最终7场景及原bootstrap2场景共9PASS。条件更新只允许3个资料字段，保留最新token/email/roles/rules/版本，同身份权限刷新不被取消且晚/me不覆盖较新资料。此跨组主ID不重复增加FE-CORE问题数，最初bootstrap回归不能证明所有异步写回安全；这两个授权投影边界未被称为已证实后端越权。

## 模块与角色闭环

| 模块 / 角色 | 实际入口与持久化 | 此次补全 | 验证边界 |
| --- | --- | --- | --- |
| 登录访客 / 普通用户 | login 页面、auth/me、HttpOnly cookie、auth snapshot | 退出/新身份防旧请求覆盖 | 组件确定性并发回归；真 cookie 浏览器见 root |
| 后台管理员 | admin general logo → 本地 POST → backend permission → public disk | cookie 上传与同源保护 | synthetic NextRequest + 临时目录；未改生产 |
| 收藏用户 | favorite export task → download → Blob 文件 | cookie 下载契约 | 下载请求断言；外部下载供应商未测 |
| 项目编辑 / 上传账号 | mod content workspace → OSS ticket → IndexedDB resume → job polling | 账号命名空间、取消/连接释放 | 原生 IndexedDB；真实 OSS 未测；后端任务状态由其它代理验证 |
| 内容编辑 | 各 editor → useAutoDraft → draft APIs | 恢复、重复编辑、完成写序 | hook 真实逻辑+确定性 API，数据库集成由后端 |
| 访客深链接 | 九位 publicId → public-links → internal route | 网络失败与返回首页 | 路由组件；所有目标资源真实访问未遍历 |
| 访客 / 八 UI 语言 | provider → 静态词典 / 本地 override | lang、损坏回退、语言选择可靠性 | 两源语言及六继承资源结构；全语言语义/长文视觉未完整验收 |
| 资产浏览用户 | blueprint/item/skin → canvas → 三 renderer | WebGL 错误局部恢复、来源限制、异步取消 | Three 模型构建 + component lifecycle；大规模 GPU 性能未测 |
| 管理翻译用户 | admin AI task/翻译面板 | 配套 retry/cancel 费用说明、损坏译文提示；人工作业保护由 UI-A 实现 | 不真实调用 AI；供应商质量/账单未验证 |

配合 UI-A 提供 logShareViewer 与 assetEditor.published 词条；配合 UI-B 提供评论审核、challenge、楼层/冷却反馈词条。对应界面调用与角色验证记录分别归相应代理，避免重复计数。

后续由 UI-A 明确委派的四个大组件只补审其独占修改区域：`admin-community-panels.tsx` 76–233、`admin-mod-panels.tsx` 173–278、`creator-detail.tsx` 113–169、`admin-console.tsx` 5310–5400。核心台账标为部分审查，全文基线与最终差异由 UI-A 台账交叉证明；不把四个区域的阅读算成本人又全文审查了四个文件。新增三个回归文件全文已读。原 203 文件完整覆盖口径保持独立。

`npm run test -- tests/log-cleanup_core.test.tsx tests/application-pagination_core.test.tsx tests/i18n-resources_core.test.ts`：3 文件 9 断言 PASS（`/tmp/frontend-applications-cleanup-core-final.log`）；六个补充修改文件定向 ESLint、全量 TypeScript 均 PASS。分页旧实现无按钮的红灯与日志旧 catch 红灯记录保留。日志首版测试错误地期待局部 DOM 文案；真实 InlineMessage 派发全局 notice，纠正后才用真实 notice 事件建立红绿，未削弱产品断言。正式跨仓库部署边界见 `docs/frontend-runtime-contracts.md` 与后端 `docs/project-applications.md`，先发布兼容旧完整列表的前端，再启用有界后端响应。

加入保存时清理的八语言实际 provider 回归时，16 个核心测试文件共46项 PASS（`/tmp/frontend-core-final-all.log`，35.85秒）；新增身份条件写回与同身份权限刷新回归后，最终17文件53项PASS（`/tmp/frontend-core-auth-fencing-final-all.log`，23.21秒），定向 ESLint和全量`tsc --noEmit`均PASS。身份边界的2文件9项子集亦PASS1.32秒；准确命令与红绿证据见验证JSON。词条键保持兼容，源语继承仍如实标为 fallback。

## i18n / AI / 数据库结论

静态界面使用自建 React provider、plain `{name}` formatter，八语言通过英文/中文 spread 继承；不是 next-intl/i18next/ICU。当前 SSR 默认中文、CSR 后本地偏好切换，URL 不携带 UI locale，切换保持当前路径/参数。语言词典整体进入客户端包；未依据生产包测量任意拆分。有效 key 完整不等于八语言已经全部译成目标语言。

静态词条 override 管理是浏览器 localStorage 模型，尚不是跨用户全站发布。全站持久化、审阅流程和编辑权限将改变现有模型，应先明确需求；此次保持原有行为并写明事实。AI 的客户端状态/人工保护、后端资源版本、worker fencing、任务恢复与额度由相关报告交叉核对。无付费调用、无真实用户内容外发；这些测试不能证明真实语义质量、供应商连通性或账单准确。

本核心没有新增业务 SQL/schema/migration。浏览器 IndexedDB 的 tasks/files 和真实事务已验证；不替代 PostgreSQL/MySQL 测试。后端数据库结构/运行健康由主审查报告单列，此报告没有生产数据库健康结论。

## 环境、命令与证据

Node/npm/Next/Vitest/Playwright 的安装及整体 build/CI 由 root 记录。核心使用 root 安装的 Vitest 4.1.11/jsdom、真实 React、NextRequest、Three、TypeScript parser；浏览器使用 root 安装的 Chromium。所有 fixture 为 synthetic，OSS/AI 外部系统未调用。

- `npm run test -- tests/*_core.test.ts tests/*_core.test.tsx`：最终结果见 `validation-frontend-core.json`，与单测新增后统一回归对应。
- `npx playwright test e2e/import-store-core.spec.ts`：PASS，1 native IndexedDB 浏览器测试；使用拦截 HTML 的专用回环页面执行实际存储模块。该结果明确不是前后端业务 E2E。
- `npx eslint ...核心修改文件... tests/*_core.test.*`：PASS；不新增 eslint-disable/any/skip。WebGL初版直接 effect setState 被规则拒绝，修为首绘制帧可取消生命周期后通过。
- `npm run typecheck`：最终结果见验证 JSON；新 skin 回归出现 Texture 泛型错误已修为 `Texture<HTMLImageElement>`，未降低检查。
- `git diff --check`：PASS（核心最终修订）。

回归红证据保留 synthetic `/tmp/frontend-core-red.log`、`frontend-logo-red.log`、`frontend-draft-red.log`、`frontend-draft-strict-red.log`、`frontend-model-red.log`、`frontend-i18n-contract.log`、`frontend-i18n-quota-red.log`、`frontend-catalog-storage-red.log`、`frontend-renderer-red.log`、`frontend-idb-red.log`。这些任务内路径可定位过程，不承诺以后环境保留；最终 JSON 保存退出码和关键断言。logo 首版 jsdom File realm 不匹配是测试环境错误，改 node 环境后才以实际 403/201 建立红绿。IndexedDB 首版测试在页面拦截前访问未运行服务是测试设置错误，修为纯隔离页面后真实断言 blocked→ready；没有将连接拒绝当作产品 Bug。

## 未验证 / 需改进

1. 真实供应商连通性、AI 翻译语义、收费与生产队列负载未验证；仅在用户另行明确测试凭据/数据范围/费用上限时可执行真实调用。
2. 所有业务路由虽静态完整审查，未逐角色操作每条真实旅程；浏览器总验收由 root 的实际命令/断言说明，不能据单测数量冒称全部闭环。
3. 静态语言存在大量 inherited fallback，目标语言仍有 inherited fallback；此次 UI-B 已补齐其确认的反滥用与资源选择器硬编码范围，不能由这些修改推断其他全部界面没有硬编码。将有效 keys 全量填源文不会解决实际翻译质量。
4. 结构面裁剪仅按相邻坐标是否占据判断，透明方块/非全立方邻居可能错误遮挡；需要真实模型 occlusion 元数据与代表性 GPU 验收。此项是静态风险，不谎称此次已经完成视觉修复。
5. 结构贴图加载与自动封面时机、压缩 NBT 的浏览器解压峰值、较大结构性能没有代表性运行数据，列待验证，未从 tiny fixtures 宣称生产性能。
6. 本地 override 作为“全站翻译设置”是否符合产品意图未明确；需先明确发布模型与跨设备期望再设计服务端持久化，不能隐式改权限/发布政策。
