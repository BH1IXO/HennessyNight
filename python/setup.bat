@echo off
REM pyannote.audio 环境安装脚本 (Windows)

echo ============================================
echo 🚀 开始安装 pyannote.audio 环境...
echo ============================================
echo.

REM 检查Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 未检测到 Python
    echo 请先安装 Python 3.8+ from https://www.python.org/
    pause
    exit /b 1
)

echo 📌 检测到 Python:
python --version
echo.

REM 创建虚拟环境
echo 📦 创建虚拟环境...
python -m venv pyannote-env

REM 激活虚拟环境
echo ✅ 激活虚拟环境...
call pyannote-env\Scripts\activate.bat

REM 升级pip
echo ⬆️  升级 pip...
python -m pip install --upgrade pip

REM 检测GPU
nvidia-smi >nul 2>&1
if errorlevel 1 (
    echo 未检测到 NVIDIA GPU，安装 CPU 版本...
    pip install torch torchvision torchaudio
) else (
    echo 检测到 NVIDIA GPU，安装 CUDA 版本...
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
)

REM 安装pyannote.audio
echo 🎤 安装 pyannote.audio...
pip install -r requirements.txt

REM 测试安装
echo.
echo 🧪 测试安装...
python -c "import pyannote.audio; print('✅ pyannote.audio 安装成功！')"
python -c "import torch; print(f'✅ PyTorch 版本: {torch.__version__}')"
python -c "import torch; print(f'✅ CUDA 可用: {torch.cuda.is_available()}')"

echo.
echo =========================================
echo ✅ 安装完成！
echo.
echo 使用方法：
echo   1. 激活环境: pyannote-env\Scripts\activate.bat
echo   2. 运行测试: python test_pyannote.py
echo   3. 停用环境: deactivate
echo =========================================
echo.

pause
