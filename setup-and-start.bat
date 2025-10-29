@echo off
REM 一键配置和启动脚本

echo ======================================================
echo 🚀 Meeting System Backend - 一键启动
echo ======================================================
echo.

echo 检查环境...
echo.

REM 检查Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 未检测到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js 已安装
node --version
echo.

REM 检查Docker
docker --version >nul 2>&1
if errorlevel 1 (
    echo ⚠️  未检测到 Docker
    echo 你可以：
    echo   1. 安装 Docker Desktop: https://www.docker.com/products/docker-desktop
    echo   2. 或手动安装 PostgreSQL: https://www.postgresql.org/download/
    echo.
    echo 按任意键继续（假设你已有PostgreSQL）...
    pause >nul
) else (
    echo ✅ Docker 已安装
    docker --version
    echo.

    echo 🐘 启动 PostgreSQL 容器...
    docker ps -a | findstr meeting-postgres >nul 2>&1
    if errorlevel 1 (
        echo 创建新的 PostgreSQL 容器...
        docker run --name meeting-postgres -e POSTGRES_PASSWORD=meeting123456 -p 5432:5432 -d postgres:14
        echo ⏳ 等待数据库启动...
        timeout /t 5 /nobreak >nul
    ) else (
        echo 启动已有的 PostgreSQL 容器...
        docker start meeting-postgres
        timeout /t 3 /nobreak >nul
    )

    echo ✅ PostgreSQL 已启动
    echo    用户名: postgres
    echo    密码: meeting123456
    echo    端口: 5432
    echo.
)

REM 安装依赖
echo 📦 安装 Node.js 依赖...
call npm install
if errorlevel 1 (
    echo ❌ npm install 失败
    pause
    exit /b 1
)
echo ✅ 依赖安装完成
echo.

REM 生成 Prisma Client
echo 🔧 生成 Prisma Client...
call npx prisma generate
if errorlevel 1 (
    echo ❌ Prisma generate 失败
    pause
    exit /b 1
)
echo ✅ Prisma Client 生成完成
echo.

REM 运行数据库迁移
echo 🗄️  运行数据库迁移...
call npx prisma migrate dev --name init
if errorlevel 1 (
    echo ❌ 数据库迁移失败
    echo.
    echo 可能的原因：
    echo   1. PostgreSQL 未运行
    echo   2. 数据库密码不正确
    echo   3. 端口 5432 被占用
    echo.
    echo 请检查 .env 文件中的 DATABASE_URL 配置
    pause
    exit /b 1
)
echo ✅ 数据库迁移完成
echo.

REM 启动服务器
echo ======================================================
echo ✅ 配置完成！正在启动服务器...
echo ======================================================
echo.
echo 服务器启动后可访问：
echo   - 健康检查: http://localhost:3000/health
echo   - API文档:   http://localhost:3000/api/v1/docs
echo.
echo 按 Ctrl+C 停止服务器
echo.
echo ======================================================
echo.

call npm run dev
