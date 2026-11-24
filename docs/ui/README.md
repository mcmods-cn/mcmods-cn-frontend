# 前端截图与界面验收

## 战利品 JSON 保存与举报附件首选

2026 年 11 月 24 日 UTC，Chromium 在前端生产构建 `8e04f9f`、修复写入时序的 `b84979d` 和补齐保存按钮禁用外观的 `c3ca2f2` 上重复相同操作。改前使用 Next standalone，后两版通过本机 HTTPS 加载各自 Dockerfile 构建的 OCI 镜像。页面使用合成数据和受控 API 响应。[改前 CI 失败记录](https://github.com/mcmods-cn/mcmods-cn-frontend/actions/runs/45400170972) · [时序修复镜像](https://github.com/mcmods-cn/mcmods-cn-frontend/actions/runs/45402664698) · [最终镜像构建](https://github.com/mcmods-cn/mcmods-cn-frontend/actions/runs/45403447980)

| 使用同一输入的场景 | 改前 `8e04f9f` | 改后 `b84979d` |
| --- | --- | --- |
| 高级战利品 JSON 输入 `null`，首次显示错误 | [输入框与提示](loot-json-before-field.png) · [保存按钮](loot-json-before-actions.png) | [输入框与提示](loot-json-after-field.png) · [保存按钮](loot-json-after-actions.png) |
| 举报窗口首次打开时选择两个附件 | [未开始上传](report-upload-before.png) | [正在处理首个附件](report-upload-after.png) |

**战利品编辑器**的原定义包含空奖池与 `custom.keep=true`。两次运行都在输入框首次出现 `aria-invalid=true` 时截图，再激活同一个原生保存按钮。输入框与操作区的前后裁剪分别逐字节相同。改前按钮的 `disabled` 为 `false`，发送了 1 次空差量 PUT。改后 `disabled` 为 `true`，无效输入产生 0 次 PUT。纠正 JSON 后用 Enter 保存，只发送 1 次 `{"custom":{"edited":true}}` 差量。受控保存失败后，输入框保留原字段与修改。另一条断言核对表和奖池同时无效时，修正整表仍保留奖池错误。

将页面保持在无效状态后，`b84979d` 的保存按钮与可用状态具有相同文字颜色、背景、不透明度和鼠标指针。最终版本使用页面原有的禁用样式。顶部和底部保存按钮的不透明度同步从 1 降至 0.5，鼠标悬停显示禁止指针。修正为有效 JSON 后，两处按钮的不透明度都恢复为 1，键盘可以提交。

| 无效输入时保存按钮的稳定外观 | 时序修复版 `b84979d` | 最终版 `c3ca2f2` |
| --- | --- | --- |
| 英文浅色，1280 × 720 | [保存按钮](loot-save-before-desktop.png) | [保存按钮](loot-save-after-desktop.png) |
| 简中深色，390 × 844 | [保存按钮](loot-save-before-mobile-dark.png) | [保存按钮](loot-save-after-mobile-dark.png) |

**举报附件**用同一讨论、账号及两个文本文件 `first.txt`、`second.txt`。窗口首次进入打开状态即选择两项。改前首次选择发出 0 次上传票据请求，用户重新选择后才开始。改后立即为第一个文件申请 1 次票据并禁用表单。此时切换账号，浏览器取消该请求，第二项发出 0 次票据请求，迟到的回执也没有重新打开原窗口。截图中的文件与账号均为合成数据。

窄屏复验使用 390 × 844 的简体中文深色界面。战利品输入框和保存操作均在视口内，键盘可打开高级编辑、输入、纠错并提交。举报窗换账号后不再提交附件确认或举报，新账号重新打开空窗，可用 Tab 进入文本框并用 Escape 关闭。

在完成生产构建并安装 Chromium 后，可以运行同一组交互断言。[构建与验证](../../README.md#验证与发布)

```sh
node --test --test-concurrency=1 --test-name-pattern='^FP056|^switching accounts cancels the open report attachment batch' \
  browser-tests/oct03-page-remaining.browser.mts browser-tests/oct03-cross-legacy-acceptance.browser.mts
```

## Mod 与整合包目录卡片

同一组匿名目录记录在改前显示下载量 0，改后显示接口返回的站内下载量 73、评分 4.5 和评论数 2。收藏数 0 仍然显示。未提供作者的卡片保留许可证，缺少版本或加载器时省去对应标签。桌面操作区按实际文字宽度换行，手机上的收藏与下载仍可并排。

| 生产构建源码 | 桌面 1366 × 900 | 手机 390 × 844 |
| --- | --- | --- |
| 改前 `f81a0a8` | [目录卡片](catalog-card-before-desktop.png) | [目录卡片](catalog-card-before-mobile.png) |
| 改后 `0c31c4b` | [目录卡片](catalog-card-after-desktop.png) | [目录卡片](catalog-card-after-mobile.png) |

截图由真实 Chromium 在上述视口裁剪到卡片，使用英文界面和三条合成 HTTP 记录。Mod 与整合包采用同一组件，两条路由分别测试。浏览器回归同时检查未提供统计、真实零值，以及桌面下载文字是否完全位于链接内。完成生产浏览器构建后可重拍。[构建与验证](../../README.md#验证与发布)

```sh
MCMODS_CATALOG_STATS_SCREENSHOTS="$(mktemp -d)" node --test \
  --test-name-pattern='catalog shows measured site activity' browser-tests/home-search.browser.mts
```

## 第三轮交接

实际 Chromium 截图使用专用合成账号。服务器配置面板显示明确的只读状态，有配置写权限的用户才可保存。商店背景道具使用成功后，预览失败会保留成功提示和最新库存，重试只重新读取预览。

| 场景 | 桌面 | 手机 |
| --- | --- | --- |
| 服务器提交设置，修改前 | [1280 × 720](server-settings-before-desktop.png) | [390 × 844](server-settings-before-mobile.png) |
| 服务器提交设置，修改后 | [1280 × 720](server-settings-after-desktop.png) | [390 × 844](server-settings-after-mobile.png) |
| 主页背景预览失败，修改前 | [1440 × 900](economy-background-before-desktop.png) | [412 × 840](economy-background-before-mobile.png) |
| 主页背景预览失败，修改后 | [1440 × 900](economy-background-after-desktop.png) | [412 × 840](economy-background-after-mobile.png) |

这两组对照使用受控 API 响应。完成根 README 的构建后，可运行定向回归。[验收命令与版本](../../README.md#验证与发布)

```bash
node --test --test-concurrency=1 browser-tests/server-admin-state.browser.mts browser-tests/economy-background.browser.mts
```

隔离站点另用标准镜像、可信 HTTPS 及未修改的 Minecraft 1.20.1 Fabric 开发原包完成上传、导入和独立审核。从匿名页面采集以下 1280 × 720 截图。[公开物品](resource-steps-public-item.png) · [公开配方](resource-steps-public-recipe.png) · [三仓版本与运行范围](../../README.md#版本与验收记录)

## 此前的浏览器对照

第三轮站点图标回归使用 Chromium 桌面 1440 × 900 亮色和手机 390 × 844 深色。同一 `/service` 网关前缀下，旧生产页面的上传返回 404，两端均未解码图标。修改后上传返回 201，匿名图标读取按站点配置跳转，解码合成的 32 px 图像。前后截图随交接产物提供。回归使用回环 API 与合成图标，部署网关要按 [README](../../README.md) 设置会话 Cookie 路径。

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
