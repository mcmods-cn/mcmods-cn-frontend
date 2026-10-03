# 2026-10-02 前端共享模块专项审查

本报告覆盖主任务分配的共享库、API client、认证、语言资源、渲染器、测试、根配置和浏览器基础设施。基线为 `262e1c0136bfed4624a011cf5f445b1d71cf93c0`，工作分支为 `codex/full-audit-20261002`；最终提交与全项覆盖以同目录主报告和最终文件台账为准。报告不复用历史“完成”勾选作为验证。

## 阅读范围和证据边界

初始归属的 317 个基线文件共 29195 行，随后接手 23 个后台组件约 12894 行；全部人工维护文件均已分段读取并语义审查。当前专项台账 374 条，包含前端 372 个完整审查文件和两份后端历史手工报告，未审、部分审查和排除均为 0；主任务仍须跨所有者去重。40 个 `public/mc-icons/*.svg` 也计入完整审查：实际逐份显示并读取全部 120 行原始 XML、数值路径和颜色，核对 1024 方形 viewBox、名称及完整/半满/空状态；仅含 `svg/path`，无脚本、事件、外链、DTD 或 `foreignObject`。四个真实使用入口采用本站闭集图标白名单；40 份图标分别在明暗背景实际渲染并查看。证据为 `frontend-shared-svg-raw-proof.json` 和 `evidence/frontend-shared-mc-icons-contact-sheet.png`，静态渲染不等于完整产品交互验收。其上游来源与许可未提供，仍未验证，不能据此宣称第三方/生成产物或将它们排除。新增文件、最终总数与最终指纹以主报告合并后的去重台账为准。

新增的共享模块、回归测试、浏览器测试和本报告均加入最终台账；修改的最终差异与受影响调用链已复查。阅读和行为验证分别记录，既有测试文件被读完不等于其测试已执行。文件 SHA-256、实际读取段和问题关联在主任务汇总的文件台账中，任务内进度保存在 `/workspace/audit-session/frontend_shared-progress.md`。

## 已实施问题

