# 委派布局与资源边界组件验证

2026-10-01，补充 FE-UIB-D004/D006；仅新增 ui-b-delegated-boundaries.test.tsx，未修改冻结的业务源码。实际 ModContentLayoutEditorPage、ModContentResourceEditor、RangeFieldEditor、EditorShell、useAutoDraft 执行；认证/路由/词条、项目和草稿 API wrapper 使用确定性 mock，无关 ToolsPlayground 不挂载。写请求故意返回“Captured … write”错误，断言真实调用参数，不声称后端持久化、鉴权或浏览器 E2E 验收。

三个测试分别验证：父下拉拒绝使子孙深度5的调整且保存仍为原父，允许最大深度4的调整且保存保留父子关系；资源 GET 失败时无编辑/保存/删除入口，selected draft 未读取、隐藏页面事件不保存草稿、无资源写入，移除 draft 深链接后 retry 读取 fresh 内容/修订并提交；在原范围1–3已挂载后，实际草稿 hook 迟到恢复4–9，界面和提交均为4–9，随后编辑7–12的界面/提交仍一致。

同一最终测试通过临时 Vite load 插件读取基线 4f82c9075636cc4f1f6d3eb07de37a3fffd1de58 的两个组件源码，其余当前依赖/mock保持相同，不 checkout/覆盖工作区。17:39:53 三项全部 FAIL，分别观察父变为 target-three、GET失败仍显示 form、恢复后范围仍1–3；/tmp/frontend-ui-b-delegated-boundaries-baseline-red.log。临时配置与原始快照位于 /tmp/mcmods-delegated-component-red-4xhke3he/，属于本任务隔离证据，不提交。

最终正常命令 `npm test -- app/_components/__tests__/ui-b-delegated-boundaries.test.tsx`：17:41:51 三项 PASS（退出0，2.98秒），/tmp/frontend-ui-b-delegated-boundaries-final.log；最终三条断言与红测相同，前一正常运行17:39:12亦3PASS。目标 ESLint、全库 typecheck、diffcheck 通过，日志 /tmp/frontend-ui-b-delegated-boundaries-lint.log、/tmp/frontend-ui-b-delegated-boundaries-tsc.log、/tmp/frontend-ui-b-delegated-boundaries-diffcheck.log。首跑2PASS/1FAIL是测试错误地把 Testing Library 50ms轮询当成 autosave；删除该不合理断言，并实际模拟 visibilityState=hidden 后检查草稿边界，未改生产实现或弱化业务断言，原日志 /tmp/frontend-ui-b-delegated-boundaries-first.log 保留。

证据局限：未覆盖实际数据库/API权限、上传、浏览器拖拽或任意无效字段编辑中恢复的所有组合；本测试范围的恢复与重试已动态验证。审查清单和最终指纹见 review-delegated-boundaries.json；原委派5文件分母及完整人工审查记录仍见 review-frontend-ui-b-delegated.json，不重复计数。
