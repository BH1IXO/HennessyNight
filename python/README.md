# pyannote.audio 声纹识别配置指南

## 📋 系统要求

### 最低要求（CPU模式）
- Python 3.8+
- 8GB RAM
- 10GB 硬盘空间
- 处理速度：约 60-120 秒/分钟音频

### 推荐配置（GPU模式）⭐
- Python 3.8+
- NVIDIA GPU (2GB+ 显存)
- CUDA 11.8+
- 16GB RAM
- 15GB 硬盘空间
- 处理速度：约 10-20 秒/分钟音频

## 🚀 快速安装

### Windows

```bash
# 1. 进入python目录
cd meeting-system-backend\python

# 2. 运行安装脚本
setup.bat

# 3. 激活环境
pyannote-env\Scripts\activate.bat

# 4. 测试安装
python test_pyannote.py
```

### Linux / macOS

```bash
# 1. 进入python目录
cd meeting-system-backend/python

# 2. 添加执行权限
chmod +x setup.sh

# 3. 运行安装脚本
./setup.sh

# 4. 激活环境
source pyannote-env/bin/activate

# 5. 测试安装
python test_pyannote.py
```

## 📦 手动安装

如果自动安装脚本失败，可以手动安装：

```bash
# 1. 创建虚拟环境
python -m venv pyannote-env

# 2. 激活环境
# Windows:
pyannote-env\Scripts\activate.bat
# Linux/Mac:
source pyannote-env/bin/activate

# 3. 安装PyTorch
# CPU版本:
pip install torch torchvision torchaudio

# GPU版本 (推荐):
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# 4. 安装pyannote.audio
pip install -r requirements.txt

# 5. 测试
python test_pyannote.py
```

## 🔧 配置说明

### 1. 环境变量配置

在 `meeting-system-backend/.env` 文件中配置：

```env
# pyannote.audio配置
PYANNOTE_DEVICE=cuda          # 'cuda' 或 'cpu'
PYANNOTE_MODEL_PATH=pyannote/speaker-diarization
PYANNOTE_MIN_SPEAKERS=1
PYANNOTE_MAX_SPEAKERS=10
```

### 2. 模型配置

pyannote.audio 需要预训练模型，有两种方式：

#### 方式A：使用HuggingFace Hub（推荐）

```python
# 需要HuggingFace token（免费注册）
# 访问：https://huggingface.co/pyannote/speaker-diarization
# 接受模型许可证
# 生成token: https://huggingface.co/settings/tokens

# 设置环境变量
export HF_TOKEN=your_huggingface_token
```

#### 方式B：本地模型（无需网络）

```bash
# 1. 下载预训练模型
# 从HuggingFace下载或使用已有模型

# 2. 放置到 models 目录
mkdir -p models/pyannote
# 复制模型文件到这个目录

# 3. 修改配置
PYANNOTE_MODEL_PATH=./models/pyannote/speaker-diarization
```

## 🧪 测试验证

### 基础测试

```bash
python test_pyannote.py
```

预期输出：
```
✅ pyannote.audio 版本: 3.1.1
✅ PyTorch 版本: 2.x.x
✅ CUDA 可用: True/False
✅ 使用设备: cuda/cpu
```

### 实际音频测试

准备一个测试音频文件：

```python
# test_diarization.py
from pyannote.audio import Pipeline
import torch

# 加载pipeline
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization",
    use_auth_token="YOUR_HF_TOKEN"  # 如果需要
)

# 设置设备
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
pipeline = pipeline.to(device)

# 运行说话人分离
diarization = pipeline("test_audio.wav")

# 打印结果
for turn, _, speaker in diarization.itertracks(yield_label=True):
    print(f"Speaker {speaker}: {turn.start:.1f}s - {turn.end:.1f}s")
```

## 📊 性能对比

### CPU模式（Intel i7）
- 处理1分钟音频：约 60-90 秒
- 内存占用：约 2-3 GB
- 适合：测试、小规模使用

### GPU模式（NVIDIA RTX 3060）
- 处理1分钟音频：约 10-15 秒
- 显存占用：约 1-2 GB
- 内存占用：约 2-3 GB
- 适合：生产环境、大规模使用

