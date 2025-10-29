/**
 * 会议纪要生成器
 *
 * 功能：
 * 1. 协调整个会议纪要生成流程
 * 2. 从数据库获取会议数据
 * 3. 调用DeepSeek生成纪要
 * 4. 保存结果到数据库
 * 5. 支持进度回调和错误处理
 */

import { PrismaClient, Meeting, TranscriptMessage, Summary } from '@prisma/client';
import { DeepSeekService, MeetingSummary, ActionItem } from './DeepSeekService';
import { EventEmitter } from 'events';

// ============= 类型定义 =============

export interface GenerationOptions {
  meetingId: string;                    // 会议ID
  language?: 'zh' | 'en';              // 输出语言
  style?: 'formal' | 'casual';         // 输出风格
  includeActionItems?: boolean;         // 是否提取行动项
  includeSummary?: boolean;             // 是否生成摘要
  includeKeyPoints?: boolean;           // 是否提取关键点
  saveToDatabase?: boolean;             // 是否保存到数据库
}

export interface GenerationProgress {
  stage: GenerationStage;
  progress: number;                     // 0-100
  message: string;
}

export enum GenerationStage {
  INIT = 'init',                        // 初始化
  LOADING_DATA = 'loading_data',        // 加载数据
  PROCESSING_TRANSCRIPT = 'processing_transcript', // 处理转录
  GENERATING_SUMMARY = 'generating_summary',       // 生成摘要
  EXTRACTING_ACTIONS = 'extracting_actions',       // 提取行动项
  SAVING_RESULTS = 'saving_results',               // 保存结果
  COMPLETED = 'completed',                         // 完成
  ERROR = 'error'                                  // 错误
}

export interface GenerationResult {
  meetingId: string;
  summary: MeetingSummary;
  summaryId?: string;                   // 数据库中的纪要ID
  actionItemIds?: string[];             // 数据库中的行动项IDs
  duration: number;                     // 生成耗时（毫秒）
}

// ============= 会议纪要生成器 =============

export class MeetingSummaryGenerator extends EventEmitter {
  private prisma: PrismaClient;
  private deepseek: DeepSeekService;

  constructor(deepseek: DeepSeekService) {
    super();
    this.prisma = new PrismaClient();
    this.deepseek = deepseek;
  }

  // ============= 公共API =============

