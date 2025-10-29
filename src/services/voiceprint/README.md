# 实时声纹识别引擎使用指南 ⭐

## 📋 概述

实时声纹识别引擎是本系统的**核心亮点**，提供以下功能：

1. **实时语音转录**（讯飞语音）
2. **实时说话人分离**（pyannote.audio）
3. **声纹库匹配识别**（基于声纹库的1:N识别）
4. **事件驱动架构**（实时推送识别结果）

## 🏗️ 架构

```
┌─────────────────────────────────────────────────────┐
│           VoiceprintEngineManager                   │
│         (管理多个并发识别会话)                         │
└─────────────────┬───────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼────────┐  ┌──────▼──────────┐
│   Session 1    │  │   Session 2     │
│   (Meeting A)  │  │   (Meeting B)   │
└───────┬────────┘  └──────┬──────────┘
        │                  │
┌───────▼──────────────────▼──────────┐
│   RealtimeVoiceprintEngine          │
│   (单个会话的识别引擎)                 │
└───┬──────────────────────┬──────────┘
    │                      │
┌───▼────────────┐  ┌──────▼──────────────┐
│ iFlytek        │  │ pyannote.audio      │
│ 实时转录        │  │ 说话人分离 + 识别    │
└────────────────┘  └─────────────────────┘
```

## 🚀 快速开始

### 1. 初始化管理器

```typescript
import { getVoiceprintEngineManager } from '@/services/voiceprint/VoiceprintEngineManager';

// 初始化管理器
const manager = getVoiceprintEngineManager({
  maxConcurrentSessions: 10,           // 最大并发会话数
  sessionTimeout: 3600000,             // 会话超时时间（1小时）
  cleanupInterval: 60000,              // 清理检查间隔（1分钟）

  // 讯飞语音配置
  iflytekConfig: {
    appId: process.env.IFLYTEK_APP_ID!,
    apiKey: process.env.IFLYTEK_API_KEY!,
    apiSecret: process.env.IFLYTEK_API_SECRET!
  },

  // pyannote.audio配置
  pyannoteConfig: {
    modelPath: process.env.PYANNOTE_MODEL_PATH || 'pyannote/speaker-diarization',
    device: process.env.PYANNOTE_DEVICE as 'cpu' | 'cuda' || 'cpu'
  }
});
```

### 2. 创建识别会话

```typescript
// 创建会话
const sessionId = await manager.createSession({
  meetingId: 'meeting_123',

  // 候选说话人列表（可选）
  candidateSpeakerIds: ['speaker_1', 'speaker_2', 'speaker_3'],

  // 引擎配置（可选）
  engineConfig: {
    sampleRate: 16000,
    channels: 1,
    bufferDuration: 3,                 // 缓冲3秒后处理
    processingInterval: 1000,          // 每1秒处理一次
    identificationThreshold: 0.75,     // 声纹匹配阈值
    minSpeechDuration: 1.0             // 最小有效语音1秒
  }
});

console.log(`✅ 会话已创建: ${sessionId}`);
```

### 3. 监听识别事件

```typescript
// 监听转录结果
manager.on('transcript', (sessionId, segment) => {
  console.log(`📝 [${sessionId}] 转录:`, segment.text);
  console.log(`   说话人: ${segment.speakerName || 'Unknown'}`);
  console.log(`   时间: ${segment.startTime}s - ${segment.endTime}s`);
  console.log(`   置信度: ${(segment.confidence * 100).toFixed(1)}%`);
});

// 监听说话人识别
manager.on('speaker_identified', (sessionId, speakerId, speakerName, confidence) => {
  console.log(`✅ [${sessionId}] 识别到说话人: ${speakerName}`);
  console.log(`   ID: ${speakerId}`);
  console.log(`   置信度: ${(confidence * 100).toFixed(1)}%`);
});

// 监听未知说话人
manager.on('speaker_unknown', (sessionId, embeddingId) => {
  console.log(`❓ [${sessionId}] 检测到未知说话人: ${embeddingId}`);
});

// 监听错误
manager.on('error', (sessionId, error) => {
  console.error(`❌ [${sessionId}] 错误:`, error);
});

// 监听状态变化
manager.on('status', (sessionId, status) => {
  console.log(`📊 [${sessionId}] 状态变化: ${status}`);
});
```

### 4. 发送音频数据

```typescript
// 从麦克风或音频流获取数据
const audioStream = getMicrophoneStream();

audioStream.on('data', async (audioData: Buffer) => {
  try {
    // 发送音频到引擎
    await manager.sendAudio(sessionId, audioData);
  } catch (error) {
    console.error('发送音频失败:', error);
  }
});
```

### 5. 停止识别会话

```typescript
// 停止会话
await manager.destroySession(sessionId);
console.log('✅ 会话已停止');
```

## 📡 完整示例：WebSocket集成

