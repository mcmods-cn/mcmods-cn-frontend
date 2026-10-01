# 模块、角色与前后端契约补核

本报告对应前端基线 `4f82c9075636cc4f1f6d3eb07de37a3fffd1de58`、后端基线 `bd50afd0ef92192c40c5152ea56e27a3fdbb657f` 的本任务最终工作区。最终文件 SHA256、路由来源与调用行号保存在 `module-contracts.json` 和独立 `review-module-contracts.json`，不是假定远端 main 最新。实际 HEAD/提交和总体 CI 由主执行者最终记录。

## 清单生成、人工核验与范围

运行以下命令只读取本地源文件；不启动服务、不读取 `.env`、不联系供应商：

```sh
GO_AUDIT_BIN=go node scripts/audit-contracts.mjs ../mcmods-cn-backend docs/audit/module-contracts.json
```

使用仓库锁定的 TypeScript 编译器识别真实导入的 `apiRequest` / `backendFetch` 符号，排除测试，提取 URL 表达式、有限联合与条件分支、方法、查询参数、JSON 请求字段及泛型响应类型。Go AST 从实际注册获取 method/path/handler/权限，并提取请求 DTO、直接错误/响应状态、业务错误码与查询读取；包含 Yggdrasil 的注册包装器。内联匿名 DTO、复杂数据流、动态 RequestInit 和 helper 依赖不能因此视为完整协议证明。递归及变体数量有界，超界保留未知标记。

本次实际提取 **449 个调用位置**：448 个业务调用、1 个共享 fetch 包装调用；**505 条注册**含健康检查、管理接口和 Yggdrasil 协议。438 个业务调用的静态 URL/method 分支有路由模式匹配；9 个未直接匹配位置、1 个部分匹配位置，使用人工调用链补核。所有 449 行 compact 对照清单已实际阅读；这不等于 449 条完整业务旅程已运行，也不取代各文件原审查台账。

`module-contract-overrides.json` 是人工维护文件，逐行读审；九个记录覆盖十个调用位置，OSS 完成/中止共用同一终点表达式。它只证明已实际追踪的 path/method，`semantic_contract_verified`、`behavior_verified` 仍为 false。生成器核对实际调用表达式和注册路径，漂移立即失败，不能静默继承旧结论。自动 inventory 是合理排除的机器产物；生成源和人工记录另有完整审查证据。

| 动态入口 | 实际链与结论 | 边界 |
| --- | --- | --- |
| history `endpoint` | 十二个真实页面→ContentHistory→四类已注册 GET | 未运行所有资源与角色历史 |
| 翻译 `path` | ContentTranslationControl→`/content/{publicId}/translations` POST，只传 sourceLocale/targetLocale | 未发送真实付费 AI 请求 |
| OSS complete/abort `endpoint` | 用户、管理员、举报、项目文件、模组导入真实调用方→六类 POST 注册 | 未验证真实 OSS 和 lifecycle |
| 管理文件行 `endpoint` | OSSRowsPanel 三个固定 GET prop→uploads/scans/downloads | 不以行列表存在证明管理流程完整 |
| 蓝图封面 `path` | 后端两个 coverUrl builder→`/blueprints/{publicId}/cover` GET，前端读 blob | 二进制响应不套 JSON 包络 |
| 模型 `input` | IndexedHttpAssetSource→modExportAssetURL→export revision assets/content，实际资源读 GET | RequestInit 仍允许未知 method；模型安全另见 core 测试 |
| 项目 `downloadPath` | 后端 projectFileDownloadPath→files/{source}/{fileId}/download POST，返回 url/filename | 未向真实分发供应商下载 |
| 上传 `basePath` | ProjectDownloads→ProjectFileUpload→projectFilesPath POST | UI canUpload 不替代后端授权 |
| 审核 `url` | reviewUrl 的三类后端 builder→mod/content/export revision PATCH；编辑申请固定 PATCH | 皮肤 revisionId 公共字符串问题另见 BE-UIB-007 的真实 PG 回归 |

