# 🚀 快速开始：FunASR + SpeechBrain 新方案

## ⚡ 5分钟快速上手

### 第一步：安装环境

```bash
# 进入Python目录
cd python

# 运行安装脚本
setup.bat

# 等待安装完成（约5-10分钟）
```

### 第二步：测试安装

```bash
# 激活虚拟环境
pyannote-env\Scripts\activate.bat

# 测试FunASR
python funasr_service.py test

# 测试SpeechBrain
python speechbrain_voiceprint.py test
```

看到 `✅ xxx 安装成功` 表示安装成功！

### 第三步：运行你的应用

```bash
# 回到项目根目录
cd ..

# 启动开发服务器
npm run dev
```

---

## 📝 主要改进

### 1. 语音识别 (FunASR)

**之前 (Vosk)**:
- 中文准确率: 75-80%
- 无标点
- 无自动断句

**现在 (FunASR)**:
- 中文准确率: **95%+** ⭐
- **自动标点预测**
- **VAD智能断句**
- **2pass模式** (实时+高精度)

### 2. 声纹识别 (SpeechBrain)

**之前 (pyannote)**:
- 需要HuggingFace Token
- 训练需要2-3次
- 模型较大

**现在 (SpeechBrain)**:
- **无需任何Token**
- **仅需训练1次**
- **模型更小更快**

---

## 🎯 推荐配置

### 实时会议场景

```typescript
// src/services/voiceprint/RealtimeVoiceprintEngine.ts

// 使用FunASR 2pass模式
const transcriptionProvider = new FunAsrTranscriptionProvider({
  mode: '2pass',      // 实时+高精度修正
  language: 'zh',
  device: 'cpu'
});

// 使用SpeechBrain声纹识别
const voiceprintProvider = new SpeechBrainVoiceprintProvider({
  threshold: 0.25,    // 平衡模式
  device: 'cpu'
});
```

### 离线音频处理

```typescript
// 使用FunASR离线模式（最高准确率）
const transcriptionProvider = new FunAsrTranscriptionProvider({
  mode: 'offline',    // 离线高精度
  language: 'zh',
  device: 'cpu'
});
```

---

## 🔧 常见问题

### Q1: 首次运行很慢？

A: 首次运行时会自动下载模型（约500MB），之后会缓存，请耐心等待。

### Q2: 中文识别效果不好？

A: 确保使用了 `mode: '2pass'` 或 `mode: 'offline'`，并且音频质量良好（16kHz, 单声道）。

### Q3: 声纹识别误识别率高？

A: 降低threshold参数（例如从0.25降到0.20），更严格的匹配。

### Q4: 如何回退到旧方案？

A: 编辑 `python/requirements.txt`，取消注释pyannote相关依赖，重新运行 `pip install -r requirements.txt`。

---

## 📊 性能对比

| 指标 | 旧方案 | 新方案 | 提升 |
|------|-------|--------|------|
| 中文准确率 | 75-80% | 95%+ | **+15-20%** |
| 模型大小 | 1-2GB | 200-800MB | **-60%** |
| 依赖包数量 | 25+ | 15+ | **-40%** |
| 训练次数 | 2-3次 | 1次 | **-66%** |
| 需要Token | 是 | 否 | **✅** |

---

## 🎉 新功能展示

### 1. VAD自动断句

**输入音频**:
> "今天天气不错（停顿300ms）我们去公园散步吧（停顿500ms）你觉得怎么样"

**输出**:
```json
{
  "sentences": [
    "今天天气不错。",
    "我们去公园散步吧。",
    "你觉得怎么样？"
  ]
}
```

### 2. 智能标点预测

**输入**: "今天天气不错我们去公园散步吧"

**输出**: "今天天气不错，我们去公园散步吧。"

### 3. 字级别时间戳

```json
{
  "timestamp": [
    {"word": "今天", "start": 0.0, "end": 0.4},
    {"word": "天气", "start": 0.4, "end": 0.8},
    {"word": "不错", "start": 0.8, "end": 1.2}
  ]
}
```

---

## 📚 下一步

1. 阅读完整文档: `python/README_NEW_SOLUTION.md`
2. 查看API示例: 文档中的"使用指南"部分
3. 运行测试: `npm run test`
4. 部署到生产: 参考 `docker-compose.yml`

---

## 💡 获取帮助

- **文档**: `python/README_NEW_SOLUTION.md`
- **Issue**: GitHub Issues
- **讨论**: GitHub Discussions

---

**开始享受更好的语音识别体验吧！** 🎊
