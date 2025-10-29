# DeepSeek AI 服务使用指南

## 📋 概述

DeepSeek AI 服务提供智能会议分析功能：

1. **会议纪要自动生成** - 从转录生成结构化纪要
2. **行动项智能提取** - 自动识别任务、负责人、截止日期
3. **会议优化建议** - 分析会议效率并提供改进建议
4. **智能问答** - 基于会议内容回答问题
5. **流式输出** - 支持实时流式生成

## 🏗️ 架构

```
┌─────────────────────────────────────────────┐
│      MeetingSummaryGenerator                │
│      (协调整个生成流程)                        │
└──────────────┬──────────────────────────────┘
               │
               ├─→ 加载会议数据 (Prisma)
               ├─→ 格式化转录文本
               ├─→ 调用 DeepSeekService
               ├─→ 提取行动项
               └─→ 保存到数据库

┌──────────────▼──────────────────────────────┐
│      DeepSeekService                        │
│      (DeepSeek API 封装)                    │
└─────────────────────────────────────────────┘
               │
               ├─→ chatCompletion (非流式)
               ├─→ chatCompletionStream (流式)
               ├─→ generateMeetingSummary
               ├─→ extractActionItems
               ├─→ getOptimizationSuggestions
               └─→ answerQuestion
```

## 🚀 快速开始

### 1. 配置环境变量

```env
# .env
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1  # 可选
DEEPSEEK_MODEL=deepseek-chat                    # 可选
```

### 2. 初始化服务

```typescript
import { DeepSeekService } from '@/services/ai/DeepSeekService';
import { MeetingSummaryGenerator } from '@/services/ai/MeetingSummaryGenerator';

// 初始化 DeepSeek 服务
const deepseek = new DeepSeekService({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  model: 'deepseek-chat',
  temperature: 0.7,
  maxTokens: 4000
});

// 初始化纪要生成器
const generator = new MeetingSummaryGenerator(deepseek);
```

### 3. 生成会议纪要

```typescript
// 方式1: 一次性生成
const result = await generator.generate({
  meetingId: 'meeting_123',
  language: 'zh',
  style: 'formal',
  includeActionItems: true,
  includeSummary: true,
  includeKeyPoints: true,
  saveToDatabase: true
});

console.log('会议纪要:', result.summary);
console.log('耗时:', result.duration, 'ms');

// 方式2: 流式生成（实时显示）
await generator.generateStream(
  {
    meetingId: 'meeting_123',
    language: 'zh',
    style: 'formal'
  },
  (content) => {
    // 实时接收生成的内容
    process.stdout.write(content);
  }
);
```

### 4. 监听进度事件

```typescript
generator.on('progress', (progress) => {
  console.log(`[${progress.stage}] ${progress.progress}% - ${progress.message}`);
});

generator.on('completed', (result) => {
  console.log('✅ 生成完成:', result);
});

generator.on('error', (error) => {
  console.error('❌ 生成失败:', error);
});
```

## 📖 详细用法

### 1. 基础聊天API

```typescript
// 非流式聊天
const response = await deepseek.chatCompletion({
  messages: [
    { role: 'system', content: '你是一个专业助手' },
    { role: 'user', content: '请总结这段会议内容...' }
  ],
  temperature: 0.7,
  maxTokens: 2000
});

console.log(response.choices[0].message.content);
console.log('Token使用:', response.usage);

// 流式聊天
await deepseek.chatCompletionStream(
  {
    messages: [
      { role: 'user', content: '生成会议纪要...' }
    ]
  },
  (chunk) => {
    if (!chunk.done) {
      process.stdout.write(chunk.content);
    } else {
      console.log('\n✅ 完成');
    }
  }
);
```

### 2. 生成会议纪要

```typescript
const summary = await deepseek.generateMeetingSummary({
  transcript: `
    [09:00] 张三: 大家早上好，今天我们讨论新产品的发布计划。
    [09:02] 李四: 我们计划在下个月15号发布。
    [09:05] 王五: 需要提前准备营销材料。
    ...
  `,
  meetingTitle: '产品发布计划会议',
  attendees: ['张三', '李四', '王五'],
  duration: 30,
  language: 'zh',
  style: 'formal',
  includeActionItems: true,
  includeSummary: true,
  includeKeyPoints: true
});

console.log('会议标题:', summary.title);
console.log('会议摘要:', summary.summary);
console.log('关键讨论点:', summary.keyPoints);
console.log('行动项:', summary.actionItems);
console.log('决策事项:', summary.decisions);
```

### 3. 提取行动项

```typescript
const actionItems = await deepseek.extractActionItems(`
  会议转录内容...
  李四：我负责准备产品文档，下周五前完成。
  王五：我联系营销团队，本周内发出邀请。
  ...
`);

actionItems.forEach((item, i) => {
  console.log(`${i + 1}. ${item.task}`);
  console.log(`   负责人: ${item.assignee || '未指定'}`);
  console.log(`   截止日期: ${item.deadline || '未指定'}`);
  console.log(`   优先级: ${item.priority || 'medium'}`);
});
```

