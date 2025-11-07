# WeSpeaker 声纹识别方案

## 概述

WeSpeaker 是 WeNet 团队开发的业界顶尖声纹识别工具包，在 CNSRC 2022 比赛中获得冠军。

## 技术指标

- **VoxCeleb1 EER**: 0.723% (ResNet34)
- **CN-Celeb**: 中文冠军级别性能
- **模型架构**: ResNet34 / ECAPA-TDNN
- **特征维度**: 256
- **工业级质量**: 生产就绪

## 安装

```bash
cd python
./pyannote-env/Scripts/python.exe -m pip install git+https://github.com/wenet-e2e/wespeaker.git
```

## 测试安装

```bash
cd python
./pyannote-env/Scripts/python.exe wespeaker_service.py test
```

## 使用方法

### 1. 提取声纹特征

```bash
python wespeaker_service.py extract <audio_file> [model_type] [device]

# 示例
python wespeaker_service.py extract test.wav chinese cpu
```

参数:
- `audio_file`: 音频文件路径 (WAV格式)
- `model_type`: 'chinese' (中文，推荐) 或 'english'
- `device`: 'cpu' 或 'cuda'

输出:
```json
{
  "success": true,
  "embedding": [0.123, -0.456, ...],  // 256维特征向量
  "shape": [256],
  "model": "chinese"
}
```

### 2. 1:1 声纹验证

```bash
python wespeaker_service.py verify <audio1> <audio2> [threshold] [model_type] [device]

# 示例
python wespeaker_service.py verify speaker1.wav test.wav 0.50 chinese cpu
```

参数:
- `audio1`, `audio2`: 两个音频文件
- `threshold`: 相似度阈值 (推荐: 0.50)
- `model_type`: 模型类型
- `device`: 运行设备

输出:
```json
{
  "success": true,
  "verified": true,
  "similarity": 0.876,
  "confidence": 0.876,
  "threshold": 0.50,
  "score": 0.876
}
```

### 3. 1:N 声纹识别

```bash
python wespeaker_service.py identify <audio_file> <reference_json> [threshold] [model_type] [device]

# 示例
python wespeaker_service.py identify test.wav '{"speaker1": [...], "speaker2": [...]}' 0.50 chinese cpu
```

参数:
- `audio_file`: 待识别音频
- `reference_json`: JSON字符串，格式: `{"speaker_id": [embedding_array], ...}`
- `threshold`: 识别阈值
- `model_type`: 模型类型
- `device`: 运行设备

输出:
```json
{
  "success": true,
  "identified": true,
  "profileId": "speaker1",
  "speakerId": "speaker1",
  "confidence": 0.923,
  "similarity": 0.923,
  "threshold": 0.50,
  "candidates": [
    {"profileId": "speaker1", "confidence": 0.923},
    {"profileId": "speaker2", "confidence": 0.412}
  ]
}
```

## 阈值推荐

| 应用场景 | 推荐阈值 | 说明 |
|---------|---------|------|
| 平衡模式 | 0.50 | 准确率与召回率平衡 |
| 严格模式 | 0.60 | 更高准确率，低误识别 |
| 宽松模式 | 0.40 | 更高召回率，可能误识别 |
| 高安全场景 | 0.70 | 最严格，几乎无误识别 |

## 模型选择

- **chinese**: 推荐用于中文场景，在CN-Celeb数据集上训练，200k中文说话人
- **english**: 英文场景，在VoxCeleb数据集上训练

## 性能优势

### 对比 3D-Speaker (阿里达摩院)
- WeSpeaker EER: 0.723%
- 3D-Speaker EER: 未公开，但WeSpeaker在CNSRC 2022获得冠军
- 结论: WeSpeaker 在业界竞赛中表现更优

### 对比 SpeechBrain
- WeSpeaker: 专门优化的声纹识别系统
- SpeechBrain: 通用语音工具包
- 结论: WeSpeaker 在声纹识别上更专业

## TypeScript Provider

位置: `src/services/providers/voiceprint/WeSpeakerVoiceprint.ts`

使用:
```typescript
import { WeSpeakerVoiceprintProvider } from '@/services/providers/voiceprint/WeSpeakerVoiceprint';

const provider = new WeSpeakerVoiceprintProvider({
  modelType: 'chinese',
  threshold: 0.50,
  device: 'cpu'
});

// 注册声纹
await provider.enrollProfile('user123', audioBuffer);

// 1:1验证
const verifyResult = await provider.verifyProfile('user123', audioBuffer);

// 1:N识别
const identifyResult = await provider.identifyProfile(audioBuffer, ['user1', 'user2']);
```

## 环境变量配置

在 `.env` 文件中:

```bash
# WeSpeaker配置
WESPEAKER_MODEL=chinese          # 模型类型: chinese | english
WESPEAKER_THRESHOLD=0.50         # 识别阈值: 0.40-0.70
WESPEAKER_DEVICE=cpu             # 运行设备: cpu | cuda
```

## 故障排除

### 问题1: 模型下载失败
首次运行会自动下载模型（约50MB），需要网络连接。
解决: 检查网络，等待自动下载完成。

### 问题2: CUDA不可用
错误: "CUDA is not available"
解决: 设置 `device: 'cpu'` 或安装CUDA。

### 问题3: 音频格式错误
错误: "Invalid audio format"
解决: 确保音频为WAV格式，16kHz采样率。

## 更多信息

- GitHub: https://github.com/wenet-e2e/wespeaker
- 论文: WeSpeaker: A Research and Production oriented Speaker Embedding Learning Toolkit
- WeNet官网: https://github.com/wenet-e2e/wenet
