# 前端UI-A逐文件审查与修复证据

基线4f82c9075636cc4f1f6d3eb07de37a3fffd1de58，清单review-manifests/frontend_ui_a.json。68基线文件20,526行完整人工读取/语义审查，部分0、未读0、排除0。最终指纹/行段见review-frontend-ui-a.json；未改行与已读基线逐行比对，修改段/受影响调用链重读。读取覆盖不是测试覆盖。

本域没有独立取得完整历史问题清单，以下22项为本次确认问题/低风险闭环补全，不称为历史“约20项”剩余。全项目历史核实由根审计汇总。无生产操作或真实付费AI。

| ID/级别 | 状态 | 根因/影响 | 修复位置 | 验证范围 |
|---|---|---|---|---|
| FE-UIA-001 P1 | 已修复；已验证通过（限本行断言） | 收藏关系GET失败后空选择可清除既有关系 | favorite-picker-modal成功初始化门禁/重试、账号scope、重复建夹保护 | 2组件红绿PASS |
| FE-UIA-002 P2 | 已修复；已验证通过（限本行断言） | 取消关注拒绝未捕获、无反馈 | project-follows-panel保留失败条目/错误/重试 | 组件红绿PASS |
| FE-UIA-003 P2 | 已修复；已验证通过（限本行断言） | 旧目标评分响应覆盖新目标 | rating-panel请求序号、目标/账号scope | 乱序组件红绿PASS |
| FE-UIA-004 P1 | 已修复；已验证通过（限本行断言） | 权限读失败空PUT擦除授权 | UserRoleEditor无details拒写 | 实际AdminConsole组件红绿PASS |
| FE-UIA-005 P1 | 已修复；已验证通过（限本行断言） | AI覆盖等待期间人工编辑、旧源文/损坏占位符可应用 | 翻译/权限目录snapshot、最新输入ref、ai-translation-fill | helper3+实际人工竞态组件PASS；非语义质量 |
| FE-UIA-006 P1 | 已修复；已验证通过（限本行断言） | AI provider用陈旧初始快照，models/task GET吞错仍可全量保存 | useAIConfigDraft成功GET才编辑/保存、错误重试 | UI-B实际AdminConsole配置组件3例PASS：GET503门禁、重试中0PUT、fresh snapshot保存保留其他provider/model/task/配额；非所有GET分支/真实密钥/多管理员并发 |
| FE-UIA-007 P1 | 已修复；已验证通过（限本行断言） | 通知模板GET失败可保存空列表 | NotificationTemplatePanel loaded门禁/重试 | UI-B实际AdminConsole组件1例PASS：GET503后拒写、retry读取完成才保存并保留其他locale/version/变量；非持久化/多管理员并发 |
| FE-UIA-008 P1 | 已修复；局部/静态验证（独立交互NOT_RUN） | 上传logo把cookie-session当Bearer，真实会话失败 | 仅JWT设置Authorization，core代理同源cookie透传 | 客户端静态；代理回归由core记录 |
| FE-UIA-009 P2 | 已修复；已验证通过（限本行断言） | await后event.currentTarget为null，创建成功却报错 | UsersPanelV2先捕获formElement再await/reset | 真实组件2例PASS：POST和refresh分别deferred、成功reset/忙碌释放；create失败保留输入可重试。补测首次当前版通过，无独立旧版红测 |
| FE-UIA-010 P1 | 已修复；局部/静态验证（独立交互NOT_RUN） | 上传恢复key跨cookie账号共享ZIP/ticket，旧上传持续显示 | mod-catalog-data传user.id、key重挂载、abort、无身份不恢复 | 客户端静态；store测试由core记录；真实上传NOT_RUN |
| FE-UIA-011 P1 | 已修复；已验证通过（限本行断言） | 换cookie账号私有资料残留，迟到PUT可把A重新保存到全局auth，旧头像上传可使用新账号cookie提交 | user-home账号key、mounted及同步isCurrentAuthUser前后守卫、saveAuth期望ID；Core条件保存只更新资料保留最新授权/会话 | 真实组件6例PASS：正常保存、换账号即时清空、旧GET/PUT、React尚未重挂载时全局ID保护、旧头像完成后0PUT；迟到PUT实际红→绿。Core真实auth另7例+bootstrap2PASS含最新权限/pending刷新；多账号浏览器NOT_RUN |
| FE-UIA-012 P2 | 已修复；已验证通过（限本行断言） | 清空日期在渲染中toISOString抛错 | changelog有限日期提交校验，payload仅try内构造 | 清空不崩溃/不写组件PASS |
| FE-UIA-013 P1 | 已修复；已验证通过（限本行断言） | 资产metadata锁定后逐语言content PUT形成部分保存 | localized-asset-editor单次全语言metadata、失败拒写、待审/发布区别 | skin/blueprint2原子请求+读失败组件PASS；PG由API-A/B记录 |
| FE-UIA-014 P2 | 已修复；已验证通过（限本行断言） | 详情非404错误永久loading、旧结果跨目标 | modpack/simple详情scope/abort/错误重试 | 2失败恢复组件PASS |
| FE-UIA-015 P2 | 已修复；已验证通过（限本行断言） | 表情启停/删除失败未处理 | admin-sticker统一busy/catch/refresh、路径编码 | pack/sticker各启停/删除共4组件例PASS：失败反馈、busy拒重复、恢复可重试且刷新真实状态；补测首次当前版通过，真实OSS上传NOT_RUN |
| FE-UIA-016 P2 | 已修复；已验证通过（限本行断言） | 导出轮询/下载未捕获，选择变更仍用旧预检；恢复成功后旧错误残留，手动下载无互斥 | favorite-export当前配置校验、轮询成功清错、自动/手动下载统一错误与ref/native busy | 4组件例PASS：轮询失败后ready清错/仅一次自动下载；自动和手动失败→手动成功清错/忙碌拒重复；版本和loader分别变更须fresh预检。恢复清错2例实际红→绿；真实导出产物NOT_RUN |
| FE-UIA-017 P2 | 已修复；已验证通过（限本行断言） | 旧日志Abort污染新分享、硬编码中文、复制失败无反馈 | log-share-viewer key/cancelled、i18n/locale、错误重试 | Abort组件红绿PASS；词条validator由core记录 |
| FE-UIA-018 P1 | 已修复；已验证通过（限本行断言） | 原内容GET失败空表单/自动draft可覆盖数据 | 3项目编辑器loaded门禁/重试/账号key、访客优先登录 | 6组件断言PASS；draft hook为隔离fixture |
| FE-UIA-019 P2 | 已修复；已验证通过（限本行断言） | AI失败无界面恢复/取消、状态不推进 | AITaskLogs授权retry/cancel、费用确认、stableUID、活动轮询 | 2实际AdminConsole组件POST/确认PASS；状态机由DB记录 |
| FE-UIA-020 P1 | 已修复；已验证通过（限本行断言） | 公开个人页旧profile/follow/block异步结果覆盖新目标，cookie换账号同目标未刷新 | user-profile账号/目标/token工作区key、cancelled/mounted门禁、动作互斥，屏蔽后迟到不再额外读旧目标 | 3基线测试2FAIL/1PASS→最终4PASS（含同目标cookie账号切换） |
| FE-UIA-021 P2 | 已修复；已验证通过（限本行断言） | 长收藏夹名使左栏按内在最小宽度扩张，操作按钮穿透右栏被遮挡无法点击 | user-home aside/row min-w-0，操作按钮 shrink-0，删除触摸目标44px，长标题换行 | 真实 production E2E 基线点击失败；修后 eslint PASS，真实production browser普通用户正常点击删除204及刷新不存在PASS（case约4.5s、suite实际5.8s），无forceClick；/tmp/mcmods-e2e-ordinary-seventh.log |
| FE-UIA-022 P2 | 已修复；已验证通过（限本行断言） | 切换收藏夹时B标题下仍显示A条目，B读取失败保留旧条目；删除选中非默认夹后也会暂留旧数据 | user-home以collectionId/token/attempt隔离items/error，当前请求加载/错误/重试，迟到响应cancelled | 默认夹契约的3组件例0c04旧文件全3FAIL→最终PASS：B deferred不留A、B失败反馈及显式retry、删除A后选回默认夹GET pending不留A并恢复默认条目；非后端持久化/E2E |

