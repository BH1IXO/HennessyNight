# 🚀 快速启动指南

## 一键部署（推荐）

### Windows用户

```powershell
# 双击运行部署脚本
deploy.bat
```

### Linux/Mac用户

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 手动启动（开发环境）

### 前置条件

- Node.js 18+
- Python 3.11+
- PostgreSQL 14+
- Docker (可选)

### 步骤1: 启动PostgreSQL

**选项A: 使用Docker（推荐）**

```bash
docker run --name meeting-postgres \
  -e POSTGRES_PASSWORD=meeting123456 \
  -e POSTGRES_DB=meeting_system \
  -p 5432:5432 \
  -d postgres:14-alpine
```

**选项B: 本地PostgreSQL**

创建数据库：
```sql
CREATE DATABASE meeting_system;
```

### 步骤2: 配置环境

```bash
# 复制配置文件
cp .env.example .env

# 编辑.env，确保以下配置正确：
# DATABASE_URL="postgresql://postgres:meeting123456@localhost:5432/meeting_system"
# DEEPSEEK_API_KEY=sk-54c3f8dd90f145e8919f05dc7f137722
```

### 步骤3: 安装依赖

```bash
# Node.js依赖
npm install

# Python环境
cd python
python -m venv pyannote-env
source pyannote-env/bin/activate  # Windows: pyannote-env\Scripts\activate
pip install -r requirements.txt
cd ..
```

### 步骤4: 下载Vosk模型

```bash
cd python
python download-vosk-model.py
cd ..
```

### 步骤5: 初始化数据库

```bash
npx prisma generate
npx prisma migrate deploy
```

### 步骤6: 启动服务

```bash
# 开发模式（热重载）
npm run dev

# 或生产模式
npm run build
npm start
```

### 步骤7: 验证

打开浏览器访问：

- 前端: http://localhost/frontend/dist/index.html
- API: http://localhost:3000
- 健康检查: http://localhost:3000/health
- API文档: http://localhost:3000/api/v1/docs

---

## 核心功能测试

### 1. 测试健康检查

```bash
curl http://localhost:3000/health
```

预期响应：
```json
{
  "status": "healthy",
  "timestamp": "2024-01-20T10:00:00.000Z"
}
```

### 2. 创建说话人

```bash
curl -X POST http://localhost:3000/api/v1/speakers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "张三",
    "email": "zhangsan@example.com"
  }'
```

### 3. 创建会议

```bash
curl -X POST http://localhost:3000/api/v1/meetings \
  -H "Content-Type: application/json" \
  -d '{
    "title": "测试会议",
    "scheduledAt": "2024-01-20T10:00:00Z"
  }'
```

---

## 常用命令

### 数据库管理

```bash
# 查看数据库
npx prisma studio

# 重置数据库
npx prisma migrate reset

# 创建新迁移
npx prisma migrate dev --name your_migration_name
```

### 日志查看

```bash
# Docker
docker-compose logs -f backend

# PM2
pm2 logs meeting-backend

# 直接查看文件
tail -f logs/app.log
```

### 服务管理

```bash
# Docker Compose
docker-compose start   # 启动
docker-compose stop    # 停止
docker-compose restart # 重启
docker-compose down    # 删除

# PM2
pm2 start npm --name "meeting-backend" -- start
pm2 stop meeting-backend
pm2 restart meeting-backend
pm2 delete meeting-backend
```

---

## 故障排查

### 问题1: 端口被占用

```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :3000
kill -9 <PID>
```

### 问题2: 数据库连接失败

```bash
# 测试连接
psql postgresql://postgres:meeting123456@localhost:5432/meeting_system

# 检查Docker容器
docker ps | grep postgres
docker logs meeting-postgres
```

### 问题3: Vosk模型未找到

```bash
# 检查模型
ls -lh python/models/vosk-model-small-cn-0.22

# 重新下载
cd python
python download-vosk-model.py
```

---

**预计启动时间: 5-10分钟** ⏱️
