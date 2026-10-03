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

Next.js 封装先读取结构字节，再初始化 WebGL 并异步构建场景、加载模型和纹理。缺失模型可以进入已有的方块回退，未被兼容回退处理的构建错误和 WebGL 初始化失败会显示失败状态；页面的名称、介绍和其他操作仍然可用。失败和卸载都会释放已经创建的纹理、模型、观察器和 renderer，迟到的纹理或截图不会更新已切换的资源。`StructureCanvasSource.load` 应返回可取消的 Promise，并按 `key` 标识资源内容。

结构卸载需要同时释放每个 `InstancedMesh` 的实例缓冲与去重后的共享 geometry/material/texture。第一人称模式在重新构建后保留，关闭模式或窗口失焦会清空按键，避免切换标签页后继续移动。`StructureRenderer` 的直接调用方也必须捕获构造异常，并在正常初始化后调用 `dispose()`。

回归验证包括 `app/_lib/structure-disposal.test.mts`、`app/_lib/skin-texture-lifecycle.test.mts` 和 `browser-tests/renderers.browser.mts`。前两个使用真实 Three 资源的释放事件；浏览器测试运行生产界面，并在明确的 API fixture 边界验证移动视口、英文/中文错误状态和 WebGL 不可用。该 fixture 不证明数据库持久化或真实 GPU 的长期内存行为。

结构渲染保留轻量动画帧来更新 OrbitControls 阻尼、自动旋转、第一人称移动和迟到纹理版本；只有场景、相机、切层、网格、选中框、尺寸或纹理实际变化时才提交 WebGL 绘制。纹理检查只遍历场景构建时收集的唯一纹理，不扫描方块实例；释放或替换场景会清空这些引用。截图仍直接渲染到独立目标，并在恢复屏幕目标和相机后请求重绘。

标准 `elements/faces` 的每个独立平面，在 PNG 解码后仅当自然尺寸不超过 256×256、每个像素 alpha 都为 255 且材质 opacity 为 1 时启用 Three 的单遍双面绘制。像素读取失败、透明或较大纹理继续使用原来的双遍路径；256 是有界分析的优化条件，不是纹理或模型准入限制。相邻层的半透明上下文明确保持双遍，OBJ、合并方块实体和立体回退材质也保留原路径。材质释放会移除分析目标，迟到 PNG 不再读取像素；临时分析画布随后清空，不缓存图像内容。

`browser-tests/oct03-rendering-acceptance.browser.mts` 使用生产蓝图页面和真实 WebGL，检查静止场景停止重复提交、相机/尺寸变化、切层、预算拒绝、重建释放及迟到截图/纹理。另以两种方块状态的未完成模型请求和原生 PNG 加载验证页面卸载时取消构建，迟到响应不得安装场景或分配新的 GPU 资源；这不证明同步 CPU 解析能被中途打断。外部 API、模型和 PNG 使用合成传输；软件 WebGL 的结果只对应该浏览器环境。600k 单次准入与 100k 连续重建分别验收，不能替代真实显卡的长期性能或证明物理 GPU 内存已归零；已发生的最大规模超时应保留。
