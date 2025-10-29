@echo off
REM =============================================================================
REM PostgreSQL 快速安装脚本 (Windows)
REM =============================================================================

echo ==========================================
echo PostgreSQL 快速安装向导
echo ==========================================
echo.

REM 检查是否已安装PostgreSQL
psql --version >nul 2>&1
if %errorlevel% equ 0 (
    echo [成功] PostgreSQL 已安装
    psql --version
    echo.
    goto :configure
)

echo [信息] PostgreSQL 未安装
echo.
echo 请选择安装方式:
echo   1. 自动下载安装 (推荐，约230MB)
echo   2. 手动安装 (我会打开下载页面)
echo   3. 跳过，使用Docker
echo.
set /p choice="请输入选择 (1/2/3): "

if "%choice%"=="1" goto :auto_install
if "%choice%"=="2" goto :manual_install
if "%choice%"=="3" goto :use_docker
echo [错误] 无效选择
pause
exit /b 1

:auto_install
echo.
echo [下载] PostgreSQL 14 便携版...
echo.

REM 下载地址
set PG_URL=https://get.enterprisedb.com/postgresql/postgresql-14.9-1-windows-x64-binaries.zip
set PG_ZIP=%TEMP%\postgresql-14-binaries.zip
set PG_DIR=C:\PostgreSQL14

echo 下载地址: %PG_URL%
echo 保存位置: %PG_ZIP%
echo 安装目录: %PG_DIR%
echo.

REM 使用PowerShell下载
powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%PG_URL%' -OutFile '%PG_ZIP%' -UseBasicParsing}"

if not exist "%PG_ZIP%" (
    echo [错误] 下载失败
    pause
    exit /b 1
)

echo [成功] 下载完成
echo.

echo [解压] 正在解压PostgreSQL...
powershell -Command "Expand-Archive -Path '%PG_ZIP%' -DestinationPath '%PG_DIR%' -Force"

if not exist "%PG_DIR%\pgsql" (
    echo [错误] 解压失败
    pause
    exit /b 1
)

echo [成功] 解压完成
echo.

REM 添加到PATH
setx PATH "%PATH%;%PG_DIR%\pgsql\bin" /M
set PATH=%PATH%;%PG_DIR%\pgsql\bin

echo [配置] 初始化数据库...
cd /d "%PG_DIR%\pgsql"

REM 初始化数据目录
bin\initdb.exe -D data -U postgres -A trust -E UTF8

REM 启动PostgreSQL
echo [启动] 启动PostgreSQL服务...
start /B bin\pg_ctl.exe -D data -l logfile start

REM 等待启动
timeout /t 5 /nobreak >nul

REM 创建数据库
bin\psql.exe -U postgres -c "CREATE DATABASE meeting_system;"
bin\psql.exe -U postgres -c "ALTER USER postgres WITH PASSWORD 'meeting123456';"

echo [成功] PostgreSQL 已安装并启动
echo.
goto :success

:manual_install
echo.
echo [打开] PostgreSQL 官方下载页面...
echo.
start https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
echo.
echo 请下载并安装 PostgreSQL 14+
echo 安装时请记住:
echo   - 用户名: postgres
echo   - 密码: meeting123456
echo   - 端口: 5432
echo.
echo 安装完成后，请手动创建数据库:
echo   CREATE DATABASE meeting_system;
echo.
pause
exit /b 0

:use_docker
echo.
echo [Docker] 使用Docker安装PostgreSQL...
echo.
docker run --name meeting-postgres -e POSTGRES_PASSWORD=meeting123456 -e POSTGRES_DB=meeting_system -p 5432:5432 -d postgres:14-alpine
if %errorlevel% neq 0 (
    echo [错误] Docker启动失败
    echo 请检查Docker是否正在运行
    pause
    exit /b 1
)
echo [成功] PostgreSQL容器已启动
echo.
goto :success

:configure
echo [配置] 检查数据库连接...
echo.
psql -U postgres -d meeting_system -c "\dt" >nul 2>&1
if %errorlevel% neq 0 (
    echo [创建] 数据库不存在，正在创建...
    psql -U postgres -c "CREATE DATABASE meeting_system;"
)

:success
echo ==========================================
echo PostgreSQL 安装完成！
echo ==========================================
echo.
echo 连接信息:
echo   主机: localhost
echo   端口: 5432
echo   数据库: meeting_system
echo   用户名: postgres
echo   密码: meeting123456
echo.
echo 下一步:
echo   1. 运行: npm run dev
echo   2. 访问: http://localhost:3000/health
echo.
pause