| ID | 级别 | 根因、影响与修复 | 验证 |
| --- | --- | --- | --- |
| OCT02-FS-001 | P1 | `/auth/me` 迟到结果可恢复已退出账号或覆盖新登录；认证代次隔离结果，旧请求 finalizer 不清掉新请求 | 真实认证模块与可控 HTTP 边界，退出、新登录、请求去重 3 测试 |
| OCT02-FS-002 | P2 | 浏览器翻译覆写可存入非字符串/空白，顺序 `replaceAll` 会二次替换或解释 `$`；校验 JSON 结构并用单遍字面插值 | 2 测试；最终 typecheck |
| OCT02-FS-003 | P2 | 容器发布漏传文档已支持的图标/CSP 公开构建参数，且把可选 Yggdrasil discovery 设为必填；按现有配置转发 | CI/Docker 合约 2 测试，未发布镜像 |
| OCT02-FS-004 | P2 | 短链接导航直接信任 API 字符串；同源 HTTP(S) 闭集解析，拒绝凭据、控制符、反斜线、编码/多重斜线和外部 origin，输出本站 path | 短链接 3 测试；页面调用方由页面专项交付 |
| OCT02-FS-005 | P2 | 禁止 localStorage 时认证广播、请求客户端 ID、目录偏好和覆写会抛错；共享存储支持当前标签页回退，写入返回真实持久化结果，配额失败不被旧值盖回 | 拒绝读写、恢复、旧值/新值竞争 2 测试；页面专项另验草稿提示 |
| OCT02-FS-006 | P2 | 六个次要语言重建 `modIds` 的旧对象，丢失实际版本多选字段；翻译当前字段并移除无调用旧字段 | 解析器、有效 key 和占位符测试；确有修改前失败 |
| OCT02-FS-007 | P1 | 公共 API client 将合法 204 删除/取消关注当成缺失 JSON 的失败；204 返回 void，200 缺失 data 仍报错 | 实际回环 HTTP 的 204/200/畸形 200 断言 |
| OCT02-FS-008 | P1 | 收藏导出把 cookie-session 标记放入 Bearer 头，可能遮蔽有效 cookie；仅真实 Bearer token 设置头 | 实际下载入口与 HTTP 边界，cookie/Bearer 两分支 |
| OCT02-FS-009 | P2 | 正常轮询延迟未释放 abort listener，取消后迟到 load 仍发布进度；清理监听并检查结果发布前取消 | 轮询 5 测试，包括监听数和取消竞态 |
| OCT02-FS-010 | P2 | 标签选择器丢失请求语言和 signal，并把所有解析名称标为中文；透传 locale/cancel，使用服务端真实解析语言 | 1 测试；只读核对后端标签查询字段 |
| OCT02-FS-011 | P2 | 六个次要语言的下载上传提示承诺“已发布”，实际仍需安全扫描；改为上传完成、扫描后下载 | 完整词条/实际调用链静态复查，结构测试 |
| OCT02-FS-012 | P2 | app/components 实际静态调用缺失 21 个 key，上传页面还使用了旧标量；补齐 en/zh、准确上传状态及渲染进度，新增 AST CI 校验 | TypeScript 解析器、重复 key、有效结构/占位符和静态调用 3 测试；曾真实失败 |
| OCT02-FS-013 | P2 | 结构释放只释放共享材质/几何，遗漏 InstancedMesh 的实例缓冲；逐实例 dispose 并保持共享资源去重 | 真实 Three dispose 事件计数 1 测试 |
| OCT02-FS-014 | P2 | 结构重建丢失第一人称模式、失焦遗留按键、旧截图更新新资源；保留模式、清空按键、截图取消守卫 | 静态调用链复查、lint/typecheck；完整交互行为尚未逐项验证 |
| OCT02-FS-015 | P2 | 浏览器 benchmark 分配 6000 实例缓冲却写入 9000，越界写被静默丢弃并低估内存；分配足量 | 实际 Chromium 600000 实例、9000 touched、46178404 typed bytes；只证明该样本 |
| OCT02-FS-016 | P2 | WebGL 构造错误逃出 effect 导致页面崩溃；皮肤组合部分纹理失败泄漏成功/迟到纹理。统一真实异步资源加载后初始化并释放部分资源 | 真实 Three.Texture 释放事件 2 测试，lint/typecheck；生产界面 fixture 浏览器结果见主报告 |
| OCT02-FS-017 | P2 | 目录排序在去空白后匹配，但返回原带空白值；返回已规范化枚举，移除不安全断言 | 目录开发契约 3 测试，新增带空白分支 |
| OCT02-FS-018 | P2 | 评分删除独自包装 fetch 丢失业务错误；复用 204 已兼容的 apiRequest，评分摘要支持取消 | 回环 HTTP 的评分 204/404 业务码与预取消断言 |
| OCT02-FS-019 | P2 | 反滥用后台表单 await 后读取已释放的 event.currentTarget，多个操作未捕获失败、未保护重复点击；捕获实际表单并统一域内 mutation/error/busy 边界，取消 prompt 不提交 | 实际生产 handler、合成 HTTP/hooks 边界的 3 测试 |
| OCT02-FS-020 | P2 | 蓝图材料名称导出 CSV 只转义引号，表格软件可把不可信名称解释为公式；将公式起始字符及首位控制字符作为文本导出 | CSV 2 测试；调用方由页面专项交付 |
| OCT02-FS-021 | P1 | 有限后台角色被强制请求无权读取的配置/权限/用户接口，403 被误作失效会话而退出；只读取已有权限允许的模块，保留 401 退出，权限版本变化重置后台实例 | 实际调用链/后端权限契约复核；真实浏览器角色验证见主报告 |
| OCT02-FS-022 | P1 | 审核队列只链接普通私有详情/元数据历史，纯审核员无法读取真正待审提案；接入精确 pending 修订预览，验证白名单结构，按需读取、失败重试并惰性文本展示 | 3 解析器测试；生产 UI fixture 浏览器按需/503 重试/HTML 惰性展示 PASS；真实后端权限测试由后端单独记录，不互相替代 |
| OCT02-FS-023 | P2 | 表情包启停/删除未捕获 Promise 失败；域内 mutation 捕获并显示错误，保留数据，统一同步重复提交守卫 | 最终语义复查、lint/typecheck；全部按钮交互未逐项验收 |
| OCT02-FS-024 | P2 | t 改变触发初始化请求，语言切换覆盖经济/任务/权限设置及通知草稿；初始化按账号身份运行，当前翻译用 effect event；角色轨道列表更新不重置选中草稿 | 生产 UI fixture 实际另一标签页切换 en/zh，通知模板输入保留 PASS；其它受影响链静态复查 |
| OCT02-FS-026 | P2 | 创建用户 await 后重读释放的表单，刷新失败使已创建用户被误报失败；捕获表单，创建成功立即清空，独立呈现后续刷新错误并防重复请求 | 实际生产 handler 2 测试 |
| OCT02-FS-027 | P1 | OSS 配置/通知模板读取失败仍允许提交默认值或空集合；必须成功读取当前身份，失败可重试，保存期间同步防重复提交 | 生产 UI fixture 503、禁止写入、重试 PASS；不操作真实 OSS |
| OCT02-FS-028 | P1 | 本地 AI 完成直接应用旧闭包，覆盖等待期间人工词条/权限文字；记录编辑代次、跨标签存储快照与编辑戳，迟到结果保守丢弃；只应用非空源对应且占位符一致的字段 | 实际 provider 回调的 3 测试，包括编辑后恢复原文和另一标签存储更新；生产 UI fixture 手工输入保护 PASS |
| OCT02-FS-029 | P1 | 用户权限初始读取失败或切换目标仍可保存空/旧草稿；按账号/目标成功读取解锁，失败重试并重置节点选择，角色保存结果按选择代次隔离 | 生产 UI fixture 读取失败不会 PUT、重试后恢复 PASS；服务端授权不由此证明 |
| OCT02-FS-030 | P2 | 运行日志 setInterval 可重叠请求同一游标并让旧筛选迟到结果覆盖新筛选；完成后再调度，取消请求、隔离游标并按 ID 去重 | 最终调用链、lint/typecheck；慢请求/筛选竞态浏览器行为未验证 |
| OCT02-FS-031 | P2 | UTC 每日统计桶在西部时区显示前一天；格式化明确 UTC | 实际生产格式化函数 1 测试，西部时区和年界 |
| OCT02-FS-032 | P2 | 注册界面把 preferredUILanguage 标为第二内容语言，后台第一/第二内容语言标签含混；明确注册界面语言与后台内容语言，配合后端 A-029 契约修复 | 完整注册/后台/后端 SELECT 契约复核，i18n 结构测试 |
| OCT02-FS-033 | P1 | 每个认证 hook 都处理同一跨标签事件，互相作废请求，部分界面遗留旧账号；本地退出还会重读尚未清理的 cookie。改为模块统一事件监听、共享读取并发布所有订阅者，退出只发布空身份 | 真实模块与可控 hooks/HTTP 的红绿回归：3 消费者仅 1 次 GET、全部更新账号；退出不再 GET；原 3 竞态测试保留，共 5/5 PASS；生产 build-r2 严格账号切换/旧历史清除用例已 PASS，受控 API 边界不代替真实后端 |

