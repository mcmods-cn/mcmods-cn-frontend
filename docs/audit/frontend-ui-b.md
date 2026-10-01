# 前端组件 B 审查、修复与验证

基线：`4f82c9075636cc4f1f6d3eb07de37a3fffd1de58`。本报告范围为 `review-manifests/frontend_ui_b.json` 的 70 个人工维护组件；未把第三方包纳入人工审查分母。逐文件证据见 `review-frontend-ui-b.json`：65 个由本执行者完整分段阅读/语义审查，5 个最长文件由 UIA 完整读取并复查，独立证据见 `review-frontend-ui-b-delegated.json`，本执行者已核验最终文件指纹；合计完整 70、部分 0、未审 0、排除 0。不把委派阅读冒充本执行者独立阅读。修改过的 12 个组件完成最终差异复查；Markdown/评论/反滥用/版本与资源选择器还完整重读最终内容。7 个新回归测试文件纳入新增文件台账。指纹对应实际工作区；总任务提交后由根任务补最终 commit。

阅读证据与测试证据分别记录。没有专用交互测试的组件仅标静态语义审查。这里的 mock React 组件测试不构成前后端真实联通、数据库集成、真实 OSS/翻译供应商或浏览器验收。

## 已确认问题与处理

| ID | 级别 | 根因/影响 | 修复位置 | 实际验证 |
| --- | --- | --- | --- | --- |
| FE-UIB-001 | P2 | 模组详情非 404 请求失败被吞，界面一直显示加载；资源/语言/会话切换仍展示旧记录 | `mod-detail-loader.tsx` 身份匹配结果、错误提示与重试、取消请求 | 失败重试、资源更换、迟到语言请求；旧源测试失败，修复通过 |
| FE-UIB-002 | P2 | 异步表单 `event.currentTarget` 在 await 后为空，成功写入后错误提示/无法重置；反滥用管理部分 mutation 无错误恢复 | `project-auto-update-settings.tsx`、`admin-governance-automation-panels.tsx`、`admin-anti-abuse-panel.tsx` 保存表单节点，失败保留输入/显示错误，动作忙碌态及取消 prompt | 来源绑定/封禁/限制创建延迟成功，限制错误保留输入；旧源失败、修复通过 |
| FE-UIB-003 | P2 | CDN 后缀检查接受 `evilalicdn.com`；StrictMode 清理监听却留下脚本，重挂载不再收到加载通知 | `iconfont.tsx` 精确根域/子域，移除本 effect 创建的脚本 | 非可信主机拒绝、StrictMode 加载通知；旧源失败、修复通过 |
| FE-UIB-004 | P2 | 用户控制的私有 URI 标记解码抛异常；自定义语法预处理破坏代码示例/复制内容 | `markdown-renderer.tsx` 容错解码、code/inlineCode 还原，保留 token 原大小写/拼写 | 畸形 URI、行内/围栏代码、正常视频嵌入、无效语法原样回退；前两项旧源失败 |
| FE-UIB-005 | P2 | 上传完成使用旧附件快照，复活已删附件；同时拖入覆盖结果，disabled 拖入仍执行上传 | `comment-markdown-editor.tsx` 当前附件引用、批次互斥、disabled 校验 | 删除与上传并行、禁用拖入、重复拖入；旧源 3 项失败，修复 3 项通过 |
| FE-UIB-006 | P2 | datetime-local 无时区值直接发给 Go `*time.Time`，有限期封禁 JSON 解码失败 | `admin-governance-automation-panels.tsx` 本地时间转换 ISO/RFC3339 | 请求体 endsAt 对比 ISO；已核实 `governance_handlers.go` 请求契约；组件通过 |
| FE-UIB-007 | P2 | 评论异步 mutation 用旧数组覆盖别的操作；旧排序响应覆盖新排序；复制失败仍提示成功；重复点击重复计数 | `comment-section.tsx` functional updates、加载序号、剪贴板错误、每评论/反应互斥 | 独立反应并发、同反应重复点击、排序乱序、复制拒绝；旧源失败，修复通过 |
| FE-UIB-008 | P1 | 全会话共享请求忙碌位/游标，切换 B 后 A 迟到结果显示在 B；迟到发送清空 B 草稿；切换账户保留上一会话内容 | `messages-center.tsx` 按会话取消和身份核对、发送按会话写入及草稿条件清空、按 session 重建内部状态 | 两会话竞态、迟到发送、账户更换；旧源失败，修复通过。没有放宽后端授权 |
| FE-UIB-009 | P2 | 资源选择器重复提交相同搜索仅设 loading，无依赖改变，永久加载 | `editor/resource-picker-dialog.tsx` 每次显式搜索 attempt | 同参数重复搜索实际二次请求且完成；旧源失败、修复通过 |
| FE-UIB-010 | P2 | 简单项目目录请求缺取消/身份核对，旧搜索响应覆盖新筛选结果 | `simple-project-catalog.tsx` AbortController、请求身份、旧 catch/finally 忽略 | 两次搜索乱序；旧源失败、修复通过 |
| FE-UIB-011 | P2 | 通知客户端译文缓存只按通知 ID，换语言后继续显示上一目标语言 | `messages-center.tsx` 缓存按 locale+通知 ID | 英文完成后切日文回退原文；修复后测试通过，未做独立旧源红灯运行 |
| FE-UIB-012 | P2 | 评论、反滥用管理、资源手动选择及压缩版本组有硬编码中文；风控时间固定中文格式 | 对应组件接入实际中英文词条；版本摘要复用既有分组词条；日期/数值使用当前 locale | 真实 I18nProvider 中英文、缺词条德文→英文回退、版本摘要、手动输入、楼层校验；旧版 4 失败/1通过，修复通过。未声称六目标语言有真实新译文 |
| FE-UIB-013 | P2 | 风险总览“验证通过 / 失败”把两个数量相加，无法判断结果 | `admin-anti-abuse-panel.tsx` 分开呈现通过/失败，Intl 数字格式 | 合成通过2/失败3应显示2 / 3；旧版失败、修复通过 |