```typescript
import { Server } from 'socket.io';
import { getVoiceprintEngineManager } from '@/services/voiceprint/VoiceprintEngineManager';

// 初始化Socket.IO
const io = new Server(server, {
  cors: { origin: '*' }
});

// 初始化管理器
const manager = getVoiceprintEngineManager({
  maxConcurrentSessions: 10,
  sessionTimeout: 3600000,
  cleanupInterval: 60000,
  iflytekConfig: { /* ... */ },
  pyannoteConfig: { /* ... */ }
});

// 处理客户端连接
io.on('connection', (socket) => {
  console.log(`🔌 客户端连接: ${socket.id}`);

  let sessionId: string | null = null;

  // 开始录音
  socket.on('start-recording', async (data: { meetingId: string; speakerIds: string[] }) => {
    try {
      // 创建会话
      sessionId = await manager.createSession({
        meetingId: data.meetingId,
        candidateSpeakerIds: data.speakerIds
      });

      // 转发识别事件到客户端
      const forwardEvent = (event: string) => {
        manager.on(event, (sid, ...args) => {
          if (sid === sessionId) {
            socket.emit(event, ...args);
          }
        });
      };

      forwardEvent('transcript');
      forwardEvent('speaker_identified');
      forwardEvent('speaker_unknown');
      forwardEvent('error');
      forwardEvent('status');

      socket.emit('recording-started', { sessionId });
      console.log(`✅ 开始录音: ${sessionId}`);

    } catch (error) {
      socket.emit('error', { message: '启动录音失败', error });
    }
  });

  // 接收音频数据
  socket.on('audio-data', async (audioData: Buffer) => {
    if (!sessionId) {
      return;
    }

    try {
      await manager.sendAudio(sessionId, audioData);
    } catch (error) {
      socket.emit('error', { message: '处理音频失败', error });
    }
  });

  // 停止录音
  socket.on('stop-recording', async () => {
    if (!sessionId) {
      return;
    }

    try {
      await manager.destroySession(sessionId);
      socket.emit('recording-stopped');
      console.log(`✅ 停止录音: ${sessionId}`);
      sessionId = null;

    } catch (error) {
      socket.emit('error', { message: '停止录音失败', error });
    }
  });

  // 断开连接
  socket.on('disconnect', async () => {
    if (sessionId) {
      await manager.destroySession(sessionId);
    }
    console.log(`🔌 客户端断开: ${socket.id}`);
  });
});
```

## 🎯 使用场景

### 场景1: 会议实时转录 + 说话人识别

```typescript
// 1. 准备说话人列表
const speakers = await prisma.speaker.findMany({
  where: { profileStatus: 'ENROLLED' }
});

const speakerIds = speakers.map(s => s.id);

// 2. 创建会话
const sessionId = await manager.createSession({
  meetingId: meeting.id,
  candidateSpeakerIds: speakerIds,
  engineConfig: {
    identificationThreshold: 0.80  // 提高阈值确保准确性
  }
});

// 3. 监听结果并保存到数据库
manager.on('transcript', async (sid, segment) => {
  if (sid !== sessionId) return;

  await prisma.transcriptMessage.create({
    data: {
      meetingId: meeting.id,
      speakerId: segment.speakerId,
      speakerLabel: segment.speakerName || 'Unknown',
      content: segment.text,
      timestamp: new Date(),
      confidence: segment.confidence
    }
  });
});
```

### 场景2: 纯说话人分离（无声纹库）

```typescript
// 不提供candidateSpeakerIds，引擎将执行纯说话人分离
const sessionId = await manager.createSession({
  meetingId: meeting.id,
  // 不设置candidateSpeakerIds
  engineConfig: {
    minSpeechDuration: 0.5  // 降低最小语音时长
  }
});

// 引擎会检测到说话人，但只会返回speaker_unknown事件
manager.on('speaker_unknown', (sid, embeddingId) => {
  console.log(`检测到说话人: ${embeddingId}`);
  // 可以提示用户注册这个说话人
});
```

### 场景3: 音频文件批量处理

```typescript
import { RealtimeVoiceprintEngine } from '@/services/voiceprint/RealtimeVoiceprintEngine';
import { AudioProcessor } from '@/services/audio/AudioProcessor';
import fs from 'fs/promises';

async function processAudioFile(audioPath: string, meetingId: string) {
  const audioProcessor = new AudioProcessor();
  const engine = new RealtimeVoiceprintEngine(
    transcriptionProvider,
    voiceprintProvider
  );

  // 转换为标准格式
  const processedPath = await audioProcessor.convertToStandardWav(audioPath);

  // 读取音频
  const audioData = await fs.readFile(processedPath);

  // 分块处理（每次3秒）
  const chunkSize = 16000 * 2 * 3; // 16kHz, 16位, 3秒
  let offset = 0;

  await engine.start(meetingId);

  while (offset < audioData.length) {
    const chunk = audioData.slice(offset, offset + chunkSize);
    await engine.sendAudio(chunk);
    offset += chunkSize;

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  await engine.stop();
  await engine.cleanup();
}
```

## 🎛️ 配置参数说明

