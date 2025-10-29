# 智能会议纪要系统 - 部署指南

## 📋 目录

- [系统要求](#系统要求)
- [快速部署](#快速部署)
- [手动部署](#手动部署)
- [配置说明](#配置说明)
- [故障排查](#故障排查)
- [性能优化](#性能优化)

---

## 系统要求

### 硬件要求

**最低配置**:
- CPU: 2核
- 内存: 4GB RAM
- 硬盘: 20GB 可用空间

**推荐配置**:
- CPU: 4核+ (支持AVX2指令集更佳)
- 内存: 8GB+ RAM
- 硬盘: 50GB+ SSD
- GPU: NVIDIA GPU (可选，加速声纹识别)

### 软件要求

- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **操作系统**:
  - Linux (Ubuntu 20.04+, CentOS 7+)
  - macOS 11+
  - Windows 10/11 with WSL2

---

## 快速部署

### 方法1: 使用部署脚本 (推荐)

#### Linux/Mac

```bash
# 1. 克隆或上传代码到服务器
cd meeting-system-backend

# 2. 赋予执行权限
chmod +x deploy.sh

# 3. 运行部署脚本
./deploy.sh
```

#### Windows

```powershell
# 双击运行
deploy.bat

# 或在PowerShell中运行
.\deploy.bat
```

### 方法2: 手动Docker Compose部署

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑.env文件，填写必要配置

# 2. 下载Vosk模型
cd python
python download-vosk-model.py
cd ..

# 3. 构建并启动
docker-compose build
docker-compose up -d

# 4. 初始化数据库
docker-compose exec backend npx prisma generate
docker-compose exec backend npx prisma migrate deploy

# 5. 检查服务状态
docker-compose ps
curl http://localhost:3000/health
```

---

## 手动部署

如果不使用Docker，可以手动部署各个组件。

### 1. 安装PostgreSQL

**使用Docker:**
```bash
docker run --name meeting-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=meeting123456 \
  -e POSTGRES_DB=meeting_system \
  -p 5432:5432 \
  -d postgres:14-alpine
```

**或本地安装:**
```bash
# Ubuntu/Debian
sudo apt-get install postgresql-14

# CentOS/RHEL
sudo yum install postgresql14-server

# 创建数据库
sudo -u postgres createdb meeting_system
```

### 2. 安装Redis (可选)

```bash
docker run --name meeting-redis \
  -p 6379:6379 \
  -d redis:7-alpine
```

### 3. 配置Python环境

```bash
cd python

# 创建虚拟环境
python3 -m venv pyannote-env

# 激活环境
source pyannote-env/bin/activate  # Linux/Mac
# pyannote-env\Scripts\activate.bat  # Windows

# 安装依赖
pip install -r requirements.txt

# 下载Vosk模型
python download-vosk-model.py
```

### 4. 配置Node.js后端

```bash
cd meeting-system-backend

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑.env文件

# 生成Prisma Client
npx prisma generate

# 运行数据库迁移
npx prisma migrate deploy

# 构建
npm run build

# 启动
npm start
```

### 5. 配置Nginx (可选)

```bash
# 复制配置文件
sudo cp nginx.conf /etc/nginx/sites-available/meeting-system
sudo ln -s /etc/nginx/sites-available/meeting-system /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重启Nginx
sudo systemctl restart nginx
```

---

## 配置说明

### 环境变量 (.env)

#### 必需配置

```env
# 数据库连接
DATABASE_URL="postgresql://postgres:meeting123456@localhost:5432/meeting_system?schema=public"

# DeepSeek AI (用于会议纪要生成)
DEEPSEEK_API_KEY=sk-your-api-key-here
DEEPSEEK_MODEL=deepseek-chat

# Vosk模型路径
VOSK_MODEL_PATH=/app/python/models/vosk-model-small-cn-0.22
```

#### 可选配置

```env
# Redis
REDIS_URL=redis://localhost:6379

# 服务器配置
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# CORS
CORS_ORIGIN=*  # 生产环境应设置具体域名

# 会话配置
MAX_CONCURRENT_SESSIONS=10
SESSION_TIMEOUT=3600000

# pyannote.audio
PYANNOTE_DEVICE=cpu  # 或 cuda (如果有GPU)
```

### DeepSeek API 密钥获取

1. 访问 [DeepSeek开放平台](https://platform.deepseek.com/)
2. 注册/登录账号
3. 进入"API密钥"页面
4. 创建新密钥并复制到.env文件

### Vosk模型

系统默认使用中文小模型 (`vosk-model-small-cn-0.22`, 约50MB)。

**其他可选模型:**

- `vosk-model-cn-0.22` - 中文大模型 (约250MB, 更高准确率)
- `vosk-model-small-en-us-0.15` - 英文小模型
- 完整模型列表: https://alphacephei.com/vosk/models

---

## 故障排查

### 1. Docker网络问题

**症状**: 无法拉取镜像

**解决**:
```bash
# 配置Docker镜像加速
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://docker.mirrors.ustc.edu.cn",
    "https://hub-mirror.c.163.com"
  ]
}
EOF

sudo systemctl daemon-reload
sudo systemctl restart docker
```

### 2. 数据库连接失败

**症状**: `Error: P1001: Can't reach database server`

**检查步骤**:
```bash
# 1. 检查PostgreSQL是否运行
docker ps | grep postgres

# 2. 测试数据库连接
psql postgresql://postgres:meeting123456@localhost:5432/meeting_system

# 3. 查看数据库日志
docker logs meeting-postgres

# 4. 重启数据库
docker restart meeting-postgres
```

### 3. Vosk模型未找到

**症状**: `Error: 模型不存在`

**解决**:
```bash
cd python
python download-vosk-model.py

# 验证模型
ls -lh models/vosk-model-small-cn-0.22
```

### 4. Python环境问题

**症状**: `ModuleNotFoundError: No module named 'vosk'`

**解决**:
```bash
cd python

# 重新安装依赖
pip install -r requirements.txt

# 测试
python -c "import vosk; print('Vosk OK')"
python -c "import whisper; print('Whisper OK')"
python -c "from pyannote.audio import Pipeline; print('Pyannote OK')"
```

### 5. 端口被占用

**症状**: `Error: Port 3000 is already in use`

**解决**:
```bash
# 查找占用端口的进程
lsof -i :3000

# 停止进程
kill -9 <PID>

# 或修改.env中的PORT
PORT=3001
```

### 6. 健康检查失败

```bash
# 查看后端日志
docker-compose logs backend

# 进入容器调试
docker-compose exec backend sh

# 手动测试健康检查
curl -v http://localhost:3000/health
```

---

## 性能优化

### 1. 使用GPU加速

如果有NVIDIA GPU，可以显著加速声纹识别:

```env
# .env
PYANNOTE_DEVICE=cuda
```

**安装CUDA依赖** (在Dockerfile中):
```dockerfile
FROM nvidia/cuda:11.8.0-cudnn8-runtime-ubuntu22.04
```

### 2. 数据库优化

```sql
-- 创建索引
CREATE INDEX idx_meetings_created_at ON meetings(created_at);
CREATE INDEX idx_transcripts_meeting_id ON transcripts(meeting_id);
CREATE INDEX idx_transcripts_speaker_id ON transcripts(speaker_id);
```

### 3. Redis缓存

启用Redis可以提升API响应速度:

```env
REDIS_URL=redis://redis:6379
```

### 4. Nginx缓存

```nginx
# nginx.conf
location /api/ {
    proxy_cache api_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_key "$request_uri";
}
```

### 5. 并发会话限制

根据服务器资源调整:

```env
MAX_CONCURRENT_SESSIONS=5  # 减少占用
SESSION_TIMEOUT=1800000    # 30分钟超时
```

---

## 监控与日志

### 查看日志

```bash
# 所有服务
docker-compose logs -f

# 特定服务
docker-compose logs -f backend
docker-compose logs -f postgres

# 最近100行
docker-compose logs --tail=100 backend
```

### 日志位置

- 后端日志: `./logs/app.log`
- Nginx日志: `/var/log/nginx/`
- PostgreSQL日志: Docker容器内

### 健康监控

```bash
# 定期健康检查
watch -n 10 curl http://localhost:3000/health

# 服务状态
docker-compose ps
docker stats
```

---

## 备份与恢复

### 数据库备份

```bash
# 备份
docker exec meeting-postgres pg_dump -U postgres meeting_system > backup.sql

# 恢复
docker exec -i meeting-postgres psql -U postgres meeting_system < backup.sql
```

### 完整备份

```bash
# 打包整个系统
tar -czf meeting-system-backup.tar.gz \
    .env \
    uploads/ \
    logs/ \
    python/models/ \
    backup.sql
```

---

## 安全建议

1. **修改默认密码**:
   - 数据库密码
   - JWT_SECRET

2. **配置CORS**:
   ```env
   CORS_ORIGIN=https://yourdomain.com
   ```

3. **启用HTTPS**: 使用Let's Encrypt证书

4. **限制API访问**: 配置防火墙规则

5. **定期更新**:
   ```bash
   docker-compose pull
   docker-compose up -d
   ```

---

## 生产环境清单

- [ ] 修改所有默认密码
- [ ] 配置HTTPS证书
- [ ] 设置CORS白名单
- [ ] 配置数据库备份
- [ ] 设置日志轮转
- [ ] 配置监控告警
- [ ] 压力测试
- [ ] 文档备份

---

## 技术支持

- GitHub Issues: [提交问题](https://github.com/yourrepo/issues)
- 文档: [README.md](./README.md)
- API文档: http://localhost:3000/api/v1/docs

---

**祝部署顺利！** 🎉