### 云GPU方案（推荐）

如果本地没有GPU，可以使用云服务：

1. **AutoDL** (国内)
   - 价格：¥2-4/小时
   - GPU：RTX 3080/3090
   - 网站：https://www.autodl.com/

2. **恒源云**
   - 价格：¥1-3/小时
   - GPU：RTX 3060/3080
   - 网站：https://gpushare.com/

3. **Colab** (国际)
   - 免费版：每天有限GPU时间
   - 付费版：$9.99/月
   - 网站：https://colab.research.google.com/

## 🐛 常见问题

### 1. 安装失败

**问题**：`pip install torch` 失败

**解决**：
```bash
# 更换清华源
pip install torch -i https://pypi.tuna.tsinghua.edu.cn/simple

# 或者手动下载whl文件
# https://download.pytorch.org/whl/torch_stable.html
```

### 2. CUDA版本不匹配

**问题**：`RuntimeError: CUDA error: no kernel image is available`

**解决**：
```bash
# 检查CUDA版本
nvidia-smi

# 安装对应版本的PyTorch
# CUDA 11.8:
pip install torch --index-url https://download.pytorch.org/whl/cu118

# CUDA 12.1:
pip install torch --index-url https://download.pytorch.org/whl/cu121
```

### 3. 模型下载失败

**问题**：无法从HuggingFace下载模型

**解决**：
```bash
# 方式1: 使用镜像
export HF_ENDPOINT=https://hf-mirror.com

# 方式2: 手动下载
# 访问：https://hf-mirror.com/pyannote/speaker-diarization
# 下载所有文件到本地，然后使用本地路径
```

### 4. 内存不足

**问题**：`CUDA out of memory`

**解决**：
```python
# 减少batch size或音频长度
# 或者切换到CPU模式
device = "cpu"
```

## 📝 最佳实践

### 1. 音频预处理

```python
# 转换为WAV格式，16kHz，单声道
import librosa
import soundfile as sf

audio, sr = librosa.load("input.mp3", sr=16000, mono=True)
sf.write("output.wav", audio, 16000)
```

### 2. 批量处理

```python
# 对长音频分段处理
def process_long_audio(audio_path, segment_duration=300):
    """
    分段处理长音频
    segment_duration: 每段时长（秒），默认5分钟
    """
    # 加载音频
    audio, sr = librosa.load(audio_path, sr=16000)
    total_duration = len(audio) / sr

    results = []
    for start in range(0, int(total_duration), segment_duration):
        end = min(start + segment_duration, total_duration)
        segment = audio[start*sr:end*sr]

        # 处理这一段
        # ...

        results.append(segment_result)

    return results
```

### 3. 结果缓存

```python
# 对相同音频缓存结果
import hashlib
import json
from pathlib import Path

def get_audio_hash(audio_path):
    """计算音频文件hash"""
    with open(audio_path, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()

def cache_result(audio_path, result):
    """缓存结果"""
    cache_dir = Path("cache")
    cache_dir.mkdir(exist_ok=True)

    audio_hash = get_audio_hash(audio_path)
    cache_file = cache_dir / f"{audio_hash}.json"

    with open(cache_file, 'w') as f:
        json.dump(result, f)

def get_cached_result(audio_path):
    """获取缓存结果"""
    cache_dir = Path("cache")
    audio_hash = get_audio_hash(audio_path)
    cache_file = cache_dir / f"{audio_hash}.json"

    if cache_file.exists():
        with open(cache_file, 'r') as f:
            return json.load(f)

    return None
```

## 🔗 相关资源

- pyannote.audio GitHub: https://github.com/pyannote/pyannote-audio
- 官方文档: https://github.com/pyannote/pyannote-audio/tree/develop/tutorials
- HuggingFace模型: https://huggingface.co/pyannote
- PyTorch官网: https://pytorch.org/

## 💡 下一步

安装完成后：

1. ✅ 运行测试脚本验证安装
2. ✅ 配置后端 `.env` 文件
3. ✅ 启动后端服务
4. ✅ 测试API接口

---

**需要帮助？** 查看主项目文档或提issue