### RealtimeEngineConfig

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `sampleRate` | number | 16000 | 音频采样率（Hz） |
| `channels` | number | 1 | 声道数（1=单声道，2=立体声） |
| `bufferDuration` | number | 3 | 音频缓冲时长（秒） |
| `processingInterval` | number | 1000 | 处理间隔（毫秒） |
| `identificationThreshold` | number | 0.75 | 声纹匹配阈值（0-1） |
| `minSpeechDuration` | number | 1.0 | 最小有效语音时长（秒） |
| `enableSpeakerEnrollment` | boolean | false | 是否自动注册新说话人 |
| `candidateSpeakerIds` | string[] | undefined | 候选说话人ID列表 |

### ManagerConfig

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `maxConcurrentSessions` | number | - | 最大并发会话数 |
| `sessionTimeout` | number | - | 会话超时时间（毫秒） |
| `cleanupInterval` | number | - | 清理检查间隔（毫秒） |

## 📊 性能优化建议

### 1. 缓冲区配置

```typescript
// 高性能服务器：减小缓冲时间，提高实时性
engineConfig: {
  bufferDuration: 2,         // 2秒缓冲
  processingInterval: 500    // 0.5秒处理一次
}

// 资源受限环境：增大缓冲时间，减少处理频率
engineConfig: {
  bufferDuration: 5,         // 5秒缓冲
  processingInterval: 2000   // 2秒处理一次
}
```

### 2. 并发控制

```typescript
// 根据服务器资源调整并发数
const manager = getVoiceprintEngineManager({
  maxConcurrentSessions: process.env.NODE_ENV === 'production' ? 20 : 5
});
```

### 3. GPU加速

```bash
# 确保使用GPU版本的pyannote.audio
PYANNOTE_DEVICE=cuda

# 检查CUDA是否可用
python -c "import torch; print(torch.cuda.is_available())"
```

## 🐛 故障排查

### 问题1: 识别不到说话人

**可能原因**:
- 声纹库中没有注册说话人
- 识别阈值设置过高
- 音频质量差

**解决方案**:
```typescript
// 降低识别阈值
engineConfig: {
  identificationThreshold: 0.65  // 从0.75降低到0.65
}

// 确保说话人已注册
const speakers = await prisma.speaker.findMany({
  where: {
    id: { in: candidateSpeakerIds },
    profileStatus: 'ENROLLED'  // 必须是已注册状态
  }
});
```

### 问题2: 转录延迟高

**可能原因**:
- 网络延迟（讯飞API）
- 缓冲区设置过大
- 服务器资源不足

**解决方案**:
```typescript
// 减小缓冲时间
engineConfig: {
  bufferDuration: 1.5,       // 减小到1.5秒
  processingInterval: 500    // 提高处理频率
}
```

### 问题3: 内存占用过高

**可能原因**:
- 并发会话过多
- 音频缓冲区未及时清理
- 临时文件未清理

**解决方案**:
```typescript
// 限制并发数
const manager = getVoiceprintEngineManager({
  maxConcurrentSessions: 5,      // 减少并发
  sessionTimeout: 1800000,       // 30分钟超时
  cleanupInterval: 30000         // 30秒清理一次
});

// 定期清理音频处理器临时文件
const audioProcessor = new AudioProcessor();
await audioProcessor.cleanTemp(3600000); // 清理1小时前的文件
```

## 📈 监控和日志

### 获取统计信息

```typescript
const stats = manager.getStats();
console.log('系统状态:', {
  总会话数: stats.totalSessions,
  活跃会话: stats.activeSessions,
  暂停会话: stats.pausedSessions,
  错误会话: stats.errorSessions,
  最大并发: stats.maxConcurrentSessions
});

// 查看每个会话详情
stats.sessions.forEach(session => {
  console.log(`会话 ${session.sessionId}:`, {
    会议ID: session.meetingId,
    状态: session.status,
    运行时长: `${(session.uptime / 1000).toFixed(1)}s`,
    最后活动: session.lastActivityAt
  });
});
```

### 性能监控

```typescript
// 监控识别性能
let transcriptCount = 0;
let identificationCount = 0;

manager.on('transcript', () => transcriptCount++);
manager.on('speaker_identified', () => identificationCount++);

setInterval(() => {
  console.log('性能指标:', {
    转录数: transcriptCount,
    识别数: identificationCount,
    识别率: `${(identificationCount / transcriptCount * 100).toFixed(1)}%`
  });
}, 60000); // 每分钟输出
```

## 🔗 相关文档

- [讯飞语音API文档](../providers/transcription/README.md)
- [pyannote.audio配置指南](../../../python/README.md)
- [音频处理工具](../audio/README.md)
- [数据库Schema](../../../prisma/schema.prisma)

## 💡 最佳实践

1. **预加载声纹库**: 在创建会话前，确保候选说话人的声纹数据已加载
2. **合理设置阈值**: 根据实际场景调整识别阈值，平衡准确率和召回率
3. **音频预处理**: 使用AudioProcessor对音频进行降噪和标准化
4. **错误处理**: 始终监听error事件并妥善处理
5. **资源清理**: 会话结束后及时销毁，避免内存泄漏
6. **日志记录**: 记录关键事件和性能指标，便于问题排查

---

**🎉 实时声纹识别引擎是本系统的核心亮点！**

如有问题，请查看主项目文档或提交Issue。
