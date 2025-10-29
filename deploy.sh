#!/bin/bash

###############################################################################
# 智能会议纪要系统 - 一键部署脚本
# 适用于 Linux/Mac 系统
###############################################################################

set -e  # 遇到错误立即退出

echo "=========================================="
echo "智能会议纪要系统 - 部署脚本"
echo "=========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo -e "${RED}错误: Docker未安装，请先安装Docker${NC}"
    echo "安装地址: https://www.docker.com/get-started"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}错误: Docker Compose未安装${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Docker环境检查通过${NC}"
echo ""

# 检查.env文件
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}! .env文件不存在，正在创建...${NC}"

    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo -e "${GREEN}✓ 已从.env.example创建.env文件${NC}"
        echo -e "${YELLOW}! 请编辑.env文件，配置必要的环境变量${NC}"
        exit 1
    else
        echo -e "${RED}错误: .env.example文件不存在${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ 环境配置文件存在${NC}"
echo ""

# 检查Vosk模型
VOSK_MODEL_PATH="./python/models/vosk-model-small-cn-0.22"
if [ ! -d "$VOSK_MODEL_PATH" ]; then
    echo -e "${YELLOW}! Vosk中文模型不存在${NC}"
    echo "正在下载Vosk模型（约50MB）..."

    cd python
    python download-vosk-model.py
    cd ..

    if [ -d "$VOSK_MODEL_PATH" ]; then
        echo -e "${GREEN}✓ Vosk模型下载完成${NC}"
    else
        echo -e "${RED}错误: Vosk模型下载失败${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}✓ Vosk模型已就绪${NC}"
echo ""

# 停止旧容器
echo "停止旧容器..."
docker-compose down 2>/dev/null || true
echo ""

# 构建镜像
echo "构建Docker镜像..."
docker-compose build
echo -e "${GREEN}✓ 镜像构建完成${NC}"
echo ""

# 启动服务
echo "启动服务..."
docker-compose up -d
echo ""

# 等待服务启动
echo "等待服务启动..."
sleep 10

# 检查服务状态
echo "检查服务状态..."
docker-compose ps
echo ""

# 初始化数据库
echo "初始化数据库..."
docker-compose exec -T backend npx prisma generate
docker-compose exec -T backend npx prisma migrate deploy
echo -e "${GREEN}✓ 数据库初始化完成${NC}"
echo ""

# 健康检查
echo "执行健康检查..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)

if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✓ 后端服务健康检查通过${NC}"
else
    echo -e "${RED}✗ 后端服务健康检查失败 (HTTP $HTTP_CODE)${NC}"
    echo "查看日志: docker-compose logs backend"
    exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN}部署完成！${NC}"
echo "=========================================="
echo ""
echo "访问地址:"
echo "  前端: http://localhost"
echo "  API: http://localhost:3000"
echo "  健康检查: http://localhost:3000/health"
echo "  API文档: http://localhost:3000/api/v1/docs"
echo ""
echo "管理命令:"
echo "  查看日志: docker-compose logs -f"
echo "  停止服务: docker-compose stop"
echo "  重启服务: docker-compose restart"
echo "  删除服务: docker-compose down"
echo ""