模式匹配保留 Go ServeMux 的文字/参数重叠候选，不能把每个候选 handler 当作实际选择结果。机器匹配不是“路由存在即功能完成”。本次未确认新的被动 404；仍须按以下证据边界理解。

## 已修复的契约问题

| ID / 级别 | 根因、影响与修复 | 实际验证 |
| --- | --- | --- |
| FE-CONTRACT-001 / P1 | Yggdrasil 管理页 PUT 展开 GET `draft`，携带 hasPrivateKey/persistentPrivateKey/available/disabledReason；后端 DisallowUnknownFields 导致普通保存失败。改为 11 个可写字段白名单，保留运行状态展示与密钥保留/轮换选项 | 修改前组件 1 FAIL、1 PASS；修改后 2 PASS。Go 实际 decoder/DTO 1 顶层测试及 4 子场景 PASS，严格拒绝只读字段。不是配置写库或客户端 E2E |
| FE-CONTRACT-002 / P2 | updateSkin 类型错误允许后端不接受的不可变 kind。收紧 Omit 为 fileId 和 kind；真实唯一编辑调用方本来未传 kind | 对照实际 skinAssetUpdateRequest 和 localized-asset-editor 调用；整仓 typecheck。未声称存在已复现页面失败，不增加镜像测试 |
| FE-CONTRACT-003 / P2 | setCommentWatch DELETE 原类型承诺服务端不返回的计数字段。响应类型改为完整状态或 active:false；评论组件据字段窄化，取消时保留既有零计数状态 | 对照实际 PUT/DELETE handler 与两个调用方；已有评论回归和整仓 typecheck。不是新功能或已复现运行 Bug |

Yggdrasil 正式契约见后端 `docs/YGGDRASIL_SETTINGS_CONTRACT.md`。三项没有 schema 或权限变更；Yggdrasil 修复可独立发布，两项类型修正保持现有界面行为。新增后端回归不使用密钥或真实数据库。

## 公共协议逐项边界

- JSON 使用 `{data,error,code,retryAfter,details}` 包络；`code` 可选，并非所有失败都有稳定业务码。ApiError 保留 HTTP status 和结构字段，429/挑战处理依赖实际 code。`challenge_required` 已对照反滥用决策和评论调用；`LOG_CLEANUP_FAILED` 503 的“策略已保存、清理失败”语义与前端提示相符。
- 204 的项目取消关注故意无 JSON，apiRequest 返回 undefined；封面、模型资源等二进制读使用 backendFetch。带后端标识的 JSON 502/503/504 是局部 API 错误，网络或无结构网关错误才触发全站离线提示。401 清除过期登录；503 的暂时认证故障不当成退出。
- cookie-session 是前端会话标记，不作为 Bearer 发送；真实 JWT 才添加 Authorization。请求使用 credentials include。权限由后端 runtime claims 与对象级检查决定，隐藏按钮和前端 token 不构成授权。
- 公开资源 ID、修订 ID 和任务 UID 沿字符串传递；数据库内部 bigint 与展示统计是不同职责。skin 审核公共修订 ID 已修复，AI 创建/重试/取消的 id 为 task UID，与调用方一致。没有据小样本宣布所有计数永远低于 JavaScript 安全整数上限。
- 请求 DTO 的嵌入字段实际展开后比较；draft 完成请求的领域字段由嵌入 upsertUserDraftRequest 接受，不能误报未知字段。目录编辑分支的 catalogDeleteRequest 是 DELETE helper，不能用它否定 PUT DTO。
- comment watch DELETE 只返回 `{active:false}`，评论组件显式构造完整零计数状态，用户 watch 列表忽略 DELETE 响应。共享 API 返回类型按实际 DTO 收紧，评论组件按响应字段窄化；PUT/GET 仍保留完整 watch state。
- sort/order、limit/offset、cursor、lang/locale 和空查询值按所属模块审查，不假定所有列表协议一致；机器文件保存查询 key 与实际 handler 读取，默认值仍来自实现。时间使用现有 ISO/RFC3339 字符串；界面日期格式与语言回退另见 UI/core 证据。未改写语言变体或时间区间产品语义。

