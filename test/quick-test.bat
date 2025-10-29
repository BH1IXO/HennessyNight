@echo off
REM 快速测试脚本 - Windows版本
REM 测试主要API端点

setlocal enabledelayedexpansion

set BASE_URL=http://localhost:3000
set API_URL=%BASE_URL%/api/v1

echo ======================================================
echo 🧪 Meeting System Backend - 快速测试
echo ======================================================
echo.

REM 1. 测试健康检查
echo 1️⃣  测试健康检查
curl -s %BASE_URL%/health
echo.
echo.

REM 2. 测试API文档
echo 2️⃣  测试API文档
curl -s %API_URL%/docs
echo.
echo.

REM 3. 创建说话人
echo 3️⃣  创建说话人
curl -s -X POST %API_URL%/speakers ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"测试用户\",\"email\":\"test@example.com\"}"
echo.
echo.

REM 4. 获取说话人列表
echo 4️⃣  获取说话人列表
curl -s %API_URL%/speakers
echo.
echo.

REM 5. 创建会议
echo 5️⃣  创建会议
curl -s -X POST %API_URL%/meetings ^
  -H "Content-Type: application/json" ^
  -d "{\"title\":\"快速测试会议\",\"description\":\"这是一个自动化测试会议\"}"
echo.
echo.

REM 6. 获取会议列表
echo 6️⃣  获取会议列表
curl -s %API_URL%/meetings
echo.
echo.

REM 7. 获取会话统计
echo 7️⃣  获取会话统计
curl -s %API_URL%/sessions/stats
echo.
echo.

echo ======================================================
echo ✅ 测试完成！
echo ======================================================
echo.
echo 提示：请查看上面的响应，确认所有API都返回了正确的数据
echo.

pause
