@echo off
chcp 65001 >nul
echo ========================================
echo  🚀 HennessyNight 一键启动脚本
echo ========================================
echo.

REM 检查 Docker 是否运行
echo [1/6] 检查 Docker 状态...
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker 未运行
    echo 📝 请先启动 Docker Desktop，然后重新运行此脚本
    echo.
    echo 按任意键退出...
    pause >nul
    exit /b 1
)
echo ✅ Docker 正在运行

REM 启动 PostgreSQL
echo.
echo [2/6] 启动 PostgreSQL 数据库...
docker-compose up -d postgres
if %errorlevel% neq 0 (
    echo ❌ 启动数据库失败
    pause
    exit /b 1
)
echo ✅ 数据库容器已启动

REM 等待数据库就绪
echo.
echo [3/6] 等待数据库初始化（15秒）...
timeout /t 15 /nobreak >nul
echo ✅ 数据库就绪

REM 生成 Prisma Client
echo.
echo [4/6] 生成 Prisma Client...
call npm run prisma:generate
if %errorlevel% neq 0 (
    echo ❌ 生成 Prisma Client 失败
    pause
    exit /b 1
)
echo ✅ Prisma Client 生成成功

REM 运行数据库迁移
echo.
echo [5/6] 初始化数据库表...
call npm run prisma:migrate
if %errorlevel% neq 0 (
    echo.
    echo ⚠️  数据库迁移可能失败（首次运行正常）
    echo 继续启动服务器...
)

REM 构建项目
echo.
echo [6/6] 构建 TypeScript 代码...
call npm run build
if %errorlevel% neq 0 (
    echo ❌ 构建失败
    pause
    exit /b 1
)
echo ✅ 构建成功

echo.
echo ========================================
echo  🎉 启动完成！
echo ========================================
echo.
echo 📍 系统地址:
echo    - 前端: http://localhost:3000
echo    - API:  http://localhost:3000/api/v1/docs
echo.
echo 🚀 正在启动开发服务器...
echo.
echo ⚠️  按 Ctrl+C 可停止服务器
echo.

REM 启动开发服务器
call npm run dev
