# 系统测试指南

## 🧪 测试步骤

### 第一步：环境准备

#### 1.1 安装PostgreSQL

```bash
# macOS
brew install postgresql
brew services start postgresql

# Ubuntu/Debian
sudo apt-get install postgresql
sudo systemctl start postgresql

# Windows
# 下载安装：https://www.postgresql.org/download/windows/
```

#### 1.2 创建数据库

```bash
# 连接PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE meeting_system;

# 创建用户（可选）
CREATE USER meeting_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE meeting_system TO meeting_user;

# 退出
\q
```

#### 1.3 配置环境变量

复制 `.env.example` 到 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# 数据库 - 必需
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/meeting_system"

# 讯飞语音 - 必需
IFLYTEK_APP_ID=你的APP_ID
IFLYTEK_API_KEY=你的API_KEY
IFLYTEK_API_SECRET=你的API_SECRET

# DeepSeek AI - 必需
DEEPSEEK_API_KEY=你的DEEPSEEK_API_KEY

# pyannote.audio
PYANNOTE_DEVICE=cpu  # 或 cuda（如果有GPU）
PYANNOTE_MODEL_PATH=pyannote/speaker-diarization

# 服务器
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Redis（可选）
# REDIS_URL=redis://localhost:6379

# 日志
ENABLE_API_LOGGING=true

# 会话配置
MAX_CONCURRENT_SESSIONS=10
SESSION_TIMEOUT=3600000
CLEANUP_INTERVAL=60000
```

### 第二步：安装依赖

```bash
# 1. 安装Node.js依赖
npm install

# 2. 安装Python环境（用于pyannote.audio）
cd python

# Linux/Mac
chmod +x setup.sh
./setup.sh

# Windows
setup.bat

# 3. 测试Python环境
python test_pyannote.py
```

### 第三步：初始化数据库

```bash
# 生成Prisma Client
npx prisma generate

# 运行数据库迁移
npx prisma migrate dev --name init

# 查看数据库（可选）
npx prisma studio
```

### 第四步：启动服务器

```bash
# 开发模式
npm run dev

# 看到如下输出表示启动成功：
# ============================================================
# 🚀 Meeting System Backend Server
# ============================================================
#
# 📡 Server running on: http://0.0.0.0:3000
# 🏥 Health check: http://0.0.0.0:3000/health
# 📚 API Documentation: http://0.0.0.0:3000/api/v1/docs
```

### 第五步：测试API

#### 5.1 健康检查

```bash
curl http://localhost:3000/health

# 预期响应：
{
  "status": "healthy",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "uptime": 123.456,
  "services": {
    "database": {
      "status": "up",
      "latency": "10ms"
    }
  },
  ...
}
```

#### 5.2 创建说话人

```bash
curl -X POST http://localhost:3000/api/v1/speakers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "张三",
    "email": "zhangsan@example.com"
  }'

# 预期响应：
{
  "message": "说话人创建成功",
  "data": {
    "id": "speaker_xxx",
    "name": "张三",
    "email": "zhangsan@example.com",
    "profileStatus": "CREATED",
    ...
  }
}
```

#### 5.3 创建会议

```bash
curl -X POST http://localhost:3000/api/v1/meetings \
  -H "Content-Type: application/json" \
  -d '{
    "title": "产品规划会议",
    "description": "讨论Q1产品规划",
    "scheduledAt": "2024-01-25T10:00:00Z"
  }'

# 预期响应：
{
  "message": "会议创建成功",
  "data": {
    "id": "meeting_xxx",
    "title": "产品规划会议",
    "status": "SCHEDULED",
    ...
  }
}
```

#### 5.4 获取会议列表

```bash
curl http://localhost:3000/api/v1/meetings

# 预期响应：
{
  "data": [
    {
      "id": "meeting_xxx",
      "title": "产品规划会议",
      ...
    }
  ],
  "pagination": {
    "total": 1,
    "limit": 20,
    "offset": 0,
    "hasMore": false
  }
}
```

#### 5.5 开始会议

```bash
curl -X POST http://localhost:3000/api/v1/meetings/meeting_xxx/start

# 预期响应：
{
  "message": "会议已开始",
  "data": {
    "id": "meeting_xxx",
    "status": "IN_PROGRESS",
    "startTime": "2024-01-20T10:00:00.000Z",
    ...
  }
}
```

#### 5.6 创建实时识别会话

```bash
curl -X POST http://localhost:3000/api/v1/sessions/create \
  -H "Content-Type: application/json" \
  -d '{
    "meetingId": "meeting_xxx",
    "candidateSpeakerIds": ["speaker_xxx"],
    "engineConfig": {
      "bufferDuration": 3,
      "identificationThreshold": 0.75
    }
  }'

# 预期响应：
{
  "message": "会话创建成功",
  "data": {
    "sessionId": "session_xxx"
  }
}
```

#### 5.7 获取会话状态

```bash
curl http://localhost:3000/api/v1/sessions/session_xxx/status

# 预期响应：
{
  "data": {
    "sessionId": "session_xxx",
    "meetingId": "meeting_xxx",
    "status": "RUNNING",
    "createdAt": "...",
    ...
  }
}
```

#### 5.8 结束会议

```bash
curl -X POST http://localhost:3000/api/v1/meetings/meeting_xxx/finish \
  -H "Content-Type: application/json" \
  -d '{
    "generateSummary": true
  }'

