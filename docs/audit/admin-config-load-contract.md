# 后台配置读取门禁补充验收

FE-UIA-006、FE-UIA-007 原有修复的独立交互缺口现已补测。新增 `app/_components/__tests__/admin-config-load-contract.test.tsx` 使用真实 AdminConsole、实际侧栏入口与内部配置组件，配置 API 使用确定性 mock；认证、导航、语言和仪表盘仅作为测试环境替身。没有调用供应商、生产配置或真实密钥，也没有验证后端权限、持久化或 E2E。

四项测试首次在已经修复的当前源文件运行均 PASS（12.82 秒，`/tmp/frontend-admin-config-load-contract-first.log`）。主执行者复核指出最初正向 fixture 的 user 配额不符合后端现有支持范围，现改为实际支持的 site/default 的 day/hour 两条配额，并保留完整字段断言；协议 openai-compatible/anthropic 已对照 normalizeAIProtocol 与 requestAICompletion 确认支持。修正后的实际结果记录在 `admin-config-load-validation.json`。本轮没有修改业务源码，也没有在旧版本重放，不声称取得这四项的红绿记录。

- 供应商、模型、任务模型三个真实配置入口分别验证：GET 返回 503 错误后出现错误及重试入口，没有可用全量保存；重试请求未完成时仍无 PUT；读取成功后通过对应输入编辑和保存。
- 三个入口的完整 PUT 均与最新单独 GET 的配置一致，仅更改操作的字段。验证保留未编辑供应商、模型、任务关联、额度和翻译 glossary/targetLocales/autoSubmit，避免用 AdminConsole 初始过期快照覆盖新配置。合成 hasApiKey 标记没有真实密钥，不能证明服务端密钥保留。
- 通知模板入口验证同样的读失败/重试门禁；成功读取后编辑目标语言标题并保存，保留另一模板、源语言、未选中语言、正文、variables 和 version。只验证组件发送，不冒充后端版本递增结果。

测试逐项检查发送次数、请求 token、完整提交结构和成功反馈；未出现意外自动重读或重复 PUT。新文件 ESLint、整仓 TypeScript、git diff --check 均实际 PASS，命令和证据见 `admin-config-load-validation.json`。主执行者随后运行整体回归，当前四项 PASS 不能提前代替整体结果。

读取实际 DTO 链发现的默认配置掩盖读取错误问题，已由后端 BE-DB-028 修复：管理 GET/PUT 使用 aiConfigFromSettingsChecked，区分记录不存在与数据库/解密故障；故障返回 503 / AI_CONFIG_UNAVAILABLE，PUT 不保存默认配置。数据库负责人实际 owned PostgreSQL 验证坏加密 envelope、有效 envelope 内坏配置 JSON、缺记录使用停用默认配置、关闭连接池后 503 并用独立观察连接证明原加密配置未被写入；四个叶场景 PASS，日志 `/tmp/mcmods-seed-recovery-final3-race.log`，正式问题条目见后端 `docs/audit/database-ai.md`。本补测已静态复核修复后的调用链；数据库证据归后端执行者，不冒充本代理运行。worker 执行路径仍按已有禁用默认配置停止调用，真实供应商与真实密钥保留未由前端 mock 验证。通知模板同样使用 Checked 读取返回 503。
