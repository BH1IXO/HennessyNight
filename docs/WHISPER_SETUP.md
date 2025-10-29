# Whisper 语音识别配置指南（免费方案）

## 🎯 为什么选择Whisper？

- ✅ **完全免费** - OpenAI开源模型
- ✅ **本地运行** - 无需API密钥
- ✅ **效果优秀** - 支持多语言，准确率高
- ✅ **无使用限制** - 想用多久用多久
- ✅ **隐私保护** - 数据不出本地

**缺点：**
- 需要较好的电脑配置（推荐有GPU）
- 首次运行需要下载模型（1-3GB）

---

## 🚀 快速安装

### 步骤1：安装Python依赖

```bash
cd D:\Hennessy.uno\meeting-system-backend\python

# 激活环境
pyannote-env\Scripts\activate

# 安装Whisper
pip install openai-whisper
```

### 步骤2：测试Whisper

```bash
# 测试安装
python -c "import whisper; print('✅ Whisper安装成功')"

# 加载模型测试（首次会下载）
python -c "import whisper; model = whisper.load_model('base'); print('✅ 模型加载成功')"
```

---

## 📝 集成到项目

### 创建Whisper服务

创建文件：`python/whisper_service.py`

```python
#!/usr/bin/env python3
"""
Whisper语音识别服务
"""

import whisper
import sys
import json

def transcribe_audio(audio_path, language='zh'):
    """转录音频文件"""
    try:
        # 加载模型（可选：tiny, base, small, medium, large）
        # tiny: 最快，准确率较低
        # base: 平衡选择 ⭐ 推荐
        # small/medium: 更准确，更慢
        model = whisper.load_model("base")

        # 转录
        result = model.transcribe(
            audio_path,
            language=language,
            verbose=False
        )

        # 返回结果
        return {
            "success": True,
            "text": result["text"],
            "segments": [
                {
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"]
                }
                for seg in result["segments"]
            ],
            "language": result["language"]
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "请提供音频文件路径"}))
        sys.exit(1)

    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "zh"

    result = transcribe_audio(audio_path, language)
    print(json.dumps(result, ensure_ascii=False))
```

---

## 🔧 Node.js集成

创建Whisper Provider：

文件：`src/services/providers/transcription/WhisperTranscription.ts`

```typescript
import { spawn } from 'child_process';
import path from 'path';
import { ITranscriptionProvider, TranscriptResult } from '../types';

export class WhisperTranscriptionProvider implements ITranscriptionProvider {
  readonly name = 'Whisper Speech Recognition';
  readonly type = 'whisper' as const;

  private pythonPath: string;

  constructor() {
    // Python环境路径
    this.pythonPath = path.join(
      process.cwd(),
      'python',
      'pyannote-env',
      process.platform === 'win32' ? 'Scripts' : 'bin',
      'python'
    );
  }

  /**
   * 转录音频文件
   */
  async transcribeFile(audioFile: Buffer, options?: any): Promise<TranscriptResult> {
    try {
      // 保存音频到临时文件
      const tempPath = await this.saveTemp(audioFile);

      // 调用Python脚本
      const result = await this.runWhisper(tempPath, options?.language || 'zh');

      // 清理临时文件
      await fs.unlink(tempPath);

      return {
        text: result.text,
        segments: result.segments.map((seg: any) => ({
          text: seg.text,
          startTime: seg.start,
          endTime: seg.end,
          confidence: 1.0 // Whisper不提供置信度
        })),
        language: result.language
      };

    } catch (error: any) {
      throw new Error(`Whisper转录失败: ${error.message}`);
    }
  }

  /**
   * 运行Whisper
   */
  private runWhisper(audioPath: string, language: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'python', 'whisper_service.py');

      const python = spawn(this.pythonPath, [scriptPath, audioPath, language]);

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Whisper执行失败: ${errorOutput}`));
          return;
        }

        try {
          const result = JSON.parse(output);

          if (!result.success) {
            reject(new Error(result.error));
            return;
          }

          resolve(result);
        } catch (error) {
          reject(new Error('解析Whisper结果失败'));
        }
      });
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const testResult = await this.runWhisper('test', 'zh');
      return true;
    } catch {
      return false;
    }
  }

  // 实时转录暂不支持
  async startRealtime(): Promise<void> {
    throw new Error('Whisper不支持实时转录，请使用文件转录');
  }

  async sendAudio(): Promise<void> {
    throw new Error('Whisper不支持实时转录');
  }

  async stopRealtime(): Promise<void> {
    throw new Error('Whisper不支持实时转录');
  }
}
```

---

## ⚙️ 配置使用

修改 `.env` 文件：

```env
# 转录服务选择
TRANSCRIPTION_PROVIDER=whisper  # 或 iflytek