# 预期响应：
{
  "message": "会议已结束",
  "data": {
    "id": "meeting_xxx",
    "status": "COMPLETED",
    "endTime": "2024-01-20T11:00:00.000Z",
    ...
  }
}
```

## 📝 使用Postman测试

### 导入Collection

1. 打开Postman
2. 点击 Import
3. 选择 `docs/postman_collection.json`（我将创建）
4. 设置环境变量：
   - `baseUrl`: `http://localhost:3000/api/v1`
   - `meetingId`: （创建会议后填入）
   - `speakerId`: （创建说话人后填入）

### 测试流程

1. **创建说话人** → 获取 `speakerId`
2. **创建会议** → 获取 `meetingId`
3. **添加参会人员** → 关联说话人和会议
4. **开始会议** → 状态变为 IN_PROGRESS
5. **创建识别会话** → 获取 `sessionId`
6. **发送音频数据** → 实时识别（WebSocket）
7. **结束会议** → 状态变为 COMPLETED
8. **生成纪要** → AI生成会议纪要

## 🧪 单元测试

### 运行测试

```bash
# 运行所有测试
npm test

# 运行特定测试
npm test -- meetings.test.ts

# 测试覆盖率
npm run test:coverage

# 监听模式
npm run test:watch
```

### 测试Python环境

```bash
cd python

# 激活环境
source pyannote-env/bin/activate  # Linux/Mac
# pyannote-env\Scripts\activate.bat  # Windows

# 运行测试
python test_pyannote.py

# 预期输出：
# ==================================================
# 🧪 pyannote.audio 测试脚本
# ==================================================
# ✅ pyannote.audio 版本: 3.1.1
# ✅ PyTorch 版本: 2.x.x
# ✅ CUDA 可用: True/False
# ✅ 使用设备: cuda/cpu
# ...
# 🎉 测试完成！
```

## 🔍 调试技巧

### 1. 查看日志

```bash
# 实时查看日志
npm run dev

# 或使用PM2
pm2 logs meeting-backend

# 查看数据库查询日志
# 在 .env 中设置：
# DATABASE_URL 后面添加 ?log=true
```

### 2. 使用Prisma Studio

```bash
# 打开可视化数据库管理界面
npx prisma studio

# 访问 http://localhost:5555
```

### 3. 检查Python环境

```bash
cd python
source pyannote-env/bin/activate

# 检查安装的包
pip list

# 测试pyannote
python -c "import pyannote.audio; print(pyannote.audio.__version__)"

# 测试PyTorch
python -c "import torch; print(f'PyTorch: {torch.__version__}'); print(f'CUDA: {torch.cuda.is_available()}')"
```

### 4. 常见问题排查

#### 问题：数据库连接失败

```bash
# 检查PostgreSQL是否运行
sudo systemctl status postgresql  # Linux
brew services list  # macOS

# 测试连接
psql postgresql://postgres@localhost:5432/meeting_system

# 检查 DATABASE_URL
echo $DATABASE_URL
```

#### 问题：端口被占用

```bash
# 查看端口占用
lsof -i :3000  # macOS/Linux
netstat -ano | findstr :3000  # Windows

# 修改端口
# 在 .env 中设置：PORT=3001
```

#### 问题：讯飞API错误

```bash
# 检查配置
echo $IFLYTEK_APP_ID
echo $IFLYTEK_API_KEY

# 测试API（如果有测试脚本）
# node test/iflytek-test.js
```

#### 问题：pyannote模型下载失败

```bash
# 方法1: 使用镜像
export HF_ENDPOINT=https://hf-mirror.com

# 方法2: 手动下载模型
# 访问：https://hf-mirror.com/pyannote/speaker-diarization
# 下载所有文件到 models/pyannote/

# 方法3: 使用CPU模式（跳过GPU依赖）
PYANNOTE_DEVICE=cpu npm run dev
```

## 📊 性能测试

### 使用Apache Bench

```bash
# 安装ab
sudo apt-get install apache2-utils  # Linux
brew install ab  # macOS

# 测试健康检查接口
ab -n 1000 -c 10 http://localhost:3000/health

# 结果分析：
# - Requests per second: 应该 > 100
# - Time per request: 应该 < 100ms
```

### 使用Artillery

```bash
# 安装
npm install -g artillery

# 运行性能测试
artillery quick --count 10 --num 100 http://localhost:3000/api/v1/meetings

# 或使用配置文件
artillery run test/load-test.yml
```

## ✅ 测试清单

- [ ] 环境变量配置正确
- [ ] PostgreSQL运行正常
- [ ] 数据库迁移成功
- [ ] Python环境安装成功
- [ ] 服务器启动成功
- [ ] 健康检查返回200
- [ ] 可以创建说话人
- [ ] 可以创建会议
- [ ] 可以创建识别会话
- [ ] API响应时间正常（<100ms）
- [ ] 数据正确保存到数据库
- [ ] 错误处理正常工作

## 🎯 下一步

测试通过后，可以：

1. **集成前端** - 连接 `meetingsystm.html`
2. **实现WebSocket** - 实时音频流传输
3. **配置生产环境** - 使用PM2或Docker
4. **设置监控** - 添加日志和性能监控
5. **编写更多测试** - 单元测试和集成测试

---

**有问题？** 查看主文档或提交Issue
