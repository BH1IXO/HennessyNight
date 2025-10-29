@echo off
REM =============================================================================
REM 智能会议纪要系统 - Windows部署脚本
REM =============================================================================

setlocal enabledelayedexpansion

echo ==========================================
echo 智能会议纪要系统 - 部署脚本
echo ==========================================
echo.

REM 检查Docker是否安装
docker --version >nul 2>&1
if errorlevel 1 (
    echo [错误] Docker未安装，请先安装Docker Desktop
    echo 下载地址: https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)

docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [错误] Docker Compose未安装
    pause
    exit /b 1
)

echo [成功] Docker环境检查通过
echo.

REM 检查.env文件
if not exist ".env" (
    echo [警告] .env文件不存在，正在创建...

    if exist ".env.example" (
        copy .env.example .env >nul
        echo [成功] 已从.env.example创建.env文件
        echo [警告] 请编辑.env文件，配置必要的环境变量
        pause
        exit /b 1
    ) else (
        echo [错误] .env.example文件不存在
        pause
        exit /b 1
    )
)

echo [成功] 环境配置文件存在
echo.

REM 检查Vosk模型
set VOSK_MODEL_PATH=python\models\vosk-model-small-cn-0.22
if not exist "%VOSK_MODEL_PATH%" (
    echo [警告] Vosk中文模型不存在
    echo 正在下载Vosk模型（约50MB）...

    cd python
    python download-vosk-model.py
    cd ..

    if exist "%VOSK_MODEL_PATH%" (
        echo [成功] Vosk模型下载完成
    ) else (
        echo [错误] Vosk模型下载失败
        pause
        exit /b 1
    )
)

echo [成功] Vosk模型已就绪
echo.

REM 停止旧容器
echo 停止旧容器...
docker-compose down 2>nul
echo.

REM 构建镜像
echo 构建Docker镜像...
docker-compose build
if errorlevel 1 (
    echo [错误] 镜像构建失败
    pause
    exit /b 1
)
echo [成功] 镜像构建完成
echo.

REM 启动服务
echo 启动服务...
docker-compose up -d
if errorlevel 1 (
    echo [错误] 服务启动失败
    pause
    exit /b 1
)
echo.

REM 等待服务启动
echo 等待服务启动...
timeout /t 10 /nobreak >nul
echo.

REM 检查服务状态
echo 检查服务状态...
docker-compose ps
echo.

REM 初始化数据库
echo 初始化数据库...
docker-compose exec -T backend npx prisma generate
docker-compose exec -T backend npx prisma migrate deploy
echo [成功] 数据库初始化完成
echo.

REM 健康检查
echo 执行健康检查...
curl -s -o nul -w "%%{http_code}" http://localhost:3000/health > temp_status.txt
set /p HTTP_CODE=<temp_status.txt
del temp_status.txt

if "%HTTP_CODE%"=="200" (
    echo [成功] 后端服务健康检查通过
) else (
    echo [错误] 后端服务健康检查失败 (HTTP %HTTP_CODE%)
    echo 查看日志: docker-compose logs backend
    pause
    exit /b 1
)

echo.
echo ==========================================
echo 部署完成！
echo ==========================================
echo.
echo 访问地址:
echo   前端: http://localhost
echo   API: http://localhost:3000
echo   健康检查: http://localhost:3000/health
echo   API文档: http://localhost:3000/api/v1/docs
echo.
echo 管理命令:
echo   查看日志: docker-compose logs -f
echo   停止服务: docker-compose stop
echo   重启服务: docker-compose restart
echo   删除服务: docker-compose down
echo.
pause
