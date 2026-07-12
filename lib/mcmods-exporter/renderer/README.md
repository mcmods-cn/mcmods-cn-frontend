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

支持的模型：标准 elements/faces、Forge/NeoForge/Porting Lib OBJ 与 composite、NeoForge blockstate composite、separate transforms base、empty、OBJ MTL/flipV/visibility。

`AssetSource` 必须只暴露当前 revision 的资源。JSON/OBJ/MTL 应由 Go API 从 PostgreSQL 返回；PNG/纹理 URL 可以指向 CDN。
