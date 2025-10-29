# 服务提供商支持方案

## 📋 支持的服务提供商

### 🎤 语音转录服务

| 提供商 | 优势 | 定价 | 推荐指数 |
|--------|------|------|---------|
| **讯飞语音** | ✅ 中文准确率最高<br>✅ 国内服务速度快<br>✅ 价格便宜 | ¥0.0025/次<br>新用户500小时免费 | ⭐⭐⭐⭐⭐ |
| **腾讯云** | ✅ 中文效果好<br>✅ 性价比高<br>✅ 稳定可靠 | ¥0.24/分钟<br>每月15小时免费 | ⭐⭐⭐⭐⭐ |
| **阿里云** | ✅ 功能全面<br>✅ 生态完善 | ¥0.25/分钟<br>新用户试用 | ⭐⭐⭐⭐ |
| **Azure** | ✅ 国际标准<br>✅ 多语言支持 | ¥7/小时<br>每月5小时免费 | ⭐⭐⭐ |
| **AssemblyAI** | ✅ API简单<br>✅ 英文准确 | $0.00025/秒 | ⭐⭐⭐ |
| **OpenAI Whisper** | ✅ 开源免费<br>✅ 本地部署 | 免费（需GPU） | ⭐⭐⭐⭐ |

### 👤 声纹识别服务

| 提供商 | 优势 | 定价 | 推荐指数 |
|--------|------|------|---------|
| **讯飞声纹** | ✅ 中文优化<br>✅ 识别准确 | 按调用次数 | ⭐⭐⭐⭐⭐ |
| **腾讯云** | ✅ 性价比高<br>✅ 易集成 | 按调用次数 | ⭐⭐⭐⭐ |
| **阿里云** | ✅ 稳定可靠 | 按调用次数 | ⭐⭐⭐⭐ |
| **Azure** | ✅ 功能强大 | ¥35/小时 | ⭐⭐⭐ |
| **pyannote.audio** | ✅ 开源免费<br>✅ 本地部署 | 免费（需GPU） | ⭐⭐⭐⭐ |

## 🎯 推荐配置

### 方案A：纯国产（推荐）⭐⭐⭐⭐⭐
```
转录：讯飞语音
声纹：讯飞声纹
AI：DeepSeek
费用：¥50-100/月
```

### 方案B：腾讯云生态
```
转录：腾讯云语音识别
声纹：腾讯云声纹识别
AI：DeepSeek
费用：¥50-150/月
```

### 方案C：开源方案
```
转录：OpenAI Whisper（本地）
声纹：pyannote.audio（本地）
AI：DeepSeek
费用：¥20-50/月（仅AI）
```

### 方案D：Azure国际方案
```
转录：Azure Speech
声纹：Azure Speaker Recognition
AI：DeepSeek
费用：¥300-500/月
```

## 📊 详细对比

### 讯飞语音 (iFlytek)

**转录服务**：
- API文档：https://www.xfyun.cn/doc/asr/voicedictation/API.html
- 实时转录：WebSocket
- 批量转录：HTTP API
- 中文准确率：95%+
- 响应速度：<100ms
- 免费额度：新用户500小时

**声纹识别**：
- API文档：https://www.xfyun.cn/doc/voiceprint/introduction.html
- 1:1声纹验证
- 1:N声纹识别
- 训练要求：3段音频，每段3-10秒

### 腾讯云语音 (Tencent Cloud)

**转录服务**：
- API文档：https://cloud.tencent.com/document/product/1093
- 实时转录：WebSocket
- 录音文件识别：HTTP API
- 支持热词、词汇表
- 免费额度：每月15小时

**声纹识别**：
- API文档：https://cloud.tencent.com/document/product/1441
- 声纹注册
- 声纹验证
- 声纹识别

### 阿里云语音 (Alibaba Cloud)

**转录服务**：
- API文档：https://help.aliyun.com/product/30413.html
- 实时识别
- 录音文件识别
- 支持热词、个性化定制

**声纹识别**：
- API文档：https://help.aliyun.com/document_detail/141763.html
- 声纹库管理
- 声纹比对

### OpenAI Whisper (开源)

**转录服务**：
- GitHub：https://github.com/openai/whisper
- 支持多语言
- 本地运行，无API限制
- 需要GPU加速
- 模型大小：tiny(39M) → large(1550M)

### pyannote.audio (开源)

**声纹识别**：
- GitHub：https://github.com/pyannote/pyannote-audio
- 说话人分离
- 声纹识别
- 本地运行，完全免费
- 需要GPU加速

## 🔧 技术实现