# Whisper配置
WHISPER_MODEL=base  # tiny, base, small, medium, large
WHISPER_LANGUAGE=zh
WHISPER_DEVICE=cpu  # 或 cuda（如果有GPU）
```

---

## 🎯 模型选择

| 模型 | 大小 | 速度 | 准确率 | 推荐场景 |
|------|------|------|--------|----------|
| tiny | ~75MB | 很快 | 较低 | 快速测试 |
| **base** | ~150MB | 快 | 中等 | **开发推荐** ⭐ |
| small | ~500MB | 中等 | 良好 | 一般使用 |
| medium | ~1.5GB | 慢 | 很好 | 高质量需求 |
| large | ~3GB | 很慢 | 最好 | 生产环境 |

**建议：** 开发测试用 `base`，生产环境用 `small` 或 `medium`

---

## 📊 性能对比

### Whisper vs 讯飞

| 维度 | Whisper | 讯飞 |
|------|---------|------|
| **费用** | 完全免费 ✅ | 免费额度后收费 |
| **速度** | 较慢（本地计算） | 快（云端） |
| **准确率** | 优秀 | 优秀 |
| **实时性** | ❌ 不支持 | ✅ 支持 |
| **隐私** | ✅ 本地处理 | 上传到云端 |
| **配置** | 简单 | 需要API密钥 |

**结论：**
- **开发测试** → 用 Whisper（免费、简单）
- **实时转录** → 需要讯飞或其他实时API
- **生产环境** → 根据需求选择

---

## 🧪 测试Whisper

```bash
# 1. 激活Python环境
cd python
pyannote-env\Scripts\activate

# 2. 安装Whisper
pip install openai-whisper

# 3. 测试转录
python whisper_service.py test.wav zh
```

---

## 💡 优化建议

### 1. GPU加速（可选）

如果有NVIDIA GPU：

```bash
# 安装CUDA版本的PyTorch
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118

# 配置
WHISPER_DEVICE=cuda
```

速度提升 10-20倍！

### 2. 模型缓存

首次运行会自动下载模型，后续使用缓存：

```python
# 模型会缓存在：
# Windows: C:\Users\用户名\.cache\whisper\
# Linux/Mac: ~/.cache/whisper/
```

### 3. 批量处理

对于多个文件，可以重用模型：

```python
model = whisper.load_model("base")  # 加载一次

for audio_file in audio_files:
    result = model.transcribe(audio_file)
    # 处理结果...
```

---

## ❓ 常见问题

### Q: Whisper支持中文吗？
**A:** 完全支持！准确率很高。

### Q: 需要联网吗？
**A:** 首次下载模型需要，之后可以完全离线。

### Q: 可以实时转录吗？
**A:** Whisper设计为批量处理，不适合实时。实时需要用讯飞或其他方案。

### Q: 内存占用多大？
**A:**
- tiny/base: 1-2GB
- small/medium: 2-4GB
- large: 4-8GB

---

## 🎯 总结

**Whisper适合：**
- ✅ 录制好的音频文件转录
- ✅ 离线处理场景
- ✅ 不想付费的项目
- ✅ 重视隐私的场景

**不适合：**
- ❌ 实时语音转录
- ❌ 配置较低的电脑
- ❌ 要求极快响应的场景

**推荐方案：**
- **开发/测试** → Whisper（免费、简单）
- **生产环境** → 讯飞免费额度 + Whisper混合
- **实时场景** → 必须用讯飞或类似实时API

---

**下一步：** 运行 `pip install openai-whisper` 开始使用！