## 模块与角色/用例矩阵

| 模块 | 角色/入口 | 完成用例与真实边界 | 验收 |
|---|---|---|---|
| 目录/资源详情 | 访客/用户：mods/modpacks/content-projects、skin/blueprint | URL筛选、详情、下载、收藏评分；公开性服务端控制 | 全静态；详情失败/评分乱序动态 |
| 收藏/关注/导出 | 用户：资源按钮/工作台 | 关系读取→选择/建夹→写入→失败保留→重试；预检/导出/下载 | 收藏关注动态；导出轮询/下载/选择恢复、收藏夹切换/读取重试动态 |
| 项目/资产编辑 | owner/collaborator/reviewer：new/edit、ReviewLock | 基线读取→编辑/上传→修订→待审反馈；换账号不留表单 | 项目失败/访客、资产单PUT动态；真实锁后端验证 |
| 后台/RBAC | 实际后台permission：AdminConsole | 权限/模板/配置读取后替换；写失败保留输入 | 权限/AI配置/通知模板实际组件；未覆盖所有后台GET分支或多人并发 |
| i18n/AI运营 | ai.task.enqueue/ai.write：翻译管理/任务页 | snapshot→mock任务→只补未改空目标；重试/取消→费用确认 | 人工竞态/占位符/操作POST动态；无真实AI |
| 账号/经济/玩家档案 | 登录用户/公开资料访客 | 私有工作台、草稿、余额/任务、公开档案 | 真实production浏览器profile保存/刷新、private长名收藏夹建删/刷新PASS；同cookie多账号私有工作区与迟到保存组件PASS；多账号浏览器、经济和玩家档案完整旅程NOT_RUN |
| 日志分享 | 用户创建、访客读取 | 脱敏上传→code读取→查询/复制/下载 | 读取Abort动态；实际脱敏/下载由根/后端记录 |

