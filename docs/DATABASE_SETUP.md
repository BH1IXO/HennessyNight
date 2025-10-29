# 数据库配置指南 - Windows

## 方案A：使用Docker（推荐，最简单）

### 1. 安装Docker Desktop

下载：https://www.docker.com/products/docker-desktop

### 2. 启动PostgreSQL容器

打开PowerShell或CMD，运行：

```bash
docker run --name meeting-postgres -e POSTGRES_PASSWORD=meeting123456 -p 5432:5432 -d postgres:14

# 验证运行
docker ps
```

### 3. 配置.env文件

编辑 `D:\Hennessy.uno\meeting-system-backend\.env`：

```env
DATABASE_URL="postgresql://postgres:meeting123456@localhost:5432/meeting_system?schema=public"
```

### 4. 创建数据库

```bash
# 进入容器
docker exec -it meeting-postgres psql -U postgres

# 创建数据库
CREATE DATABASE meeting_system;

# 退出
\q
```

**完成！** 数据库密码是：`meeting123456`

---

## 方案B：直接安装PostgreSQL

### 1. 下载安装器

访问：https://www.postgresql.org/download/windows/

或直接下载：https://www.enterprisedb.com/downloads/postgres-postgresql-downloads

推荐版本：PostgreSQL 14.x

### 2. 安装步骤

1. 运行安装器
2. **记住你设置的密码！** 比如：`postgres123`
3. 端口选择默认：`5432`
4. 其他选项默认即可

### 3. 验证安装

开始菜单 → SQL Shell (psql)

输入密码，看到 `postgres=#` 提示符表示成功

### 4. 创建数据库

在psql中执行：

```sql
CREATE DATABASE meeting_system;

-- 验证
\l

-- 退出
\q
```

### 5. 配置.env文件

编辑 `D:\Hennessy.uno\meeting-system-backend\.env`：

```env
DATABASE_URL="postgresql://postgres:你的密码@localhost:5432/meeting_system?schema=public"
```

把 `你的密码` 替换成安装时设置的密码。

---

## 方案C：使用云数据库（最省事）

### 免费云数据库推荐

**1. Supabase（推荐）**
- 网址：https://supabase.com
- 免费额度：500MB
- 自动配置，无需安装

**注册步骤：**
1. 访问 https://supabase.com
2. 注册账号
3. 创建项目
4. 获取数据库连接字符串（Database URL）
5. 直接粘贴到 `.env` 文件

---

## 验证数据库配置

运行测试脚本：

```bash
cd D:\Hennessy.uno\meeting-system-backend

# 测试连接
npx prisma db pull
```

如果没有错误，说明连接成功！✅

---

## 常见问题

### 问题1：端口5432被占用

```bash
# 查看占用
netstat -ano | findstr :5432

# 修改端口（在.env中）
DATABASE_URL="postgresql://postgres:密码@localhost:5433/meeting_system"

# 如果是Docker
docker run --name meeting-postgres -e POSTGRES_PASSWORD=meeting123456 -p 5433:5432 -d postgres:14
```

### 问题2：密码错误

```bash
# 重置密码（以管理员身份打开CMD）
net stop postgresql-x64-14
net start postgresql-x64-14

# 或使用Docker
docker rm -f meeting-postgres
docker run --name meeting-postgres -e POSTGRES_PASSWORD=新密码 -p 5432:5432 -d postgres:14
```

### 问题3：找不到psql命令

添加到系统PATH：
```
C:\Program Files\PostgreSQL\14\bin
```

---

## 推荐配置

**最简单的方案（使用Docker）：**

```bash
# 一条命令搞定
docker run --name meeting-postgres -e POSTGRES_PASSWORD=meeting123456 -p 5432:5432 -d postgres:14

# .env配置
DATABASE_URL="postgresql://postgres:meeting123456@localhost:5432/meeting_system?schema=public"
```

**密码：** `meeting123456`

---

**下一步：** 运行 `npm install` 和 `npx prisma migrate dev`