### 4. 获取优化建议

```typescript
const suggestions = await deepseek.getOptimizationSuggestions(
  `会议纪要内容...`
);

suggestions.forEach((suggestion) => {
  console.log(`\n📌 ${suggestion.category}`);
  console.log(`建议: ${suggestion.suggestion}`);
  console.log(`原因: ${suggestion.reasoning}`);
  console.log(`优先级: ${suggestion.priority}`);
});
```

### 5. 智能问答

```typescript
const answer = await deepseek.answerQuestion(
  '产品发布的具体日期是什么时候？',
  `会议内容：\n[会议转录或纪要]...`
);

console.log('回答:', answer);
```

## 🎯 实际应用场景

### 场景1: 会议结束后自动生成纪要

```typescript
// 在会议结束的API中调用
app.post('/api/meetings/:id/finish', async (req, res) => {
  const { id } = req.params;

  try {
    // 1. 更新会议状态
    await prisma.meeting.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        endTime: new Date()
      }
    });

    // 2. 异步生成纪要（不阻塞响应）
    generator.generate({
      meetingId: id,
      saveToDatabase: true
    }).catch(error => {
      console.error('生成纪要失败:', error);
    });

    res.json({ message: '会议已结束，正在生成纪要' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 场景2: WebSocket实时流式生成

```typescript
import { Server } from 'socket.io';

io.on('connection', (socket) => {
  socket.on('generate-summary', async (data: { meetingId: string }) => {
    try {
      // 发送开始事件
      socket.emit('summary-start');

      // 流式生成
      await generator.generateStream(
        {
          meetingId: data.meetingId,
          language: 'zh',
          style: 'formal'
        },
        (content) => {
          // 实时推送内容到客户端
          socket.emit('summary-chunk', { content });
        }
      );

      // 发送完成事件
      socket.emit('summary-complete');

    } catch (error) {
      socket.emit('summary-error', { error: error.message });
    }
  });
});
```

### 场景3: 定时任务批量生成

```typescript
import cron from 'node-cron';