## 真实角色与用例矩阵

实际 seedRoles 只有 registered、project_developer.[ProjectID]、project_editor.[ProjectID] 和 banned。访客无会话；资源所有者是对象归属关系；管理员和审核员在本表指实际 permission capability，不能虚构一个通用角色绕过 scoped/deny/runtime 条件。admin 种子账户有显式权限集合，autobot 是系统执行者。权限模型来源为 seeds、security token/runtime 和 handler，不代表读取生产角色绑定。

| 模块 / 真实入口 | 用户与核心任务 | API / 持久化 / 异步链 | 缺口、补全及验收边界 |
| --- | --- | --- | --- |
| 账号、资料 `/login`、`/user` | 访客登录；registered 编辑资料；owner 退出/会话撤销 | auth/login/me/logout、users/auth_sessions、权限版本 | 真浏览器 cookie 登录→刷新→退出；普通资料编辑持久化单旅程通过；非全部认证方式 |
| 模组与资料项目 `/mods`、plugins/maps等 | 访客搜索/详情；开发者/编辑者创建修改并送审 | mods/simple_projects、revision、provider import、Typesense | 参数/权限/提交组件回归；审批与引用安全真实 PG；真实 Typesense 5 场景通过，非全站索引重建验收 |
| 数据目录 `/mods/{id}/data`、资源页、catalog | 访客读批准版本；scoped editor 资源/配方/布局编辑 | catalog_entities、game_resources、sections、definitions、recipe tables | 本次分类改名保留正文/子树深度校验/范围恢复等组件回归；资源 sourceVersion 权限真实 PG，完整浏览器编辑未跑 |
| 下载、上传与导入 | 访客下载可见文件；获权用户上传/导入 | project files→OSS/scan；export/catalog imports→jobs | 动态路径与 DTO 检查；有界图片/GIF、安全和任务 race 回归。真实 OSS/分发供应商未验证 |
| 收藏夹 `/user` 及项目按钮 | registered 管理自己的夹/成员，访客仅公开读 | favorite_collections/items；modpack export tasks | owner 私有夹生命周期、桌面长行操作真实浏览器通过；移动仅模组列表/语言切换；收藏越权/并发 PG；导出任务全旅程以 API-B 专项为准 |
| 评论、评分与订阅 | registered 发布/修改自己的内容，项目权限者审核/置顶 | comments/reactions/watches/closure、ratings、project follows | 评论恢复与 i18n 组件测试，权限/并发 PG由对应审查者提供；全部角色评论浏览器旅程未跑 |
| 举报与审核 `/reviews`、举报对话框 | registered 提报；review capability 查看证据、处置 | reports/snapshots/evidence/reviews、moderation、review locks | 附件安全、快照、对象权限与错误回归；未对真实第三方执行安全测试 |
| 作者、团队、协作 `/authors`、`/teams` | 归属者认领；编辑者申请；获权者审批 | creators、authors/teams/member relations、project assignments | 表单重试/输入保留/页面竞态组件回归；授予行为和审核隔离 PG；不能把所有owner等同developer |
| 社区 tutorials/issues/discussions/news | 访客公开读；具对应权限者发布/修订 | community_posts/refs/history；bounties、translation tasks | 历史/排序/关联可见性与悬赏事务代码审查及 PG专项；金额/商业规则未擅自修改 |
| 私信、通知 `/messages`、用户面板 | 登录者只读写自己的消息/通知 | direct_messages、notification templates/tasks/SSE | 实际 message sender/recipient PG及rows错误处理；模板/SSE专项；并非邮件供应商联通 |
| 皮肤/玩家 `/skins`、`/players` | owner 上传编辑；访客按资源可见性查看 | skin_assets/textures/wardrobe/player profiles、内容修订、Yggdrasil | 多语言单请求/人工保护与嵌套私有皮肤 PG；类型边界修复。真实启动器登录未验证 |
| 蓝图 `/blueprints` | owner 上传、预览、送审、下载；访客仅公开资源 | blueprints/variants/materials/normalize jobs/outbox | 完成幂等、租约与删除后访问 PG；封面链静态补核，外部对象转换全旅程未跑 |
| 日志工具 `/tools/logs`、`/log/s/{code}` | owner 创建分享；访客读脱敏公开结果；获权者治理 | log shares→analysis/redaction；app_logs/runtime buffers | secret-query不入库、脱敏分析投影与权限真实 PG；不以遮盖UI代替保护原始数据 |
| 后台 `/admin` | capability 持有者管理配置、权限、反滥用、AI、存储 | system_settings、permission tables、quotas/tasks/audits | 未登录后台真实浏览器拒绝；Ygg whitelist真实红绿。管理页面存在不代表任一用户有权操作 |
| 经济/等级/自动维护 | 获权账户签到/消费/配置；autobot worker维护 | economy/level/statistics、automation activity/jobs | 阈值数组补齐/配置失败重试组件回归；额度/事务/旧claim fencing真实 PG专项。新计费产品未引入 |
| i18n / 翻译控制 | 所有用户切界面语言；获权用户提交业务内容译文 | 界面静态locale；localization版本；AI任务/额度/outbox | 真实provider组件fallback与移动语言路径浏览器通过；AI确定性HTTP/PG故障验证，真实语义质量/收费未验证 |

