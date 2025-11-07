@echo off
REM FunASR + SpeechBrain 环境安装脚本 (Windows)

echo ============================================
echo 🚀 开始安装 FunASR + SpeechBrain 环境...
echo ============================================
echo.
echo 新方案特性:
echo   - FunASR: 阿里达摩院语音识别 (中文准确率95%+)
echo   - SpeechBrain: 开源声纹识别
echo   - 实时流式识别 + VAD断句 + 标点预测
echo   - 完全免费，无需API Key
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
if not exist pyannote-env (
    python -m venv pyannote-env
    echo ✅ 虚拟环境创建成功
) else (
    echo ⚠️  虚拟环境已存在，跳过创建
)

REM 激活虚拟环境
echo ✅ 激活虚拟环境...
call pyannote-env\Scripts\activate.bat

REM 升级pip
echo ⬆️  升级 pip...
python -m pip install --upgrade pip

REM 检测GPU
nvidia-smi >nul 2>&1
if errorlevel 1 (
    echo 📌 未检测到 NVIDIA GPU，安装 CPU 版本...
    pip install torch torchvision torchaudio
) else (
    echo 📌 检测到 NVIDIA GPU，安装 CUDA 版本...
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
)

REM 安装FunASR + SpeechBrain
echo.
echo 🎤 安装 FunASR (阿里达摩院语音识别)...
pip install funasr modelscope

echo.
echo 🔊 安装 SpeechBrain (声纹识别)...
pip install speechbrain

echo.
echo 📦 安装其他依赖...
pip install -r requirements.txt

REM 测试安装
echo.
echo ============================================
echo 🧪 测试安装...
echo ============================================

REM 测试PyTorch
python -c "import torch; print(f'✅ PyTorch 版本: {torch.__version__}')"
python -c "import torch; print(f'✅ CUDA 可用: {torch.cuda.is_available()}')"

REM 测试FunASR
echo.
echo 测试 FunASR...
python funasr_service.py test
if errorlevel 1 (
    echo ⚠️  FunASR测试失败，但可以继续
) else (
    echo ✅ FunASR 安装成功！
)

REM 测试SpeechBrain
echo.
echo 测试 SpeechBrain...
python speechbrain_voiceprint.py test
if errorlevel 1 (
    echo ⚠️  SpeechBrain测试失败，但可以继续
) else (
    echo ✅ SpeechBrain 安装成功！
)

echo.
echo ============================================
echo ✅ 安装完成！
echo ============================================
echo.
echo 新方案优势:
echo   ✅ 中文识别准确率 95%+ (FunASR)
echo   ✅ 实时流式识别 + VAD自动断句
echo   ✅ 智能标点预测
echo   ✅ 声纹识别准确率更高 (SpeechBrain)
echo   ✅ 完全免费开源
echo   ✅ 无需HuggingFace Token
echo.
echo 使用方法：
echo   1. 激活环境: pyannote-env\Scripts\activate.bat
echo   2. 测试FunASR: python funasr_service.py test
echo   3. 测试SpeechBrain: python speechbrain_voiceprint.py test
echo   4. 停用环境: deactivate
echo.
echo 旧方案回退 (如需要):
echo   取消注释 requirements.txt 中的 pyannote.audio 依赖
echo   重新运行: pip install -r requirements.txt
echo ============================================
echo.

pause