OCT02-FS-025 原为字段格式候选，完整调用链证实既有 resource/resource-list 的 format 与编辑分支一致，已排除；不计入已确认缺陷或修复数量。32 个 FS 稳定 ID 对应已确认问题，行为验证深度按上表区分，不把静态复查称为完整浏览器验收。

页面专项的草稿冲突/重试/临时保存、内容统计本地化和 AI 请求预算面板同时补齐 en/zh 词条；内容统计保留原准确词义。社区帖子 GET/翻译 POST 新增可选 AbortSignal，供页面专项阻止旧资源/语言的迟到响应。所有变更保留原 API 路径和调用签名兼容性，不变更权限规则或数据模型。

页面专项另委托完成 OCT02-FP-054 的两条附件申请链：真实入口是 `creator-detail.tsx` 内的认领弹窗及 `project-editor-application.tsx`。每个成功附件立即保留公开文件 ID；后续附件失败只重试失败项，申请 POST 失败保留文字和成功附件，重试不重传。同步 ref 防止同一 tick 重复上传或提交，处理中冻结输入和关闭，提交成功后禁止再次提交。账号/目标变化隔离弹窗实例，卸载后停止后续文件请求并忽略迟到结果；当前已发出的 OSS 请求不能由现有上传接口取消，不能声称已自动删除已上传文件。创作者详情读取还支持取消与显式重试，界面语言变化不重读详情或销毁申请输入。该问题沿用 FP-054，不另计一个 FS 缺陷。