// 每天凌晨2点，为所有未生成纪要的已结束会议生成纪要
cron.schedule('0 2 * * *', async () => {
  console.log('🕐 开始批量生成会议纪要...');

  // 查找需要生成纪要的会议
  const meetings = await prisma.meeting.findMany({
    where: {
      status: 'COMPLETED',
      summaries: {
        none: {}  // 没有纪要
      }
    }
  });

  console.log(`找到 ${meetings.length} 个待处理会议`);

  // 逐个生成
  for (const meeting of meetings) {
    try {
      console.log(`生成纪要: ${meeting.title}`);
      await generator.generate({
        meetingId: meeting.id,
        saveToDatabase: true
      });
      console.log(`✅ 完成: ${meeting.title}`);

    } catch (error) {
      console.error(`❌ 失败: ${meeting.title}`, error);
    }

    // 避免API频率限制
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('✅ 批量生成完成');
});
```

### 场景4: 会议质量评估

```typescript
async function evaluateMeeting(meetingId: string) {
  // 1. 生成纪要
  const result = await generator.generate({
    meetingId,
    saveToDatabase: false
  });

  // 2. 获取优化建议
  const suggestions = await deepseek.getOptimizationSuggestions(
    result.summary.summary
  );

  // 3. 计算会议质量分数
  const qualityScore = calculateQualityScore(result.summary, suggestions);

  // 4. 生成评估报告
  const report = {
    meetingId,
    qualityScore,
    strengths: extractStrengths(result.summary),
    weaknesses: suggestions.filter(s => s.priority === 'high'),
    recommendations: suggestions,
    actionItemsCount: result.summary.actionItems.length,
    decisionsCount: result.summary.decisions.length
  };

  return report;
}

function calculateQualityScore(summary: MeetingSummary, suggestions: any[]): number {
  let score = 100;

  // 扣分项
  if (summary.actionItems.length === 0) score -= 20;
  if (summary.decisions.length === 0) score -= 15;
  if (summary.keyPoints.length < 3) score -= 10;

  // 根据建议扣分
  const highPrioritySuggestions = suggestions.filter(s => s.priority === 'high').length;
  score -= highPrioritySuggestions * 5;

  return Math.max(0, Math.min(100, score));
}
```

## ⚙️ 配置参数详解

### DeepSeekConfig

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `apiKey` | string | - | DeepSeek API密钥（必需） |
| `baseURL` | string | `https://api.deepseek.com/v1` | API基础URL |
| `model` | string | `deepseek-chat` | 使用的模型 |
| `temperature` | number | 0.7 | 生成温度（0-2） |
| `maxTokens` | number | 4000 | 最大token数 |
| `timeout` | number | 60000 | 请求超时（毫秒） |

### MeetingSummaryOptions

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `transcript` | string | - | 会议转录文本（必需） |
| `meetingTitle` | string | '会议' | 会议标题 |
| `attendees` | string[] | [] | 参会人员列表 |
| `duration` | number | - | 会议时长（分钟） |
| `language` | 'zh' \| 'en' | 'zh' | 输出语言 |
| `style` | 'formal' \| 'casual' | 'formal' | 输出风格 |
| `includeActionItems` | boolean | true | 是否提取行动项 |
| `includeSummary` | boolean | true | 是否生成摘要 |
| `includeKeyPoints` | boolean | true | 是否提取关键点 |

### GenerationOptions

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `meetingId` | string | - | 会议ID（必需） |
| `language` | 'zh' \| 'en' | 'zh' | 输出语言 |
| `style` | 'formal' \| 'casual' | 'formal' | 输出风格 |
| `includeActionItems` | boolean | true | 是否提取行动项 |
| `includeSummary` | boolean | true | 是否生成摘要 |
| `includeKeyPoints` | boolean | true | 是否提取关键点 |
| `saveToDatabase` | boolean | true | 是否保存到数据库 |

## 📊 性能优化

### 1. 批量处理优化

```typescript
// 使用队列避免并发过多
import Queue from 'bull';

const summaryQueue = new Queue('summary-generation', {
  redis: process.env.REDIS_URL
});

summaryQueue.process(async (job) => {
  const { meetingId } = job.data;

  await generator.generate({
    meetingId,
    saveToDatabase: true
  });
});

// 添加任务到队列
summaryQueue.add({ meetingId: 'meeting_123' }, {
  attempts: 3,
  backoff: 5000
});
```

### 2. 缓存策略

```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async function getCachedSummary(meetingId: string): Promise<MeetingSummary | null> {
  const cached = await redis.get(`summary:${meetingId}`);
  return cached ? JSON.parse(cached) : null;
}

async function cacheSummary(meetingId: string, summary: MeetingSummary): Promise<void> {
  await redis.setex(
    `summary:${meetingId}`,
    86400, // 24小时过期
    JSON.stringify(summary)
  );
}
```

### 3. 错误重试

```typescript
async function generateWithRetry(
  meetingId: string,
  maxRetries: number = 3
): Promise<GenerationResult> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generator.generate({ meetingId });

    } catch (error) {
      console.error(`尝试 ${attempt}/${maxRetries} 失败:`, error);

      if (attempt === maxRetries) {
        throw error;
      }

      // 指数退避
      await new Promise(resolve =>
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }

  throw new Error('生成失败');
}
```

## 🐛 故障排查

### 问题1: API调用失败

**可能原因**:
- API密钥无效
- 网络连接问题
- API配额用尽

**解决方案**:
```typescript
// 检查健康状态
const isHealthy = await deepseek.healthCheck();
if (!isHealthy) {
  console.error('DeepSeek服务不可用');
}

// 检查配置
console.log('API Key:', process.env.DEEPSEEK_API_KEY?.substring(0, 10) + '...');
console.log('Base URL:', process.env.DEEPSEEK_BASE_URL);
```

### 问题2: 生成内容质量差

**可能原因**:
- 转录文本质量差
- 提示词不够清晰
- 温度参数设置不当

**解决方案**:
```typescript
// 调整温度参数
const deepseek = new DeepSeekService({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  temperature: 0.3  // 降低温度提高稳定性
});

// 优化转录文本
const cleanedTranscript = transcript
  .replace(/[嗯啊哦哈]+/g, '')  // 移除语气词
  .replace(/\s+/g, ' ')         // 规范化空白字符
  .trim();
```

### 问题3: 生成速度慢

**可能原因**:
- 转录文本过长
- maxTokens设置过大
- 网络延迟

**解决方案**:
```typescript
// 使用流式生成提升体验
await generator.generateStream(options, (content) => {
  // 实时显示内容，用户感知速度更快
  console.log(content);
});

// 分段处理长文本
if (transcript.length > 10000) {
  // 智能截断或分段处理
  transcript = transcript.substring(0, 10000);
}
```

## 🔗 相关资源

- [DeepSeek API 文档](https://platform.deepseek.com/docs)
- [会议纪要最佳实践](../../../docs/best-practices/meeting-minutes.md)
- [数据库Schema](../../../prisma/schema.prisma)

## 💡 最佳实践

1. **异步处理**: 纪要生成是耗时操作，应使用异步任务或队列
2. **错误处理**: 添加重试机制和降级方案
3. **进度反馈**: 使用事件或WebSocket实时反馈进度
4. **缓存结果**: 缓存已生成的纪要，避免重复生成
5. **质量检查**: 生成后检查关键字段（摘要、行动项）是否完整
6. **用户审核**: 允许用户编辑和完善AI生成的内容

---

**🎉 DeepSeek AI 服务是本系统的智能核心！**

如有问题，请查看主项目文档或提交Issue。