## 实际证据与未验证项

本补核独立执行结果：

| 验证 | 状态与证据 |
| --- | --- |
| AST inventory 实际生成及人工record漂移检查 | PASS；448 业务调用 / 505 注册，完整机器文件可再生成。此 PASS 仅工具运行 |
| Yggdrasil 组件红绿 | 旧源 1 FAIL/1 PASS `/tmp/frontend-contract-ygg-red.log`；修后 2 PASS `/tmp/frontend-contract-ygg-green.log` |
| 实际 Go decoder / DTO | PASS 1 顶层 + 4 子场景 `/tmp/backend-contract-ygg-green.log`；初次曾被并行 mod_export_resume 测试编译错误阻塞，已修后实际通过，不隐去原失败 |
| frontend typecheck / targeted ESLint、生成器语法/Go vet、diff check | 结果以 `module-contract-validation.json` 的实际退出码为准；不复用旧的 PASS 指纹 |
| 本代理前后端原专项 | 见 `frontend-ui-b.md`、`backend-api-b-ui-b.md` 和独立 validation；真实 PG 与 race 结果只覆盖其中断言 |

主执行者提供的证据另行归属：最新生产构建使用实际 PostgreSQL/Redis/JetStream 后端，五项业务旅程与一个 native IndexedDB 隔离页面场景通过。连续六项曾 5 PASS/1 FAIL（`/tmp/mcmods-e2e-release.log`），同一回环IP累计触发现有headless每分钟60次读取规则。随后只修测试编排，互补分批执行全部六项、批间遵守60秒窗口；`npm run test:e2e` 退出0（`/tmp/mcmods-e2e-release-paced.log`），第一批5 PASS/12.9秒、第二批1 PASS/5.5秒，测试超时/断言/安全策略均未放宽。IndexedDB隔离页面不算项目API联通；五项业务旅程包括CSP/错误表单、cookie刷新退出、390px语言切换、访客管理拒绝、普通用户权限及资料/收藏夹持久化。全部其它旅程边界仍按下表与专项说明。

主执行者真实 Typesense 30.2 测试库五个 schema/import/alias/approved search filters/facets/delete 场景、race 通过（`/tmp/mcmods-typesense-real-integration.log`）。这证明实际引擎语义的测试断言，不能推广为生产负载、worker全重建或线上健康。

未验证：每个可选排序/分页组合的真实浏览器验收、所有 capability 的全部对象生命周期、真实邮件/OSS/支付/外部导入供应商、真实付费 AI 连通与语言语义质量、生产数据库运行健康。解除条件分别是更多隔离场景和授权测试账号/专用测试服务；真实 AI 还需明确数据范围、专用凭据和费用上限。已有 mock/静态结果没有冒充这些验证。重大产品与不可逆操作仍由总问题台账记录，不因本报告新增功能数量而擅自实现。
