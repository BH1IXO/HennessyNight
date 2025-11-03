# 🚀 HennessyNight 智能会议系统 - 快速启动指南

## 前置条件检查

✅ Node.js 已安装
✅ npm 依赖已安装
✅ 前端文件已复制
✅ 环境变量已配置

## 启动步骤

### 方案 A: 使用 Docker（推荐）

#### 1. 启动 Docker Desktop
- 打开 Docker Desktop 应用
- 等待 Docker 引擎启动完成（图标变绿）

#### 2. 启动数据库
```bash
cd D:\Hennessy.Night\HennessyNight
docker-compose up -d postgres
```

#### 3. 等待数据库就绪（约10-15秒）
```bash
docker ps
```
确认 meeting-postgres 容器状态为 healthy

#### 4. 初始化数据库
```bash
npm run prisma:generate
npm run prisma:migrate
```

#### 5. 构建并启动后端
```bash
npm run build
npm run dev
```

#### 6. 访问系统
- 前端: http://localhost:3000
- API: http://localhost:3000/api/v1/docs
- 健康检查: http://localhost:3000/health

### 方案 B: 手动安装 PostgreSQL

如果你不想使用 Docker，可以：

#### 1. 安装 PostgreSQL 14+
下载地址: https://www.postgresql.org/download/windows/

#### 2. 创建数据库
```sql
CREATE DATABASE meeting_system;
```

#### 3. 更新 .env 中的数据库连接
```
DATABASE_URL="postgresql://postgres:你的密码@localhost:5432/meeting_system?schema=public"
```

#### 4. 继续方案A的步骤 4-6

## 功能测试

### 1. 测试 API
```bash
curl http://localhost:3000/health
```

应该返回:
```json
{
  "status": "ok",
  "timestamp": "..."
}
```

### 2. 测试前端
浏览器访问: http://localhost:3000

应该看到:
- 智能会议纪要系统界面
- 状态显示"准备就绪"

### 3. 添加说话人
1. 点击右侧"声纹管理"
2. 点击"添加声纹"
3. 填写姓名和邮箱
4. 保存

### 4. 添加知识库词条
1. 点击右侧"知识库管理"
2. 点击"添加词条"
3. 填写词条和定义
4. 保存

### 5. 测试录音（需要麦克风）
1. 点击"开始录音"
2. 说几句话
3. 点击"停止录音"
4. 点击"生成会议纪要"

## 常见问题

### Q: Docker 无法启动
A: 确保 Docker Desktop 已安装并运行

### Q: 数据库连接失败
A:
1. 检查 Docker 容器是否运行: `docker ps`
2. 检查 .env 中的 DATABASE_URL 是否正确
3. 等待数据库初始化完成（约15秒）

### Q: npm run dev 报错
A:
1. 先运行 `npm run build` 确保代码编译成功
2. 检查 node_modules 是否完整: `npm install`

### Q: 前端无法访问后端
A:
1. 检查后端是否运行: `curl http://localhost:3000/health`
2. 检查浏览器控制台的网络错误
3. 确认 CORS 配置正确（.env 中 CORS_ORIGIN=*）

## 下一步

### 可选：安装 Python 环境（声纹识别）

如果需要使用声纹识别功能:

```bash
cd python
setup.bat  # Windows
# 或
./setup.sh  # Linux/Mac
```

### 可选：启动完整的 Docker 环境

```bash
docker-compose up -d
```

这将启动:
- PostgreSQL 数据库
- Redis 缓存
- 后端服务
- Nginx 反向代理

## 开发模式 vs 生产模式

### 开发模式（当前）
```bash
npm run dev
```
- 热重载
- 详细日志
- 源码调试

### 生产模式
```bash
npm run build
npm start
```
- 编译后的代码
- 优化性能
- 简洁日志

## 支持

如有问题，请查看:
- 项目文档: README.md
- API文档: http://localhost:3000/api/v1/docs
- 健康检查: http://localhost:3000/health
