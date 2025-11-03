@echo off
chcp 65001 >nul
cls
echo.
echo ╔════════════════════════════════════════════╗
echo ║   HennessyNight 智能会议系统 - 快速启动   ║
echo ╔════════════════════════════════════════════╗
echo.
echo 🚀 直接启动开发服务器（跳过编译）...
echo.
echo 📍 启动后访问: http://localhost:3000
echo.
echo ⚠️  说明:
echo    - 前端界面可以正常使用
echo    - 数据库功能需要手动配置
echo    - 按 Ctrl+C 可停止服务器
echo.
echo ────────────────────────────────────────────
echo.

cd /d D:\Hennessy.Night\HennessyNight
npm run dev
