# UI-B委派长文件审查

frontend_ui_b明确委派5文件（不并改）：admin-community-panels、mod-content-resource-editor、mod-content-layout-editor、tools-playground、mod-resource-components。基线4f82c9075636cc4f1f6d3eb07de37a3fffd1de58，共6,234行。完整人工读取5、部分0、未读0、排除0；最终指纹/真实读取段/最终修改段见review-frontend-ui-b-delegated.json。根负责集成复核，不重复计入UI-B70文件分母。

| ID/级别 | 状态 | 已确认根因 | 修复与验证 |
|---|---|---|---|
| FE-UIB-D001 P2 | 已修复；已验证通过（限本行断言） | 新role超出thresholds长度时updateAt只map已有数组，新阈值输入被忽略 | selectedTrack.roles完整生成并保留原值；组件红绿PASS |
| FE-UIB-D002 P2 | 已修复；已验证通过（限本行断言） | 经济/等级GET失败页面永久loading无恢复 | loadError/retry、成功后才能save；2组件红绿PASS |
| FE-UIB-D003 P2 | 已修复；已验证通过（限本行断言） | 活动新筛选被旧请求覆盖 | 请求序号保护items/notice/finally；组件红绿PASS |
| FE-UIB-D004 P1 | 已修复；已验证通过（限本行断言） | 改名重建语言对象清空summary/contentMarkdown，父选择绕过层级检查 | 保留已有语言对象、复用reparentCategory；改名红绿PASS；新增真实组件红绿PASS：父下拉拒绝使子孙深度5的重挂接并保留原提交值，允许深度4且提交正确父子关系。证据见delegated-boundaries.md |
| FE-UIB-D005 P1 | 已修复；已验证通过（限本行断言） | 受控Markdown忽略外部value恢复；初始GET失败自动把示例覆盖草稿 | value直接受控、用户操作才onChange、GET失败不ready并重试、空草稿保留；2组件红绿PASS。保存串行、同内容失败暂停自动重试：延迟失败13:47:43发现4次自动PUT→最终一次自动+一次手动PASS（复查本次引入缺陷已修） |
| FE-UIB-D006 P1 | 已修复；已验证通过（限本行断言） | 资源GET失败空编辑/草稿、range未随外部恢复；布局换cookie账号残留旧私有内容 | loaded门禁/重试、资源/账号key、外部范围同步；布局换账号组件PASS；新增2真实组件红绿PASS：GET失败无编辑/删除/提交入口且不读取/保存草稿，retry加载新内容/修订后提交；实际useAutoDraft迟到恢复范围后界面与提交及后续编辑一致。API mock组件边界，非真实落库/E2E；证据见delegated-boundaries.md |
| FE-UIB-D007 P2 | 已修复；已验证通过（限本行断言） | 导入detailUrl直接作href，缺协议检查 | http(s)/单斜线内部白名单，拒javascript/data/协议相对；5组件红绿PASS；真实供应商攻击链未验证 |

| 模块 | 实际角色/入口 | 完成用例/持久化边界 | 验证 |
|---|---|---|---|
| 社区运营/经济/等级/任务 | 后台permission→AdminConsole | 活动查询、货币/商店/等级/任务配置，后端RBAC | 全静态；阈值/错误恢复/乱序动态 |
| 布局 | owner/collaborator→arrange独立窗口 | 完整读取→改名/移动/进度图→单修订→通知原窗口 | 描述保留/换账号动态；拖拽浏览器NOT_RUN |
| 资源定义 | owner/collaborator→resources/new/edit | 版本上下文、定义/范围、图标、翻译、审核锁 | 静态；真实上传/锁其他报告 |
| Markdown工具 | 访客本地/用户服务端/嵌入 | 读取→编辑/外部恢复→串行保存/手动恢复→预览；drawio校验origin和具体iframe | 受控恢复/读写失败动态；外部drawio未调用 |
| 导入资源展示 | 访客/用户 | 物品、配方、战利品、交易等展示/来源跳转 | 危险/合法URL动态；概率locale格式 |

原委派7测试13:26:38全部FAIL→13:28:41全部PASS；URL5测试13:32:18 3FAIL/2PASS→最终5PASS。最终和UI-A合计8文件42测试PASS，命令/结果同ui-a-validation.json。mock组件不等于真实联通。7类确认问题已实修，部分动态未覆盖按表披露。

待验证：跨管理员全量配置并发；真实浏览器canvas/drag/pointer/iframe；大进度图；真实资源上传恢复。无产品方向扩张/付费依赖/生产数据处理/schema变更。正式行为见../ux-reliability.md。

根追加委派user-profile.tsx（原五文件之外单独计数）：全文读取，FE-UIA-020已复查和4竞态断言PASS，额外ledger字段additional_files；不扩大原5文件6234行分母。