### 统一接口设计

```typescript
// 转录服务统一接口
interface ITranscriptionProvider {
  name: string;

  // 实时转录
  startRealtime(config: RealtimeConfig): Promise<void>;
  stopRealtime(): Promise<void>;

  // 批量转录
  transcribeFile(audioFile: Buffer, options: TranscriptionOptions): Promise<TranscriptResult>;

  // 获取转录状态
  getStatus(taskId: string): Promise<TranscriptionStatus>;
}

// 声纹识别服务统一接口
interface IVoiceprintProvider {
  name: string;

  // 创建声纹
  createProfile(userId: string): Promise<VoiceprintProfile>;

  // 训练声纹
  enrollProfile(profileId: string, audioData: Buffer): Promise<EnrollmentResult>;

  // 删除声纹
  deleteProfile(profileId: string): Promise<void>;

  // 1:N识别（从多个声纹中识别）
  identifySpeaker(audioData: Buffer, profileIds: string[]): Promise<IdentificationResult>;

  // 1:1验证（验证是否为某人）
  verifySpeaker(profileId: string, audioData: Buffer): Promise<VerificationResult>;
}
```

## 💰 成本对比

### 月使用量：100小时录音

| 提供商 | 转录成本 | 声纹成本 | 总成本 |
|--------|---------|---------|--------|
| 讯飞 | ¥15 | ¥30 | **¥45** |
| 腾讯云 | ¥1440 | ¥50 | **¥1490** |
| 阿里云 | ¥1500 | ¥50 | **¥1550** |
| Azure | ¥4200 | ¥2100 | **¥6300** |
| Whisper | ¥0 | ¥0 | **¥0**（需GPU服务器） |

**推荐**：
- 小规模使用：讯飞（性价比最高）
- 中大规模：自建Whisper（长期更省）
- 企业级：腾讯云/阿里云（稳定可靠）

## 🚀 接入优先级

### Phase 1：核心功能（1周）
- [x] 讯飞语音转录
- [x] 讯飞声纹识别
- [x] DeepSeek AI

### Phase 2：扩展支持（1周）
- [ ] 腾讯云语音
- [ ] 腾讯云声纹
- [ ] Azure Speech

### Phase 3：开源方案（1周）
- [ ] OpenAI Whisper本地部署
- [ ] pyannote.audio声纹
- [ ] 模型管理服务

### Phase 4：高级功能（1周）
- [ ] 混合模式（多provider轮询）
- [ ] 智能切换（根据准确率自动选择）
- [ ] 成本优化（根据价格自动选择）

## 📝 配置示例

```typescript
// config/providers.ts

export const providerConfig = {
  transcription: {
    default: 'iflytek',  // 默认使用讯飞
    providers: {
      iflytek: {
        appId: process.env.IFLYTEK_APP_ID,
        apiKey: process.env.IFLYTEK_API_KEY,
        apiSecret: process.env.IFLYTEK_API_SECRET,
        enabled: true
      },
      tencent: {
        secretId: process.env.TENCENT_SECRET_ID,
        secretKey: process.env.TENCENT_SECRET_KEY,
        enabled: false
      },
      azure: {
        key: process.env.AZURE_SPEECH_KEY,
        region: process.env.AZURE_SPEECH_REGION,
        enabled: false
      },
      whisper: {
        modelPath: './models/whisper-large',
        device: 'cuda',  // 或 'cpu'
        enabled: false
      }
    }
  },

  voiceprint: {
    default: 'iflytek',
    providers: {
      iflytek: {
        appId: process.env.IFLYTEK_APP_ID,
        apiKey: process.env.IFLYTEK_API_KEY,
        enabled: true
      },
      tencent: {
        secretId: process.env.TENCENT_SECRET_ID,
        secretKey: process.env.TENCENT_SECRET_KEY,
        enabled: false
      },
      pyannote: {
        modelPath: './models/pyannote',
        device: 'cuda',
        enabled: false
      }
    }
  }
};
```

## 🎓 申请指南

### 讯飞语音
1. 注册：https://www.xfyun.cn/
2. 实名认证
3. 创建应用
4. 获取AppID、APIKey、APISecret
5. 新用户赠送500小时

### 腾讯云
1. 注册：https://cloud.tencent.com/
2. 实名认证
3. 开通语音识别服务
4. 获取SecretId、SecretKey
5. 每月15小时免费额度

### 阿里云
1. 注册：https://www.aliyun.com/
2. 实名认证
3. 开通智能语音服务
4. 获取AccessKey
5. 新用户有试用额度
