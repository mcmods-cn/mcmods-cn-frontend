# mcmods_exporter renderer core

本目录是从独立 React 演示站提取的框架无关核心。完整架构、数据库和 API 契约见 [`docs/mcmods-exporter-integration.md`](../../../docs/mcmods-exporter-integration.md)。

最小调用：

```ts
import {
  IndexedHttpAssetSource,
  StructureRenderer,
} from '@/lib/mcmods-exporter/renderer'

const source = new IndexedHttpAssetSource(
  assetPaths,
  path => `/api/v1/revisions/${revisionId}/assets/content?path=${encodeURIComponent(path)}`,
)

const renderer = new StructureRenderer(hostElement, source, {
  onSelectBlock: console.log,
  onLoaded: console.log,
})

await renderer.load(nbtBytes, 'factory.nbt')
// 页面卸载时必须执行：
renderer.dispose()
```

支持的结构输入：原版/Create NBT、Sponge Schem、Litematica 和规范化 JSON。

支持的模型：标准 elements/faces、Forge/NeoForge/Porting Lib OBJ 与 composite、NeoForge blockstate composite、separate transforms base、empty、OBJ MTL/flipV/visibility，以及 Mekanism Energy Cube 的 frame/LED/port 自定义 loader。

`AssetSource` 必须只暴露当前 revision 的资源。JSON/OBJ/MTL 应由 Go API 从 PostgreSQL 返回；PNG/纹理 URL 可以指向 CDN。

Next.js 封装先读取结构、模型或纹理，再初始化 WebGL。浏览器不支持 WebGL、纹理部分失败或异步构建失败时，组件显示失败状态；页面的名称、介绍和其他操作仍然可用。失败和卸载都会释放已经创建的纹理、模型、观察器和 renderer，迟到的纹理或截图不会更新已切换的资源。`StructureCanvasSource.load` 应返回可取消的 Promise，并按 `key` 标识资源内容。

结构卸载需要同时释放每个 `InstancedMesh` 的实例缓冲与去重后的共享 geometry/material/texture。第一人称模式在重新构建后保留，关闭模式或窗口失焦会清空按键，避免切换标签页后继续移动。`StructureRenderer` 的直接调用方也必须捕获构造异常，并在正常初始化后调用 `dispose()`。

回归验证包括 `app/_lib/structure-disposal.test.mts`、`app/_lib/skin-texture-lifecycle.test.mts` 和 `browser-tests/renderers.browser.mts`。前两个使用真实 Three 资源的释放事件；浏览器测试运行生产界面，并在明确的 API fixture 边界验证移动视口、英文/中文错误状态和 WebGL 不可用。该 fixture 不证明数据库持久化或真实 GPU 的长期内存行为。