OCT02-B-030 的跨仓库补全：第 101 个项目变更日志分类原使整个集合 GET 返回 500，后端提供兼容的第一页及独立类别分页。前端接入 `categoriesHasMore/categoriesNextCursor` 与 `/api/v1/changelogs/categories`，明确加载更多、当前页失败重试、同步请求排他与切换时取消；保留详情中不在第一页的已选分类，按真实 names 回退并以 ID 去重。界面语言变化不会重置正文/版本/选择，旧语言的迟到页不能写入新列表。OCT02-R-017 的解析器和后台预览门由主执行者修复，本专项完整复核新增两个文件，并增加真实界面非法筛选不请求预览、筛选改变失效确认的 fixture 用例。两个问题分别沿用 B/R ID，不重复计入 FS 缺陷。

页面专项 OCT02-FP-050 的主题对比度修复还涉及本专项六个后台组件，共 13 处已填充强调色的文字改用 `--on-accent`。逐处复核真实选中分支、徽标回退和明暗变量定义，其余完整已读内容按相等指纹段映射复查；危险操作、蓝色与透明背景未改，权限与业务行为未变。源码复查证据为 `frontend-shared-fp050-final-proof.json`；新构建的实际主题/对比度浏览器验证由页面专项和主任务记录，不以此静态复查代替。

## i18n 与 AI 边界

界面使用自有 React provider 与静态 TypeScript 字典，运行语法为简单 `{name}`，并未采用 ICU。校验采用 TypeScript 实际解析器检查源结构和重复 key，执行有效字典检查空译文、key 和与运行格式一致的占位符，再检查 app/components 的静态 t 调用；动态计算 key 依赖语义阅读，不靠猜测删除。

实际支持八个 UI 语言，地区别名遵循 `ui-locale.mts`，SSR 初始语言由 cookie/请求语言确定，切换保持现有页面与 URL；现有支持语言均为 LTR，明确设置 `lang/dir`。次要语言仍大量继承英文（zh-TW 继承中文）；本次没有用整份复制制造翻译完成，也不把 key 覆盖或结构通过等同于全部语义质量合格。英文/中文主资源逐行读取，其他语言完整读取并校核真实覆盖对象；新增次要语言文案仍宜由母语审校。

数据库业务多语言内容与 AI 自动译文由后端管理，前端通过现有翻译状态/轮询 API 显示。普通 build/页面读取/语言切换未增加 AI 调用，不需要真实 AI 密钥。本专项没有真实供应商调用，没有验证真实翻译语义质量或供应商账单。新增后台预算说明明确：最近 30 天的预留/结算来自后端，usage 缺失按保守预留展示，不能视作免费，人民币估算来自后台配置价格而非核验供应商账单。源文版本、人工保护、任务领取/额度原子性和数据库验证由后端专项报告提供，不由前端 mock 通过推定。

## 环境与实际验证

复用主任务配置的 Node 24.19、仓库 lockfile 依赖、Next 16.3.8、React 19.2.4、Playwright 1.62.1 和 Chromium。没有安装无关组件、访问生产数据或使用付费 AI。

```sh
node --test app/_lib/auth-bootstrap-race.test.mts app/_lib/i18n-message.test.mts app/_lib/ci-deployment-contract.test.mts app/_lib/short-link-state.test.mts app/_lib/browser-storage.test.mts app/_lib/i18n-resources.test.mts app/_lib/api-transport-contract.test.mts app/_lib/job-polling.test.mts app/_lib/tag-picker-locale.test.mts app/_lib/development-api-contract.test.mts app/_lib/structure-disposal.test.mts app/_lib/skin-texture-lifecycle.test.mts
npm run typecheck
npx eslint components/mcmods-exporter/BlockModelCanvas.tsx components/mcmods-exporter/StructureCanvas.tsx components/minecraft-skin/SkinViewerCanvas.tsx app/_lib/i18n-message.mts app/_lib/skin-texture-lifecycle.test.mts browser-tests/renderers.browser.mts
```

