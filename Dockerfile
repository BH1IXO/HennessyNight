# 多阶段构建 Dockerfile
# Stage 1: Python环境准备
FROM python:3.11-slim as python-builder

WORKDIR /python-build

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    make \
    wget \
    unzip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 复制Python依赖文件
COPY python/requirements.txt .

# 安装Python包
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Stage 2: Node.js构建
FROM node:18-alpine as node-builder

WORKDIR /app

# 复制package文件
COPY package*.json ./
COPY tsconfig.json ./

# 安装依赖
RUN npm ci --only=production && \
    npm install -g prisma

# 复制源代码
COPY src ./src
COPY prisma ./prisma

# 生成Prisma Client
RUN npx prisma generate

# 构建TypeScript
RUN npm run build

# Stage 3: 最终镜像
FROM python:3.11-slim

WORKDIR /app

# 安装运行时依赖
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 从python-builder复制Python环境
COPY --from=python-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-builder /usr/local/bin /usr/local/bin

# 安装Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# 复制构建产物
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/dist ./dist
COPY --from=node-builder /app/package*.json ./

# 复制Prisma
COPY prisma ./prisma
COPY --from=node-builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=node-builder /app/node_modules/@prisma ./node_modules/@prisma

# 复制Python脚本
COPY python ./python

# 创建必要的目录
RUN mkdir -p /app/uploads /app/logs /app/temp /app/python/models

# 设置权限
RUN chmod +x python/*.py

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["node", "dist/server.js"]
