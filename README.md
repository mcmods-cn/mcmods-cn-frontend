# Mcmods-cn Frontend

Mcmods-cn 的 Next.js 前端，包含站点主页、登录、用户中心、后台管理和 Markdown 工具。

## 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- 正在运行的 `mcmods-cn-backend`

## 本地开发

```bash
npm install
npm run dev
```

默认访问地址为 <http://localhost:3000>，默认后端地址为 <http://127.0.0.1:8080>。

如需修改后端地址，在 `.env.local` 中设置：

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8080
```

## 常用命令

```bash
npm run check
npm run build
npm run start
```

- `check`：运行 ESLint 和 TypeScript 类型检查。
- `build`：创建生产构建。
- `start`：启动已生成的生产构建。

项目统一使用 npm，并提交 `package-lock.json` 以保证依赖版本可复现。
