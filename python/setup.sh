#!/bin/bash

# pyannote.audio 环境安装脚本 (Linux/Mac)

echo "🚀 开始安装 pyannote.audio 环境..."

# 检查Python版本
python_version=$(python3 --version 2>&1 | awk '{print $2}')
echo "📌 检测到 Python 版本: $python_version"

# 创建虚拟环境
echo "📦 创建虚拟环境..."
python3 -m venv pyannote-env

# 激活虚拟环境
echo "✅ 激活虚拟环境..."
source pyannote-env/bin/activate

# 升级pip
echo "⬆️  升级 pip..."
pip install --upgrade pip

# 安装PyTorch (根据系统选择)
echo "🔥 安装 PyTorch..."
if command -v nvidia-smi &> /dev/null; then
    echo "检测到 NVIDIA GPU，安装 CUDA 版本..."
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
else
    echo "未检测到 GPU，安装 CPU 版本..."
    pip install torch torchvision torchaudio
fi

# 安装pyannote.audio
echo "🎤 安装 pyannote.audio..."
pip install -r requirements.txt

# 测试安装
echo "🧪 测试安装..."
python3 -c "import pyannote.audio; print('✅ pyannote.audio 安装成功！')"
python3 -c "import torch; print(f'✅ PyTorch 版本: {torch.__version__}')"
python3 -c "import torch; print(f'✅ CUDA 可用: {torch.cuda.is_available()}')"

echo ""
echo "========================================="
echo "✅ 安装完成！"
echo ""
echo "使用方法："
echo "  1. 激活环境: source pyannote-env/bin/activate"
echo "  2. 运行测试: python test_pyannote.py"
echo "  3. 停用环境: deactivate"
echo "========================================="
