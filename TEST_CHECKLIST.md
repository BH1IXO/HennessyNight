# ✅ 测试检查清单

## 📋 配置状态

### ✅ 已完成配置
- [x] DeepSeek API Key: `sk-54c3...7722` ✅
- [x] pyannote.audio: CPU模式 ✅
- [x] 服务器端口: 3000 ✅
- [x] CORS: 允许所有来源 ✅

### ⚠️ 需要配置
- [ ] PostgreSQL数据库密码（修改.env中的DATABASE_URL）
- [ ] 讯飞API密钥（可选，测试完整功能时需要）

## 🚀 快速测试步骤（5分钟）

### 步骤1: 安装PostgreSQL
```bash
# Windows: 下载安装
https://www.postgresql.org/download/windows/

# 或使用已有的PostgreSQL
```

### 步骤2: 创建数据库
打开 **SQL Shell (psql)** 或 **pgAdmin**：
```sql
CREATE DATABASE meeting_system;
```

### 步骤3: 修改数据库密码
编辑 `D:\Hennessy.uno\meeting-system-backend\.env`：

找到这行：
```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/meeting_system?schema=public"
```

将 `postgres:postgres` 中的第二个 `postgres` 改为你的PostgreSQL密码：
```env
DATABASE_URL="postgresql://postgres:你的密码@localhost:5432/meeting_system?schema=public"
```

### 步骤4: 安装依赖
```bash
cd D:\Hennessy.uno\meeting-system-backend
npm install
```

### 步骤5: 初始化数据库
```bash
npx prisma generate
npx prisma migrate dev --name init
```

看到 "✅ Your database is now in sync" 表示成功！

### 步骤6: 启动服务器
```bash
npm run dev
```

看到这个输出表示成功：
```
============================================================
🚀 Meeting System Backend Server
============================================================

📡 Server running on: http://0.0.0.0:3000
🏥 Health check: http://0.0.0.0:3000/health
📚 API Documentation: http://0.0.0.0:3000/api/v1/docs
```

## 🧪 测试API

### 测试1: 健康检查 ✅
**浏览器访问：** http://localhost:3000/health

**预期结果：**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-20T10:00:00.000Z",
  "services": {
    "database": {
      "status": "up",
      "latency": "10ms"
    }
  }
}
```

### 测试2: API文档 ✅
**浏览器访问：** http://localhost:3000/api/v1/docs

**预期结果：** 看到完整的API端点列表

### 测试3: 创建说话人 ✅
**PowerShell命令：**
```powershell
curl -Method POST http://localhost:3000/api/v1/speakers `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"name":"张三","email":"zhangsan@example.com"}'
```

**预期结果：**
```json
{
  "message": "说话人创建成功",
  "data": {
    "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "name": "张三",
    "email": "zhangsan@example.com",
    "profileStatus": "CREATED"
  }
}
```

### 测试4: 获取说话人列表 ✅
**浏览器访问：** http://localhost:3000/api/v1/speakers

**预期结果：** 看到刚才创建的说话人

### 测试5: 创建会议 ✅
**PowerShell命令：**
```powershell
curl -Method POST http://localhost:3000/api/v1/meetings `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"title":"测试会议","description":"这是一个测试会议"}'
```

**预期结果：**
```json
{
  "message": "会议创建成功",
  "data": {
    "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "title": "测试会议",
    "status": "SCHEDULED"
  }
}
```

### 测试6: 获取会议列表 ✅
**浏览器访问：** http://localhost:3000/api/v1/meetings

**预期结果：** 看到刚才创建的会议

### 测试7: 测试DeepSeek AI ✅
**创建会议转录（模拟数据）：**
```powershell
# 首先获取会议ID（从上面创建的会议）
$meetingId = "你的会议ID"

# 添加一些转录数据
curl -Method POST http://localhost:3000/api/v1/transcripts `
  -Headers @{"Content-Type"="application/json"} `
  -Body "{`"meetingId`":`"$meetingId`",`"speakerLabel`":`"张三`",`"content`":`"大家好，今天我们讨论项目进度`"}"

# 生成AI纪要
curl -Method POST http://localhost:3000/api/v1/summaries/generate `
  -Headers @{"Content-Type"="application/json"} `
  -Body "{`"meetingId`":`"$meetingId`",`"language`":`"zh`",`"saveToDatabase`":true}"
```

**预期结果：** 看到AI生成的会议纪要！🎉

## 📊 查看数据

使用Prisma Studio查看数据库：
```bash
npx prisma studio
```

访问 http://localhost:5555 可以看到所有数据表和数据。

## ✅ 基础功能测试清单

- [ ] 服务器启动成功
- [ ] 健康检查返回 `"status":"healthy"`
- [ ] API文档可访问
- [ ] 可以创建说话人
- [ ] 可以查询说话人列表
- [ ] 可以创建会议
- [ ] 可以查询会议列表
- [ ] 可以开始/结束会议
- [ ] 数据正确保存到数据库
- [ ] DeepSeek AI可以生成纪要 ✅

## 🎯 完整功能测试（可选）

如果要测试**声纹识别**和**实时转录**，需要：

### 1. 配置讯飞API
编辑 `.env` 文件，填入讯飞API密钥：
```env
IFLYTEK_APP_ID=你的APP_ID
IFLYTEK_API_KEY=你的API_KEY
IFLYTEK_API_SECRET=你的API_SECRET
```

注册地址：https://www.xfyun.cn/

### 2. 安装Python环境
```bash
cd D:\Hennessy.uno\meeting-system-backend\python
setup.bat

# 测试安装
python test_pyannote.py
```

### 3. 测试完整流程
参考 `docs/TESTING.md` 中的详细步骤。

## 🐛 常见问题

### 问题1: 数据库连接失败
```bash
# 检查PostgreSQL是否运行
# 打开"服务"管理器，查找 postgresql-x64-xx

# 或重启PostgreSQL
net stop postgresql-x64-xx
net start postgresql-x64-xx
```

### 问题2: 端口3000被占用
编辑 `.env` 文件：
```env
PORT=3001
```

### 问题3: npm install 失败
```bash
# 清理缓存
npm cache clean --force

# 使用淘宝镜像
npm install --registry=https://registry.npmmirror.com
```

### 问题4: Prisma迁移失败
```bash
# 删除数据库重新创建
# psql中执行：
DROP DATABASE meeting_system;
CREATE DATABASE meeting_system;

# 重新迁移
npx prisma migrate dev --name init
```

## 📝 测试报告

测试完成后，记录结果：

**测试日期：** _____________

**测试结果：**
- [ ] 所有基础功能测试通过 ✅
- [ ] DeepSeek AI纪要生成正常 ✅
- [ ] 数据库操作正常 ✅
- [ ] API响应时间 < 100ms ✅

**发现的问题：**
- 无 / 记录问题

**下一步计划：**
- [ ] 配置讯飞API测试实时转录
- [ ] 安装Python环境测试声纹识别
- [ ] 连接前端HTML页面
- [ ] 部署到生产环境

## 💡 提示

- 所有创建的测试数据都会保存到数据库
- 可以使用 `npx prisma studio` 查看和管理数据
- 测试时留意控制台日志，了解API调用详情
- DeepSeek API有调用次数限制，测试时适度使用

---

**🎉 祝测试顺利！有问题随时查看 `QUICKSTART.md` 或 `README.md`**
