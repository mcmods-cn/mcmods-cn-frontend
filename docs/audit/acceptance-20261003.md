# 剩余验收：2026-10-03

本轮从已合并审计的 `4a611deb25125cc04928512b25765512743c10a3` 创建
`codex/acceptance-followup-20261003`。原前端 #6 已合并；本轮交付为草稿
[前端 #7](https://github.com/mcmods-cn/mcmods-cn-frontend/pull/7)，关联
[后端 #7](https://github.com/mcmods-cn/mcmods-cn-backend/pull/7)。
完整的跨仓库问题、逐文件证据、环境及最终回归记录由后端
`docs/audit/20261003/ACCEPTANCE.md` 汇总。下列本地结果绑定本轮实际执行版本；
远端 CI 按各 PR 当前 HEAD 单独核查，不以局部通过代替完整回归。
最终清单 664 文件，662 个纳入人工审查，2 个合理排除（锁文件与二进制）；
阅读及语义证据由关联后端台账按最终指纹发布，测试覆盖不使用这个分母。

## 已实现的行为

| 稳定 ID | 页面与变化 | 已执行证据 |
| --- | --- | --- |
| OCT03-FP-001 | 未解析引用类型读取失败可独立重试，保留搜索、过滤和页码。 | 旧产物 RED；真实 production React 的失败/Retry、七类来源及空续页回退通过。 |
| OCT03-FP-002 | About 界面语言切换保留人工编辑，不重读覆盖草稿；内容语言切换仍隔离读取。 | 旧产物 RED；语言、读取失败、CAS 冲突及重试断言通过。 |
| OCT03-FP-003 | 更新日志按请求代次隔离续页，返回上一页后迟到结果无效；读取失败提供重试。 | 旧产物 RED；真实游标交错、双语草稿和发布状态通过。 |
| OCT03-FP-004 | 资源补全按实际 ID/种类/注册表/语言/会话确定请求范围，等值新数组不会重复请求。 | 真重复请求 RED；原严格批量请求次数及语言切换断言通过。 |
| OCT03-FP-005 | 导出忙碌时保留模态焦点，关闭后显式恢复仍连接的原焦点元素。 | 忙碌 Tab 和关闭恢复分别 RED；r6 全 11 项严格断言通过。 |
| OCT03-FS-001 | 跨标签页应用合法、有限且更新的界面语言偏好，拒绝过时事件，不改变认证状态。 | 旧 storage 事件 RED；六项单元和原生浏览器事件通过。 |
| OCT03-FS-004 | AI供应商/模型/任务绑定在最新配置成功读取后才开放编辑，失败只读重试，跨面板保留刚保存的完整配置及预算。 | 三种原版真实RED；四项生产页面回归、有限角色与完整回归通过。 |
| OCT03-R-001 | 服务器列表测试排除Next隐藏流式暂存输入，仍严格要求唯一可见控件，保留原scope/cursor断言。 | 自然hidden S:1/visible观察、旧选择器同形RED、新GREEN和两个visible负例拒绝；最终整次168项通过。 |
| OCT03-FS-005 | 日志轮询夹具等待精确游标响应及新DOM marker，保持原时钟、次数、去重和卸载断言。 | 旧R8定向、新R9定向和完整168项通过；测试同步问题，不计产品漏洞。 |
| OCT03-FS-003 | 权限设置在三个初始快照成功后才开放编辑，失败可明确只读重试，取消旧账号读取。 | 旧产物受控迟到读取确实覆盖已选角色；初始门/Retry/旧账号及原 FS024 在R9定向及完整回归通过。 |
| OCT03-FS-002 | 审核队列使用同步代次守卫，同轮双击仅请求一次续页；旧完成不能解锁新范围。 | 旧产物重复 cursor GET 的 RED；新产物严格双击、两页去重及单次签名通过。 |
| OCT03-DB-001 | 静止结构场景停止重复 GPU 提交，相机、切层、尺寸和迟到纹理变化仍重绘。 | 原生 WebGL RED；七项准入、切层、恢复、释放与未完成加载取消均通过。 |

低风险重试和焦点修复继续复用既有词条，没有复制源语言填充词条覆盖率。
正式行为、输入保留与角色边界见 [状态恢复说明](../frontend-state-recovery.md)
和 [后台数据完整性说明](../admin-data-integrity.md)。结构渲染说明在
`lib/mcmods-exporter/renderer/README.md`，原预算和安全拒绝未放宽。

## 测试与复现

遵循 `package-lock.json`，使用 Node 24.19.0、npm 11.9.0、Playwright 1.62.1
及其 Chromium；需要浏览器时按项目约定安装浏览器与系统依赖。

```sh
npm ci
npm run check
npm test
NEXT_PUBLIC_SITE_URL=https://www.example.test \
NEXT_PUBLIC_API_BASE_URL=https://api.example.test \
NEXT_PUBLIC_YGGDRASIL_API_ROOT=https://api.example.test/api/yggdrasil/ npm run build
npm run test:browser
```

最终346项单元通过，lint/typecheck与R9 production build通过，构建ID `cxcdMg6fyUnzZQuSDjmcz`，运行代码基线 `f27ce5a`，最终测试提交 `afa8ee2`。
最终R5整次168PASS、0FAIL、0CANCEL、0SKIP，452.875秒，命令/指纹守卫均exit0，运行文件无漂移。
FS003 修复前的 production 构建 ID 为 `ACokhErJZ9doR-SXy-iro`，业务与验收提交为 `7f52569`。
首轮完整浏览器 129 项有 124 PASS、4 FAIL、1 timeout CANCELLED，原失败保留；
fixture 的 DTO、必填值、请求就绪和视口目标问题分别纠正，实际产品缺陷另列。
FS003 修复前一次完整浏览器 161 PASS、0 FAIL、0 CANCEL、0 SKIP，命令退出码 0，430.370 秒。
运行代码和构建 ID 没有变化；运行中仅 renderer README 校正说明，保守文件指纹
守卫因此退出 1，此结果另存，不能改写成所有文件零漂移。最终 README 已全文复查。

`oct03-*.browser.mts` 运行真实 production 组件、原生对话框、键盘/指针、IndexedDB
和 WebGL，但明确控制本项目 API 响应以复现失败和竞态。它们不证明 PostgreSQL
落库、服务端权限、真实 OSS、邮件或付费 AI。真实前后端收藏旅程另外执行并记录。
SwiftShader/ANGLE 的短时结果不等于实体手机、全部显卡或长期显存行为。
真实联通另用最终 Go 代码和独立 Next dev 副本执行，1 PASS、0 SKIP、3.955 秒；
项目 API 未替换，真实登录、收藏落库/刷新/删除及退出通过，所属进程/子库/43Redis key/NATS stream清理已核实；19项工具回归通过，本任务专属服务最终停止，原服务保留。

600k 场景的功能闭环通过，但冻结R9的最终R5整次切回全部实例耗时14.502秒，最长记录14.300秒
主线程长任务。另一次冻结R9的CPU/timeline诊断中All14.581秒，事件处理约205毫秒，
JS定位到切层/实例包围体更新；处理结束至commitFinish另有14.1667秒，主要采样仍属
未归属JS的(root→program)。目前定位到呈现/native边界，不能据此断言GPU耗时或
硬件根因。静止重绘缺陷已修复，最大规模响应速度仍需改进。同步 CPU 解析立即取消、物理 GPU 和长期内存仍未验证。

## 环境兼容、依赖与发布

Docker 可选 BuildKit `proxy_ca` secret 只为安装命令提供受信代理 CA，保持严格 TLS；
实际镜像构建及非 root runtime 已验证，CA 不进入最终镜像。参见根 README。

当前 npm audit 发现 GHSA-vfj7-8cjw-p6xm：一个公告影响五个开发依赖包。
官方尚无兼容修复版本；生产 `omit=dev` 扫描无该公告。没有降低扫描门槛、降级
Next.js 或宣称开发依赖公告已修复；准确可达性和许可证结论见后端本轮安全报告。

本轮前端没有数据库迁移或付费服务依赖。后端的生产 Presence 密钥校验、蓝图
worker 补偿及显式标签索引操作须按对应后端文档发布。没有自动合并、生产部署、
真实数据外发或真实 AI 付费调用。

远端已实际启动 CI；首个 `7f52569` 版本的 npm-audit 与本地一样失败，
原因是上述未修复上游公告，其他检查提交本文时仍在运行。最终 HEAD 的结果以
交付时查询为准，保留该失败，不自动豁免安全门。

旧 CI 另发现 FS024 间歇失败（同一版本一 FAIL、一 PASS）：权限初始读取未完成时
控件可编辑，迟到读取覆盖已选默认角色。OCT03-FS-003 的确定性旧产物 RED 已复现
实际值丢失；保留该 CI 失败与原精确断言，该失败已确定性复现并修复，当前完整回归通过。

原R8整次164项曾有1个FS030请求同步断言失败；保留失败，不靠重试选绿。
15:00前核对f27ce5a远端quality/container四项通过，npm-audit两项仍失败；后续文档HEAD的CI由PR和交付答复另核对。
AI配置的同面板读取后多管理员并发整份PUT冲突策略仍未新增，不把本次初读/跨面板修复宣称为CAS治理。

1f5c77f的文档CI曾167PASS/1FAIL，ID-only选择器匹配Next隐藏SSR暂存与真实可见输入。
本地自然观察确有hidden S:1及一visible；动作时暂存已消失所以原本地case通过，不伪造自然RED。
OCT03-R-001用确定性同形隐藏副本验证旧选择器RED，新visible strictcount1通过，
两个visible反例仍拒绝；没有使用first/nth、隐藏真实UI或改原游标断言。
后续只改测试/报告，运行源码与R9构建及606项真实联通输入逐字节一致，
新增check/346unit及完整168项回归均通过。正式最终HEAD的CI仍单独核查。
