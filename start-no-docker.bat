@echo off
chcp 65001 >nul
echo ========================================
echo  HennessyNight - 简化启动（无需Docker）
echo ========================================
echo.
echo 注意: 此模式仅启动前端和部分功能
echo 完整功能需要PostgreSQL数据库
echo.

echo [1/2] 构建 TypeScript 代码...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo ❌ 构建失败，请检查错误信息
    pause
    exit /b 1
)

echo.
echo [2/2] 启动开发服务器...
echo.
echo ========================================
echo  ✅ 启动成功！
echo ========================================
echo.
echo 📍 访问地址: http://localhost:3000
echo.
echo ⚠️  说明:
echo    - 前端界面正常运行
echo    - 部分功能需要数据库（显示错误正常）
echo    - 按 Ctrl+C 停止服务器
echo.
echo 正在启动...
echo.

call npm run dev
