# 首页与后台浏览器对照

基线为前端 `e9948fde232581705fcedecbbf2a23312b4be726`，修改后为 `429957a59ab13e0869857291590a806876cda623`。两次使用生产构建、本机 Playwright Chromium 151.0.7922.34 和相同视口。测试身份、接口响应与模组名称均为合成数据。截图没有使用生产账号或私有资料。

| 页面与条件 | 桌面 1365 × 840 | 手机 390 × 844 |
| --- | --- | --- |
| 首页，修改前 | [桌面](home-before-desktop.png) | [手机](home-before-mobile.png) |
| 首页，修改后 | [桌面](home-after-desktop.png) | [手机](home-after-mobile.png) |
| 后台总览返回 503，修改前 | [桌面](admin-before-desktop.png) | [手机](admin-before-mobile.png) |
| 后台总览返回 503，修改后 | [桌面](admin-after-desktop.png) | [手机](admin-after-mobile.png) |

## 首页搜索与内容

首页使用四条简体中文模组记录，无封面，其他来源返回空页。搜索分类连接模组、整合包、教程与服务器的现有目录。带空格和标点的查询可通过 Enter 提交，空查询可直接进入所选分类。浏览器回归核对目录实际发出的 API 参数，教程另核对 `kind=tutorial`。

在相同视口、相同字体与合成数据下，使用 DOM 边界测量元素顶部距视口上缘的距离，单位为 CSS 像素。下表四舍五入到整数。

| 元素 | 桌面改前 → 改后 | 手机改前 → 改后 |
| --- | ---: | ---: |
| 搜索输入框 | 304 → 169 | 315 → 201 |
| 首条模组标题 | 701 → 471 | 908 → 449 |

根据原始桌面和手机截图生成了一个布局草图，保留分类入口、紧凑的搜索区以及较早出现的模组列表。成品采用现有表单、链接、主题变量和资料卡。草图只记录布局选择。[桌面和手机概念图](home-concept.png)

## 用户中心、后台与上传

在 `cf34540df9e43ca85a257cd30caae69e49316f7b` 重拍了用户中心和上传进度。用户中心的十个栏目在手机上可以横向滚动，所选栏目带当前页标记。390 像素宽的简体中文设置页显示两列统计，栏目名称保持单行，设置内容进入首屏。[用户中心改前](account-before-mobile.png) · [用户中心改后](account-after-mobile.png)


后台使用英文合成审核账号，仅总览统计接口返回 503。改前整页显示连接失败，改后导航与有权限的面板仍可使用，统计区域可以单独重试。手机折叠导航高 74 个 CSS 像素。权限失效或配置读取失败时，回归分别核对表单不可写、旧响应无法解锁，及未保存输入得到保留。

ZIP 上传的浏览器用例覆盖文件选择和拖放共用的入口、同时触发两次选择时只创建一个导入任务，以及“排队中”“部分导入”“等待审核”的不同状态。原包保持私有，导入成功后进入后端清理流程，请保留本地 ZIP。真实游戏包、数据库、对象存储及独立审核通过根 README 指向的跨仓运行器另行验证。[手机导入进度实拍](upload-status-mobile.png)

完成根 README 的安装与生产构建后，可以单独运行这些界面用例。

```bash
node --test --test-concurrency=1 browser-tests/home-search.browser.mts browser-tests/admin-panel-isolation.browser.mts
node --test --test-name-pattern=FP068 browser-tests/specific-journeys.browser.mts
```

## AI 设置的只读权限

同一合成账号具有 `admin.access` 和 `ai.read`。在 `8cdc617` 使用的旧版界面中，桌面和手机均显示可用的保存按钮，各发出一个被拒绝的 PUT。改后页面说明当前账号可以查看设置，禁用保存、添加、删除与表单编辑。密钥输入保持空白。两个视口各读取一次配置，均产生零个 PUT，宽度均未超出视口。

| 供应商设置 | 桌面亮色，1440 × 900 | 手机深色，390 × 844 |
| --- | --- | --- |
| 修改前 | [桌面](ai-readonly-before-desktop.png) | [手机](ai-readonly-before-mobile.png) |
| 修改后 | [桌面](ai-readonly-after-desktop.png) | [手机](ai-readonly-after-mobile.png) |

截图使用生产构建、真实 Chromium 和本机合成 HTTP 数据。完成根 README 中的生产构建后，可用以下命令重拍当前版本。写入权限、跨管理员冲突、主动清除密钥和撤权同属这个测试文件。[保存与冲突处理](../admin-data-integrity.md)

```bash
MCMODS_ADMIN_AI_SCREENSHOTS=/tmp/mcmods-ai-ui node --test --test-name-pattern='AI readers on desktop' browser-tests/admin-ai-revisions.browser.mts
```

## 后台词条编辑的挂载成本

进入多语言管理时，原界面同时生成 5,103 个可编辑文本框。分页后，默认每页挂载 50 个。搜索与“只看缺失”遍历完整词典，AI 补全继续从所有匹配项选取最多 100 条。翻页后回到原键可读回本地修改。回归也覆盖 AI 处理期间人工修改优先的情形。

| 首次显示翻译表格 | `cf34540` | `77b1ff5` |
| --- | ---: | ---: |
| 每次挂载的词条文本框 | 5,103 | 50 |
| 三次独立页面观测，毫秒 | 6,061 / 8,169 / 5,238 | 650 / 123 / 124 |

两次都使用 1365 × 840 的 Chromium 151.0.7922.34、Next 16.4.6 生产构建、同一份英文字典与合成身份。计时从点击多语言管理到下一次动画帧检测到首个有尺寸的编辑框。机器的 CPU 配额为四核，期间还有其它任务，计时反映该环境的交互等待。可在仓库构建后运行对应面板回归。

```bash
node --test --test-name-pattern='translation editor pages|late local AI completion' browser-tests/admin-data-protection.browser.mts
```