首次定向测试 29/29 PASS，0 skip；恢复后的最终 18 文件定向测试 43/43 PASS，0 skip，证据 `frontend-shared-final-target-tests.log`，新增命令文件为 `admin-anti-abuse-lifecycle`、`blueprint-csv`、`admin-review-preview`、`i18n-ai-edit-protection`、`admin-chart-date`、`admin-user-create-lifecycle` 的 `.test.mts`。typecheck 与局部 eslint 实际 exit 0，证据 `frontend-shared-admin-typecheck.log`、`frontend-shared-admin-eslint.log`。八种语言各 66 个日志工具词条已逐条复查，解析器/结构/静态调用/占位符 3/3 PASS，证据 `frontend-shared-log-tool-locales-final.log`；不是专业母语质量认证。

FS-033 增加两条认证回归后，同一组测试 45/45 PASS；加入 FP-054 的实际组件 handler 四条回归后，19 文件最新定向测试 49/49 PASS、0 skip，证据 `frontend-shared-final-target-tests-49.log`。附件旧基线的两条有效 RED 均暴露同一 tick 重复上传，修复后验证逐文件失败恢复、提交失败保留、同步排他与卸载后不继续后续上传；最初 RED 准备挂起被终止的记录不作为有效红绿证明。最新相关 lint、整库 typecheck exit 0，证据 `frontend-shared-application-final-eslint-r3.log`、`frontend-shared-final-typecheck-latest.log`。

B-030 新增三个实际 API 包装/生产类别合并函数回归，R-017 新增解析器与静态调用门两条；连同实际 i18n 校验三条，最新定向 8/8 PASS、0 skip，证据 `frontend-shared-category-and-filter-tests.log`。静态调用门断言仅证明源合约，不能代替界面行为。分类 UI、API 和取消参数的局部 lint 与整库 typecheck exit 0，证据 `frontend-shared-category-last-eslint.log`、`frontend-shared-category-last-typecheck.log`。后端 B 专项已在专用 PostgreSQL 18 中实际执行：旧 101 类集合返回 500 的 RED 有效失败，修复后的 race 回归 16 个顶层、20 个子测试 PASS、0 skip，覆盖排序、删除游标边界、跨目标/语言游标 400、未审核目标原权限与批准后读取；证据 `backend_b-changelog-categories-red.log`、`backend_b-changelog-categories-green-r2.log`。这是后端真实数据库验证，不与前端 fixture 混合计数。

上述定向合并为 21 文件实际执行 54/54 PASS、0 skip，证据 `frontend-shared-final-target-tests-54.log`；没有把两个重复执行的 i18n 校验结果重复计数。

早期新增覆写解析器类型不精确引起 production build 失败、Canvas 同步 catch 触发 lint 均已修复；复原后首次通知轮询词条与继承 spread 顺序冲突、新增测试的 Node strip-only 不支持参数属性也已修复并保留失败记录。不能隐瞒为“环境阻塞”；最终全库 lint/test/build 与浏览器结果由主报告记录，不能以局部通过替代整体回归。

`browser-tests/renderers.browser.mts` 在生产界面、移动 390×844、en-US/zh-CN 下显式使 WebGL 不可用，核验资料标题、错误反馈、lang/dir 和单次资源读取。API 使用合成 fixture，明确不验证自身后端、鉴权或持久化；真实后端联通由独立 `test:live` 执行。裸 benchmark 的 Chromium 实测不构成生产性能改善百分比。