这些是本范围新核实的缺陷，不冒充历史“约 20 项”清单。修复未改公开 HTTP 路径/响应/权限/数据库 schema，不需要迁移。部署可单独更新前端；期限封禁 ISO 格式与现有后端兼容。

## 模块、角色与用户任务矩阵

| 模块/真实入口组件 | 角色/任务 | 已审链路 | 验收边界/缺口 |
| --- | --- | --- | --- |
| 目录 `simple-project-catalog`、`server-catalog`、`community-post-catalog`、`catalog-resource-catalog` | 访客/登录用户搜索、组合筛选、排序、分页、清空、深链接 | URL/偏好控制→API 参数→列表/空状态/失败反馈→分页；创建能力来自权限 | 简单项目竞争有组件回归；其他目录仅静态，移动/URL浏览器验收见总任务 |
| 详情/资源/皮肤/作者/玩家 | 访客阅读与语言回退；资源拥有者进入编辑/历史 | API→本地化→引用/版本/下载/历史/举报/关注→鉴权入口 | 模组失败重试已补全；其他详情切资源失败的旧状态保留仍需针对实际路由验收 |
| 评论/附件 | 登录用户发表、回复、反应；作者编辑/删除；管理者置顶；访客阅读 | 反滥用表单/挑战→评论API→持久化结果→树形显示、合成附件元数据 | 组件竞争/错误路径已验证；后端保存/挑战、真实下载授权由总任务集成验证 |
| 私信/通知 | 登录用户选择会话、发送、读取通知、选择翻译 | 会话API→presence/SSE/poll→UI→发送结果；通知翻译显式触发→任务查询→余额 | 消息隔离与语言缓存组件通过；真实消息通知持久化/SSE以及翻译费用非本报告证据 |
| 内容工作台、栏目、属性、合成GUI、战利品表 | 获权编辑者/管理员编写、导入、编辑多语言、审核提交 | 版本/模板/资源API、baseRevisionId、OSS、任务状态、审核结果 | 完整静态审查，复杂画布/导入生命周期尚需实际浏览器/真实测试服务 |
| 治理/反滥用/自动更新 | 管理员封禁、限制、处置风险、项目绑定来源、触发更新 | 表单→专用管理员API→重新加载→错误恢复 | 异步成功与失败、ISO契约组件通过；管理员权限拒绝和落库由后端/总任务证明 |
| 顶栏/身份/主题/工具/裁剪/图标 | 访客与登录用户导航、语言、账号、工具、图标fallback | session→SSE/presence、导航、组件事件、浏览器功能 | 静态完整阅读；StrictMode图标验证，其余未作全旅程浏览器验收 |

