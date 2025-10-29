@echo off
REM Whisper 安装脚本 (Windows)

echo ======================================================
echo 🎤 安装 Whisper 语音识别
echo ======================================================
echo.

REM 检查Python环境
if not exist "pyannote-env" (
    echo ❌ 错误: Python环境不存在
    echo.
    echo 请先运行 setup.bat 创建Python环境
    pause
    exit /b 1
)

echo ✅ 检测到 Python 环境
echo.

REM 激活环境
echo 🔧 激活 Python 环境...
call pyannote-env\Scripts\activate.bat

REM 升级pip
echo 📦 升级 pip...
python -m pip install --upgrade pip

REM 安装Whisper
echo 🎤 安装 OpenAI Whisper...
echo.
echo ℹ️  这可能需要几分钟，请耐心等待...
echo.

pip install openai-whisper

if errorlevel 1 (
    echo ❌ Whisper 安装失败
    pause
    exit /b 1
)

echo.
echo ✅ Whisper 安装成功
echo.

REM 测试安装
echo 🧪 测试 Whisper 安装...
python test_whisper.py

if errorlevel 1 (
    echo ❌ Whisper 测试失败
    pause
    exit /b 1
)

echo.
echo ======================================================
echo ✅ Whisper 安装完成！
echo ======================================================
echo.
echo 下一步：
echo   1. 确保 .env 文件中配置了：
echo      TRANSCRIPTION_PROVIDER=whisper
echo.
echo   2. 启动服务器：
echo      npm run dev
echo.
echo   3. 测试转录功能：
echo      上传音频文件到 /api/v1/audio/upload
echo.
echo ======================================================
echo.

pause