`browser-tests/admin-data-protection.browser.mts` 的五个场景使用实际 production UI 和显式合成端点，分别覆盖 OSS/通知模板/用户权限读失败后恢复、人工词条保护以及待审变更日志惰性展示/503 重试。本次与 renderer 合计 6/6 PASS、0 skip，证据 `frontend-shared-final-admin-browser-r3.log`。前两轮分别 2 PASS/4 FAIL、5 PASS/1 FAIL，属于测试定位问题：错误 notice 必须关闭后点重试；admin 隐藏站点页头，改用另一实际标签页切换语言；完整可访问标签和 Next 自带 route announcer 不能用错误的精确/泛化定位。保留全部失败日志，没有放宽数据保护断言或修改生产来掩盖定位问题。

统一中间 production 构建 r2 后，6 个后台场景（新增 R-017 非法筛选/确认失效）和 2 个分类分页场景均 PASS，附件项目申请 PASS、创作者认领 FAIL，单次记录为 9 PASS/1 FAIL、0 skip，证据 `frontend-shared-new-ui-browser-build-r2.log`。创作者失败是测试把删除按钮所在的文件大小 span 作为整个附件行，姓名定位错误；仅修正为实际 li 祖先后，两个附件场景重新执行 2/2 PASS、0 skip，证据 `frontend-shared-attachments-browser-build-r2-retry.log`，没有改成功 ID 或持久化断言。两个申请 dialog 随后仅补齐使用既有本地化标题的可访问名称；随后实际组件 handler 4/4 回归及定向 lint 仍 PASS（`frontend-shared-application-accessible-dialog-unit.log`、`frontend-shared-application-accessible-dialog-eslint.log`）。这些属性及其它负责人后续源修改需要最终 r3 构建整体回归，不能把 r2 结果算作最终全库通过。

`browser-tests/application-attachments.browser.mts` 的显式 presign fixture 返回合成已有文件（`uploadRequired=false`），不证明实际对象存储写入、后端申请持久化或授权。`browser-tests/changelog-categories.browser.mts` 的创建/编辑两例验证第 101 分类可达、503 重试、界面语言切换保留选择及版本草稿；服务端真实游标和权限范围另由 PostgreSQL 验证。R-017 界面用例没有请求任何真正的清理执行。FS-033 的跨标签账号界面已由主执行者在 production build-r2 实际复验：`root-recovery-browser-r2-correct-contract.log` 单次 4/4 PASS，其中日志工具两例验证提交期间输入保留、历史 503 重试、en→zh/390px，以及 cookie actorB 到来后立即清除旧历史再读取新账号历史。项目 API 为受控边界，不代替真实后端联通；最终 r3 统一回归另记。

后端固定基线额外完整读取 69 份代码/测试、两份手工历史报告 `03_DECISIONS.md`、`05_SCHEMA_AND_API_CHANGES.md`，并协助主执行者读取 `04_VALIDATION_LOG.md` 唯一尾段 4451–5164。精确 blob、分段范围和矛盾记录于离线恢复台账；历史 PASS/CLOSED 不继承为当前验证。恢复后已核验所有 72 份记录的固定 ref blob 与当前 SHA，其中其它负责人修改的文件仍须由对应负责人最终复查。再独立接手 15 份后端短文件，共 1167 行，均完整显示、语义审查并核验当前 blob 等于固定基线；其测试状态仍为 NOT_RUN，证明不超过静态范围。

另实际修复后端 OCT02-B-011：变更日志事务实体查找吞查询错误并返回 404。专用隔离 PostgreSQL 的真实认证 HTTP 故障注入先观测 404 失败，修复后稳定 500 业务码且没有新写入；真正不存在仍 404。含既有 TEST017/BUG034 的 race 回归 12 个顶层测试、11 个子测试 PASS，0 skip，证据 `frontend-shared-changelog-regression-race.log`。前两次测试准备错误另保留，只有第三次精确断连复现才是有效红绿依据。正式契约与安全复现说明在后端 `docs/changelog-update-errors.md`。

## 兼容、部署与剩余验证

本专项不需要数据库迁移。共享 API 的 signal 参数可选，204 语义与当前后端一致。待审内容预览要求后端 B-010/B-018 精确接口先可用；旧后端只会出现可重试读取错误，不伪造正文。其它既有 URL/JSON 保存字段兼容。容器构建必须重新传入公开 build 参数，修改运行时环境不会重写已编译 NEXT_PUBLIC 值。没有部署、合并或发布生产资源。后台正式说明见 `docs/admin-data-integrity.md`。