## 验证与局限

Vitest4.1.11/jsdom/testing-library，自己的HTTP API全部确定性mock；不称真实前后端联通或浏览器E2E。最终本域+委派8文件42测试PASS，2026-10-01 14:03:40 UTC，退出0；命令/证据见ui-a-validation.json。完整build、安全扫描、浏览器和PG由根汇总。

真实红绿：收藏/关注/评分12:50:04 4FAIL→12:52:13 4PASS；实际AdminConsole临时基线13:10:49 2FAIL→13:11:03 2PASS；日志13:12:47 FAIL→13:20:13 PASS。临时基线副本已移除。资产测试初次失败是fixture误用嵌套fields，而API为flat字段；修正fixture后通过，未虚构业务红绿。项目编辑器/任务操作在修后增加，不宣称基线红绿。

FE-UIA-R001 P2需改进：多个管理员全量PUT配置的版本冲突保护尚无证据，本次只修读失败和陈旧初始快照；最小解除条件为后端并发fixture/条件写入契约。静态不能证明生产性能、容量、备份恢复或真实AI费用。正式行为/部署顺序见../ux-reliability.md：先部署skin原子metadata和AI retry/cancel后端，再前端；前端本身无需schema迁移。

Core追加的申领/编辑审核真实分页已复查本域admin-mod-panels与委派admin-community对应修改段，保留原有完整基线审查，最终指纹见各ledger。分页测试/真实PG由Core独立记录，不重复计入本域42测试。

