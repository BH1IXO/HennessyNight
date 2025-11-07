# 数据库设置说明

## 问题

当前知识库功能需要PostgreSQL数据库，但数据库未运行，导致以下错误：

```
Can't reach database server at `localhost:5432`
```

## 解决方案

### 选项1：启动PostgreSQL数据库（推荐用于生产环境）

1. **安装PostgreSQL**（如果尚未安装）
   - 下载：https://www.postgresql.org/download/windows/
   - 安装后默认端口：5432

2. **启动PostgreSQL服务**
   ```bash
   # Windows
   # 打开服务管理器（services.msc），启动 PostgreSQL 服务
   # 或使用命令行：
   net start postgresql-x64-14  # 版本号可能不同
   ```

3. **运行Prisma迁移**
   ```bash
   npx prisma migrate dev
   ```

### 选项2：使用SQLite数据库（简单快速）

知识库功能已经实现了SQLite版本（`src/db/knowledgebase.ts`），但Terms API路由还在使用Prisma连接PostgreSQL。

**修改方案：**

修改 `src/api/routes/terms.ts` 使用 SQLite 而不是 Prisma：

```typescript
// 将这一行
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// 改为
import { KnowledgeBaseDB } from '@/db/knowledgebase';
```

然后修改所有API endpoint使用 `KnowledgeBaseDB` 而不是 `prisma.term`。

## 当前状态

- ✅ SQLite知识库数据库已实现：`src/db/knowledgebase.ts`
- ✅ Terms API路由已实现：`src/api/routes/terms.ts`（使用Prisma/PostgreSQL）
- ❌ PostgreSQL数据库未运行
- ✅ 前端知识库管理器已实现：`frontend/dist/knowledge-manager.js`

## 快速修复（使用SQLite）

运行以下命令检查SQLite版本的Terms API是否可用：

```bash
# 检查是否需要更新terms路由使用SQLite
```

或者我可以帮你修改 `terms.ts` 路由使用 SQLite数据库。