剩余未验证：真实 GPU 的长时间内存/第一人称交互、全部语言母语质量、40 个静态 SVG 的上游许可、真实 AI 供应商响应/质量/账单。独立 renderer 支持原始压缩 NBT，但网页当前读取后端规范化 JSON；压缩解码的峰值资源风险需结合独立库使用者验证，不能从浏览器场景预算断言原始输入解析也受同一预算保护。未下载或尝试真实用户结构。

## 后续新增的 A-031 投递恢复闭环

主任务追加实际投递死信断链修复后，本专项接入现有 AI 任务日志的 `delivery_failure`。严格解析字符串死信 ID、`publish` 阶段和布尔重试声明，仅 `queued` 且双权限允许时显示手动恢复；消费者失败不在此重发。同步 ref 排他，同一任务/死信身份的成功 POST 即时锁定，后续 GET 失败单独提示并保留列表；新的死信身份允许再次显式恢复。筛选读取通过请求代次、AbortSignal 和 no-store 隔离，离页抑制迟到状态发布。

八语言各新增八个真实译文，未复制英文伪造完成；四个实际生产 handler/解析器回归加三项 i18n 校验 7/7 PASS、0 skip，目标 lint 与整库 typecheck exit 0，证据 `frontend-shared-ai-delivery-final-tests-r2.log`、`frontend-shared-ai-delivery-final-eslint-r2.log`、`frontend-shared-ai-delivery-final-typecheck-r2.log`。中间一次 Map 回调捕获导致 `string|null` 类型失败已保留并修正为稳定字符串捕获。两个 production UI fixture 场景已在统一 r4 构建实际 PASS：同 tick 只发一次 POST，失败保留行并可显式重试；202 成功后 GET 503 单独提示且不会重复 POST；读取新死信身份才允许再次显式恢复。还覆盖只读权限、消费者失败/重试态不显示按钮、en→zh 和 390px。正式协议和恢复边界在 `docs/admin-data-integrity.md`，仍不调用真实供应商、不证明真实计费或后端持久化。

最新 r4 首轮全库浏览器由主任务记录为 63 PASS/4 FAIL，其中本专项三项失败可独立复现，证据 `frontend-shared-r4-three-browser-diagnostic.log`。仅修 fixture：有限 AI 角色启动会合法 GET `/admin/ai/config`，加入明确禁用的合成配置并保留严格未知端点断言；跨标签语言测试在关闭来源页之前等待两页实际语言更新。三个定向场景重新执行 3/3 PASS、0 skip，证据 `frontend-shared-r4-three-browser-explicit-fixture.log`，两测试文件 lint exit 0，生产源码未改变。未放宽输入保留、读取次数、写入次数、权限或双击断言。其它专项失败与最终全库重跑由主任务报告，不能把定向通过称为全库通过。

## 历史问题独立语义复核

实际分配的 92 项原问题已逐条按当前根因、不变量、调用链和精确测试断言核对，记录为 `legacy-semantic-frontend_shared.json`：62 项在对应验证边界内已确认解决，28 项部分验证，1 项本次修复，1 项未验证。没有按历史 CLOSED、邻近测试或累计 PASS 批量判定。50 个相关前端测试文件本轮实际执行 123/123 PASS、0 skip，证据 `frontend-shared-legacy-50-test-files-green.log`；原 121 PASS/2 FAIL 的准确组件源断言不匹配已保留。Node 纯函数、源码合约、受控 HTTP 与真实数据库执行分别注明；后端引用按明确测试名、执行时指纹和主任务日志核对，未获得当前执行证据的条目仍标部分或未验证。r4 三条实际治理 UI 的明确断言补证后，TEST-048 在具名 PG 与界面场景范围内确认解决；通知初始 AI 余额已有实际界面补证，但晚响应与终态刷新仍保持部分验证。此分类不证明生产健康、真实 AI 质量或所有业务场景通过，最终全库回归另由主任务记录。
