# 编辑、翻译与任务恢复行为

接口鉴权、数据发布和额度判断由后端负责；按钮权限不能替代服务端授权。

收藏关系、项目/资源编辑、皮肤/蓝图元数据和后台权限/配置必须成功读取现有内容后才能替换写入。首次读取失败展示错误和重试，不保存空表单或默认示例。访客打开项目编辑页得到登录入口，账号切换重置私有工作台、编辑内容及上传恢复状态。

Markdown游乐场成功读取服务端草稿后才自动保存，空草稿保留为空。嵌入编辑器展示父组件value，外部恢复不触发旧内容回写。保存串行，同内容写失败暂停自动重试，可点保存手动重试或继续编辑。布局改名保留该语言摘要/正文，父栏目选择复用层级/循环检查。

皮肤和蓝图以一次metadata PUT提交defaultLocale及localizations[{locale,name,summary,contentMarkdown}]，不再先取得审核锁再逐语言PUT /content。后端在同一修订快照处理所有语言；界面未提供删除某语言操作。reviewRequired:false才提示已发布，其余提示提交待审核。先部署支持skin metadata localizations的后端，再部署此客户端；旧请求省略localizations的兼容性由后端保留。前端无需schema迁移。

界面静态翻译沿用普通{name}占位符格式，不声称支持ICU复数/选择。AI结果只补仍空、源快照未变化且占位符集合一致的字段；等待时输入但未失焦的人工译文也受保护。无合格结果不提示“完成0项”。

后台只对queued/running/retrying任务定期刷新。ai.task.enqueue用户可明确重试failed任务；ai.write可取消活动任务，分别POST /api/v1/admin/ai/tasks/{taskUid}/retry或/cancel，JSON {}。确认说明供应商可能已计费、重试可新增费用、取消不能撤销远端费用。先部署这两个后端接口，再部署操作界面。重试由用户触发，旧任务和用量保留，后端校验状态/版本。

模组导入IndexedDB恢复key包含真实账号ID，cookie-session不共享session命名空间；换账号中止旧上传/轮询，无身份不恢复签名ticket。收藏夹导出预检必须对应当前Minecraft版本/加载器，轮询及复制/下载失败有反馈。详情和日志可重试并忽略旧请求；日志文案、日期和数字按当前语言展示。导入detailUrl仅允许单斜线站内路径或HTTP(S)，拒绝javascript/data/协议相对URL；后端抓取和Markdown安全属于独立边界。

组件回归使用确定性模拟API，无真实付费AI，不能证明供应商连通性、语义质量、真实费用或完整前后端联通。