## i18n 与仍待验证范围

界面静态 t 词条、业务内容 localizations/fallback、显式通知 AI 翻译三者职责不同。评论的审核/挑战/楼层/冷却提示增加 9 项中英文词条；反滥用和资源选择器增加独立命名空间并接入界面，其他六语言沿既有英语回退，不复制源文虚报翻译完整率。版本摘要复用既有分组词条，管理员日期和数值使用当前 locale。通知译文缓存增加目标语言隔离，未调用真实付费 AI。代码示例 token 修复不依赖语言/AI请求。中文资源 `app/_locales/zh-CN.ts` 额外逐段完整阅读并补读最终变化（独立证据见 `review-frontend-locales-zh.json`）；模板必填/画布范围、OSS扫描/Markdown支持描述和解谜分类文案已反馈并由核心执行者更正。

本范围已确认的上述硬编码问题 **FE-UIB-012 已修复并通过组件验证**。这不代表全站所有动态业务内容已翻译、全部八语言语义质量合格或长译文布局验收通过。普通目录过滤、动态 key、长译文、focus/dialog 键盘体验只有静态证据，实际浏览器验收另记。管理员内容属性/recipe 模板保存期间继续编辑以及多个详情换路由失败后的旧显示属于待场景验证风险，未凭推测计为已验证缺陷。

服务端权限、数据完整性、真实对象存储、AI worker 的源版本/人工译文保护、额度原子性、超时/崩溃恢复不由这些前端组件测试证明；须对应后端与总任务独立证据。

## 可复现测试与证据

环境：仓库 lockfile 安装，Node/npm 版本由总任务环境记录；Vitest 4.1.11、jsdom 和 Testing Library 由根执行者安装。仅合成 ID/内容/会话值；API、OSS/第三方供应商 mock，Markdown 实际解析器、真实 React 和组件状态/事件逻辑保留。

- PASS：`npx vitest run tests/frontend-ui-b*.test.tsx`，7 文件 **32 测试**，日志 `/tmp/frontend-ui-b-all-green.log`（任务临时证据，不提交无关日志）。
- PASS：针对12修改组件、2语言资源与7测试的 `npx eslint ...`，退出 0；命令见本任务审查台账 validation。
- PASS：`npx tsc --noEmit`，最终整仓退出0；未把类型检查当构建/浏览器验收。
- FAIL 基线红灯：9条早期测试8失败/1通过；评论3失败、私信2失败、资源重复搜索1失败、简单目录1失败、同反应重复点击1失败、账户切换1失败（其余缓存语言通过）。均实际执行，日志分别 `/tmp/frontend-ui-b-{red,comments-red,messages-red,picker-red,catalog-red,reaction-red,session-red}.log`。
- 附件旧源测试3项实际失败；首次红灯运行还包含 beforeEach 返回mock造成的测试清理超时，该测试fixture已修正，**不把清理超时当成项目缺陷**。修复后3项通过。
- 初次框架运行的 Vite alias 导入失败及反滥用fixture缺 policies 错误属于测试准备问题，修正后才记录业务红绿；不冒充业务根因。
- i18n 实际旧源码运行5项4失败/1通过（楼层此前已迁移）；风险总览实际旧源码1失败/其他5通过。分别记录 `/tmp/frontend-ui-b-i18n-red.log`、`/tmp/frontend-ui-b-risk-metric-red.log`。
- 早期整仓 typecheck 曾受并行修改 `i18n-provider.tsx` unknown/string 类型失败影响，已反馈根执行者；最终整体 lint/typecheck/build/真实浏览器与服务集成以总任务最终记录为准。

正式行为/维护说明见 `docs/frontend-interaction-reliability.md`。本报告不声称 CI 全绿、两个仓库全部审查或生产健康已验证。

五个委派文件的 7 类已实现修复及其动态未覆盖边界见 `frontend-ui-b-delegated.md`。用户资料额外 FE-UIA-020 修改属于原 65 文件，本执行者已独立完整重读最终199行，不重复扩大原70分母。