Core追加 LogCleanupPanel 5310–5400 已实际补读：后端明确返回503/LOG_CLEANUP_FAILED且details.saved/config有效时保留已经保存的策略，展示清理失败提示，不把部分成功标成清理完成。当前console最终6169行；Core2实际组件回归红1FAIL→绿2PASS，独立证据见其测试/报告，不重复计入本域42测试。

表中状态按真实验收范围披露：局部/静态验证不冒充独立交互通过；FE-UIA-R001是并发保护的待核实风险，未计入22个确认问题。跨Core修复使用关联证据，不重复计数；Yggdrasil GET只读字段回传400由UI-B的FE-CONTRACT-001独占修复/红绿测试，本域只读跨AdminConsole调用链。

2026-10-01追加验收保留历史：上述009/011/015/016及006/007在14:03版本仅静态/独立交互NOT_RUN，本轮补齐可执行的组件边界。ui-a-final-interactions.test.tsx共19例（009×2、011×6、015×4、016×4、022×3），API/OSS下载/上传、auth snapshot/helpers与无关子组件为确定性fixture；运行真实UsersPanelV2/UserHome/Sticker/Export组件，不能当真实后端持久化、OSS产物或付费AI。011/016的补测发现遗漏后重新修复既有ID；原13例10PASS/3FAIL→13PASS证据为/tmp/frontend-ui-a-final-interactions-red.log与-green.log。022最初受控空列表测试不符合后端必保留default契约，已换成default+A删除后回default的正常契约，旧记录仅保留历史，不将空列表当正常可达缺陷。准确fixture旧0c04组件（整份旧user-home替换，仅运行022的3例）红绿证据为/tmp/frontend-ui-a-favorite-default-red.log与/tmp/frontend-ui-a-final-interactions-supported-final.log；临时红测配置首次缺alias在导入阶段失败（无测试执行），见-favorite-default-red-harness-import.log，修正隔离配置后重新执行，不计作业务红测。最终selected eslint/wholeTSC见-supported-lint.log/-supported-tsc.log；完整工程回归与production浏览器由根在最终源码重新运行。

006/007补证由UI-B独占新增admin-config-load-contract.test.tsx（4例，164行）；最终采用后端实际支持site/default day/hour配额，/tmp/frontend-admin-config-load-contract-supported-final.log 4PASS。证据与边界见admin-config-load-contract.md、admin-config-load-validation.json；不重复计入本域42或追加19。此前不支持的user scope fixture属于测试输入错误，已修正但未放宽保留字段断言，不称后端接收通过。

011全局保护调用链只读复核Core最终auth.ts：条件ID同时检查当前身份与返回AuthUser.id，仅替换username/avatarUrl/signature，保留最新token/email/roles/rules/versions；同ID资料更新不取消pending权限读取，后续/me授权应用同时保留较新资料。Core真实auth7例及原bootstrap2例证据/tmp/frontend-auth-cas-complete-core-final.log，不重复计入组件19。ProfileSettings提供publicId而非认证id，未把public UID误当认证ID。

追加范围最终读取/语义/指纹与逐命令结果见review-ui-a-final-interactions.json，机器登记仅记录已人工读取的明确文件，不据hash自动认定完整。19组件测试、Core9认证测试、UI-B4配置测试分别记录边界，不合并成重复计数。

022红测来源已校正：18:04:10 UTC实际隔离Vite加载整份旧user-home.tsx（862行，SHA256 7380fee9cb1d9ee74e3c4a785f6a45858e7f85cdbd715546f008be2eb263eebe），逐字节等于0c04f80a2f796b5a5e24420405add4db03147ae7与2f85189af62fcbfa3fb6a98194fabda7fb814f7b相同路径。只运行022三个测试、过滤其余16个，不称整旧组件全面验证；不是仅替换旧FavoriteCollectionsPanel函数。旧函数606–744与新函数617–776的语义已对照：前者无scope的items，后者collectionId/token/attempt快照。ec7d4d5是修复后的业务提交，记录编写时HEAD不能作为红测旧源；审计原基线仍4f82，working_source_commit另列ec7。
