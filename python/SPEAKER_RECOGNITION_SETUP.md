# 说话人识别设置指南

本指南介绍如何配置和使用 pyannote.audio 进行说话人分离和识别。

## 前提条件

- Python 3.8 或更高版本
- pip 包管理器
- 至少 4GB 可用内存
- 至少 2GB 磁盘空间用于模型下载

## 安装步骤

### 1. 创建虚拟环境（推荐）

```bash
cd python
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

这将安装：
- pyannote.audio 3.1.1 (说话人分离核心库)
- torch 和 torchaudio (深度学习框架)
- librosa, soundfile (音频处理)
- numpy, scipy (数值计算)
- huggingface_hub (模型下载)

### 3. 配置 HuggingFace Token

pyannote.audio 使用 HuggingFace 托管的预训练模型。需要一个 HuggingFace 账号和访问令牌。

#### 3.1 创建 HuggingFace 账号

访问 https://huggingface.co/join 创建免费账号。

#### 3.2 获取访问令牌

1. 登录后访问 https://huggingface.co/settings/tokens
2. 点击 "New token"
3. 输入名称 (如 "pyannote-access")
4. 选择 "read" 权限
5. 点击 "Generate"
6. 复制生成的令牌

#### 3.3 接受模型许可

访问以下页面并接受模型使用条款：

1. https://huggingface.co/pyannote/speaker-diarization-3.1
2. https://huggingface.co/pyannote/embedding

在每个页面点击 "Agree and access repository"。

#### 3.4 配置令牌

**方法 1: 环境变量（推荐）**

Windows:
```bash
set HUGGINGFACE_TOKEN=your_token_here
```

Linux/Mac:
```bash
export HUGGINGFACE_TOKEN=your_token_here
```

或者在 `.env` 文件中添加：
```
HUGGINGFACE_TOKEN=your_token_here
```

**方法 2: Python 登录**

```bash
huggingface-cli login
```

输入令牌时粘贴您的访问令牌。

## 测试安装

运行测试脚本验证安装：

```bash
python test_speaker_diarization.py
```

如果看到以下输出，说明安装成功：
```
[SpeakerDiarization] 处理音频: test_audio.wav
[SpeakerDiarization] 加载pyannote模型...
[SpeakerDiarization] 执行说话人分离...
[SpeakerDiarization] 识别到 X 个说话片段
```

## 使用说明

### 基本用法

```bash
python speaker_diarization.py audio_file.wav
```

### 带已注册说话人的用法

```bash
python speaker_diarization.py audio_file.wav '[{"id": 1, "name": "张三", "voiceprint": {...}}]'
```

### 输出格式

```json
{
  "success": true,
  "segments": [
    {
      "start": 0.0,
      "end": 5.2,
      "speaker": {
        "name": "张三",
        "confidence": 0.87
      }
    }
  ]
}
```

## 常见问题

### Q1: ImportError: No module named 'pyannote.audio'

**解决方案**: 确保虚拟环境已激活，重新运行 `pip install -r requirements.txt`

### Q2: 401 Unauthorized 错误

**解决方案**:
1. 检查 HUGGINGFACE_TOKEN 是否正确设置
2. 确认已接受模型使用条款
3. 验证令牌权限为 "read"

### Q3: 模型下载失败

**解决方案**:
1. 检查网络连接
2. 使用代理: `export HF_ENDPOINT=https://hf-mirror.com` (中国用户)
3. 手动下载模型到 `~/.cache/huggingface/`

### Q4: 内存不足错误

**解决方案**:
1. 减少音频文件长度（分段处理）
2. 增加系统内存
3. 使用较小的模型版本

### Q5: pyannote.audio 未安装时的降级方案

系统会自动降级到模拟数据模式，使用循环分配说话人。功能仍可用但识别准确度较低。

## 性能优化

### GPU 加速

如果有 NVIDIA GPU，安装 CUDA 版本的 PyTorch：

```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu118
```

### 批量处理

处理多个文件时，模型会缓存在内存中，后续处理会更快。

## 技术细节

### 说话人分离 (Speaker Diarization)

使用 pyannote/speaker-diarization-3.1 模型：
- 将音频分割为说话人片段
- 标记每个片段的说话人ID
- 支持 2-10 人的会议场景

### 声纹特征提取

使用 pyannote/embedding 模型：
- 提取 512 维声纹特征向量
- 使用余弦相似度进行比对
- 阈值设置为 0.6（可调整）

### 声纹匹配算法

1. 对每个说话片段提取特征
2. 与已注册说话人的声纹比对
3. 计算余弦相似度
4. 选择相似度最高且超过阈值的匹配

## 进一步阅读

- pyannote.audio 文档: https://github.com/pyannote/pyannote-audio
- 说话人分离原理: https://arxiv.org/abs/2104.04045
- HuggingFace Hub: https://huggingface.co/docs/hub

## 支持

如遇问题，请：
1. 查看本指南的常见问题部分
2. 检查 pyannote.audio GitHub Issues
3. 联系开发团队