  /**
   * 生成会议纪要
   */
  async generate(options: GenerationOptions): Promise<GenerationResult> {
    const startTime = Date.now();
    const {
      meetingId,
      language = 'zh',
      style = 'formal',
      includeActionItems = true,
      includeSummary = true,
      includeKeyPoints = true,
      saveToDatabase = true
    } = options;

    try {
      // 1. 初始化
      this.emitProgress(GenerationStage.INIT, 0, '开始生成会议纪要');

      // 2. 加载会议数据
      this.emitProgress(GenerationStage.LOADING_DATA, 10, '加载会议数据');
      const meetingData = await this.loadMeetingData(meetingId);

      if (!meetingData.transcript || meetingData.transcript.length === 0) {
        throw new Error('会议转录为空，无法生成纪要');
      }

      // 3. 处理转录文本
      this.emitProgress(GenerationStage.PROCESSING_TRANSCRIPT, 20, '处理转录文本');
      const formattedTranscript = this.formatTranscript(meetingData.messages);

      // 4. 生成会议纪要
      this.emitProgress(GenerationStage.GENERATING_SUMMARY, 30, '正在生成会议纪要');

      const summary = await this.deepseek.generateMeetingSummary({
        transcript: formattedTranscript,
        meetingTitle: meetingData.meeting.title,
        attendees: meetingData.attendees,
        duration: this.calculateDuration(meetingData.meeting),
        language,
        style,
        includeActionItems,
        includeSummary,
        includeKeyPoints
      });

      this.emitProgress(GenerationStage.GENERATING_SUMMARY, 60, '纪要生成完成');

      // 5. 提取行动项（如果需要且纪要中没有）
      if (includeActionItems && summary.actionItems.length === 0) {
        this.emitProgress(GenerationStage.EXTRACTING_ACTIONS, 70, '提取行动项');

        const actionItems = await this.deepseek.extractActionItems(formattedTranscript);
        summary.actionItems = actionItems;

        this.emitProgress(GenerationStage.EXTRACTING_ACTIONS, 80, '行动项提取完成');
      }

      let summaryId: string | undefined;
      let actionItemIds: string[] | undefined;

      // 6. 保存到数据库
      if (saveToDatabase) {
        this.emitProgress(GenerationStage.SAVING_RESULTS, 85, '保存到数据库');

        const saved = await this.saveSummary(meetingId, summary);
        summaryId = saved.summaryId;
        actionItemIds = saved.actionItemIds;

        this.emitProgress(GenerationStage.SAVING_RESULTS, 95, '保存完成');
      }

      // 7. 完成
      const duration = Date.now() - startTime;
      this.emitProgress(GenerationStage.COMPLETED, 100, `生成完成，耗时 ${(duration / 1000).toFixed(1)}秒`);

      const result: GenerationResult = {
        meetingId,
        summary,
        summaryId,
        actionItemIds,
        duration
      };

      this.emit('completed', result);

      return result;

    } catch (error: any) {
      this.emitProgress(GenerationStage.ERROR, 0, `生成失败: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 流式生成会议纪要
   */
  async generateStream(
    options: GenerationOptions,
    onContent: (content: string) => void
  ): Promise<void> {
    const {
      meetingId,
      language = 'zh',
      style = 'formal'
    } = options;

    try {
      // 加载数据
      this.emitProgress(GenerationStage.LOADING_DATA, 10, '加载会议数据');
      const meetingData = await this.loadMeetingData(meetingId);

      if (!meetingData.transcript || meetingData.transcript.length === 0) {
        throw new Error('会议转录为空，无法生成纪要');
      }

      // 格式化转录
      this.emitProgress(GenerationStage.PROCESSING_TRANSCRIPT, 20, '处理转录文本');
      const formattedTranscript = this.formatTranscript(meetingData.messages);

      // 流式生成
      this.emitProgress(GenerationStage.GENERATING_SUMMARY, 30, '正在生成会议纪要');

      let fullContent = '';

      await this.deepseek.generateMeetingSummaryStream({
        transcript: formattedTranscript,
        meetingTitle: meetingData.meeting.title,
        attendees: meetingData.attendees,
        duration: this.calculateDuration(meetingData.meeting),
        language,
        style
      }, (chunk) => {
        if (!chunk.done) {
          fullContent += chunk.content;
          onContent(chunk.content);
        } else {
          this.emitProgress(GenerationStage.COMPLETED, 100, '生成完成');
          this.emit('completed', { content: fullContent });
        }
      });

    } catch (error: any) {
      this.emitProgress(GenerationStage.ERROR, 0, `生成失败: ${error.message}`);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * 重新生成纪要（覆盖已有纪要）
   */
  async regenerate(meetingId: string, options?: Partial<GenerationOptions>): Promise<GenerationResult> {
    // 删除旧纪要
    await this.prisma.summary.deleteMany({
      where: { meetingId }
    });

    // 生成新纪要
    return this.generate({
      meetingId,
      ...options
    });
  }

  // ============= 数据处理 =============

  /**
   * 加载会议数据
   */
  private async loadMeetingData(meetingId: string): Promise<{
    meeting: Meeting;
    messages: TranscriptMessage[];
    attendees: string[];
    transcript: string;
  }> {
    // 加载会议信息
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      include: {
        attendees: {
          include: {
            speaker: true
          }
        }
      }
    });

    if (!meeting) {
      throw new Error(`会议不存在: ${meetingId}`);
    }

    // 加载转录消息
    const messages = await this.prisma.transcriptMessage.findMany({
      where: { meetingId },
      orderBy: { timestamp: 'asc' },
      include: {
        speaker: true
      }
    });

    // 提取参会人员名单
    const attendees = meeting.attendees
      .map(a => a.speaker?.name)
      .filter((name): name is string => !!name);

    // 生成完整转录文本
    const transcript = messages
      .map(m => `${m.speakerLabel}: ${m.content}`)
      .join('\n');

    return {
      meeting,
      messages,
      attendees,
      transcript
    };
  }

  /**
   * 格式化转录文本
   */
  private formatTranscript(messages: (TranscriptMessage & { speaker: any })[]) {
    // 按时间分组，合并同一说话人的连续消息
    const grouped: Array<{
      speaker: string;
      content: string;
      time: string;
    }> = [];

    let currentSpeaker: string | null = null;
    let currentContent: string[] = [];

    for (const msg of messages) {
      const speaker = msg.speakerLabel || 'Unknown';
      const time = new Date(msg.timestamp).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit'
      });

      if (speaker !== currentSpeaker) {
        // 新说话人，保存上一段
        if (currentSpeaker && currentContent.length > 0) {
          grouped.push({
            speaker: currentSpeaker,
            content: currentContent.join(' '),
            time: time
          });
        }

        currentSpeaker = speaker;
        currentContent = [msg.content];
      } else {
        // 同一说话人，合并内容
        currentContent.push(msg.content);
      }
    }

    // 保存最后一段
    if (currentSpeaker && currentContent.length > 0) {
      grouped.push({
        speaker: currentSpeaker,
        content: currentContent.join(' '),
        time: new Date(messages[messages.length - 1].timestamp).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit'
        })
      });
    }

    // 格式化输出
    return grouped
      .map(item => `[${item.time}] ${item.speaker}:\n${item.content}`)
      .join('\n\n');
  }

  /**
   * 计算会议时长
   */
  private calculateDuration(meeting: Meeting): number | undefined {
    if (meeting.startTime && meeting.endTime) {
      const duration = meeting.endTime.getTime() - meeting.startTime.getTime();
      return Math.round(duration / 60000); // 转换为分钟
    }
    return undefined;
  }

  // ============= 数据库操作 =============

  /**
   * 保存会议纪要到数据库
   */
  private async saveSummary(
    meetingId: string,
    summary: MeetingSummary
  ): Promise<{ summaryId: string; actionItemIds: string[] }> {
    // 1. 保存纪要主体
    const summaryRecord = await this.prisma.summary.create({
      data: {
        meetingId,
        title: summary.title,
        content: this.formatSummaryForStorage(summary),
        generatedAt: new Date(),
        aiProvider: 'deepseek'
      }
    });

    // 2. 保存行动项
    const actionItemIds: string[] = [];

    for (const actionItem of summary.actionItems) {
      // 查找负责人
      let assigneeId: string | undefined;
      if (actionItem.assignee) {
        const speaker = await this.prisma.speaker.findFirst({
          where: { name: actionItem.assignee }
        });
        assigneeId = speaker?.id;
      }

      // 解析截止日期
      let deadline: Date | undefined;
      if (actionItem.deadline) {
        try {
          deadline = new Date(actionItem.deadline);
        } catch (error) {
          console.error('解析截止日期失败:', actionItem.deadline);
        }
      }

      // 创建行动项
      // 注意：这里假设数据库有ActionItem表，如果没有需要添加到schema
      // 暂时跳过，因为当前schema没有ActionItem表
      // 可以将行动项存储在summary的JSON字段中
    }

    return {
      summaryId: summaryRecord.id,
      actionItemIds
    };
  }

  /**
   * 格式化纪要用于存储
   */
  private formatSummaryForStorage(summary: MeetingSummary): string {
    let content = '';

    content += `# ${summary.title}\n\n`;
    content += `**日期**: ${summary.date}\n`;
    content += `**参会人员**: ${summary.attendees.join('、')}\n`;
    if (summary.duration) {
      content += `**时长**: ${summary.duration}\n`;
    }
    content += `\n---\n\n`;

    // 摘要
    if (summary.summary) {
      content += `## 会议摘要\n\n${summary.summary}\n\n`;
    }

    // 关键点
    if (summary.keyPoints.length > 0) {
      content += `## 关键讨论点\n\n`;
      summary.keyPoints.forEach((point, i) => {
        content += `${i + 1}. ${point}\n`;
      });
      content += `\n`;
    }

    // 决策
    if (summary.decisions.length > 0) {
      content += `## 决策事项\n\n`;
      summary.decisions.forEach((decision, i) => {
        content += `${i + 1}. ${decision}\n`;
      });
      content += `\n`;
    }

    // 行动项
    if (summary.actionItems.length > 0) {
      content += `## 行动项\n\n`;
      summary.actionItems.forEach((item, i) => {
        content += `${i + 1}. **${item.task}**\n`;
        if (item.assignee) content += `   - 负责人: ${item.assignee}\n`;
        if (item.deadline) content += `   - 截止日期: ${item.deadline}\n`;
        if (item.priority) content += `   - 优先级: ${item.priority}\n`;
        content += `\n`;
      });
    }

    // 下一步
    if (summary.nextSteps.length > 0) {
      content += `## 下一步计划\n\n`;
      summary.nextSteps.forEach((step, i) => {
        content += `${i + 1}. ${step}\n`;
      });
      content += `\n`;
    }

    return content;
  }

  // ============= 辅助方法 =============

  /**
   * 发送进度事件
   */
  private emitProgress(stage: GenerationStage, progress: number, message: string): void {
    const progressData: GenerationProgress = {
      stage,
      progress,
      message
    };

    console.log(`📊 [${stage}] ${progress}% - ${message}`);
    this.emit('progress', progressData);
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

export default MeetingSummaryGenerator;
