/**
 * DeepSeek AI 服务
 *
 * 功能：
 * 1. 会议纪要智能生成
 * 2. 会议内容分析和总结
 * 3. 行动项提取
 * 4. 会议质量评估
 * 5. 智能问答和优化建议
 */

import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';

// ============= 类型定义 =============

export interface DeepSeekConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
}

export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: ChatMessage;
    finishReason: string;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export interface MeetingSummaryOptions {
  transcript: string;                  // 会议转录文本
  meetingTitle?: string;               // 会议标题（如果未提供，AI会根据内容生成）
  attendees?: string[];                // 参会人员
  duration?: string;                   // 会议时长（如："30分15秒"）
  meetingDate?: Date | string;         // 🎯 新增：会议日期
  language?: 'zh' | 'en';             // 输出语言
  style?: 'formal' | 'casual';        // 输出风格
  includeActionItems?: boolean;        // 是否提取行动项
  includeSummary?: boolean;            // 是否生成摘要
  includeKeyPoints?: boolean;          // 是否提取关键点
}

export interface MeetingSummary {
  title: string;                       // 会议标题
  date: string;                        // 会议日期
  attendees: string[];                 // 参会人员
  duration?: string;                   // 会议时长
  summary: string;                     // 会议摘要
  keyPoints: string[];                 // 关键讨论点
  actionItems: ActionItem[];           // 行动项
  decisions: string[];                 // 决策事项
  nextSteps: string[];                 // 下一步计划
}

export interface ActionItem {
  task: string;                        // 任务描述
  assignee?: string;                   // 负责人
  deadline?: string;                   // 截止日期
  priority?: 'high' | 'medium' | 'low'; // 优先级
  status?: 'pending' | 'in_progress' | 'completed'; // 状态
}

export interface OptimizationSuggestion {
  category: string;                    // 建议类别
  suggestion: string;                  // 建议内容
  reasoning: string;                   // 原因说明
  priority: 'high' | 'medium' | 'low'; // 优先级
}

// ============= DeepSeek 服务 =============

export class DeepSeekService extends EventEmitter {
  private config: Required<DeepSeekConfig>;
  private client: AxiosInstance;

  constructor(config: DeepSeekConfig) {
    super();

    this.config = {
      apiKey: config.apiKey,
      baseURL: config.baseURL || 'https://api.deepseek.com/v1',
      model: config.model || 'deepseek-chat',
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens || 2000,  // 降低默认token数以加快速度
      timeout: config.timeout || 120000      // 文档解析需要更长时间，设置为120秒
    };

    // 创建Axios客户端
    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // ============= 基础聊天API =============

  /**
   * 聊天补全（非流式）
   */
  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    try {
      const response = await this.client.post('/chat/completions', {
        model: this.config.model,
        messages: options.messages,
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        top_p: options.topP ?? 1,
        frequency_penalty: options.frequencyPenalty ?? 0,
        presence_penalty: options.presencePenalty ?? 0,
        stream: false
      });

      return response.data;

    } catch (error: any) {
      this.handleError('聊天补全失败', error);
      throw error;
    }
  }

  /**
   * 聊天补全（流式）
   */
  async chatCompletionStream(
    options: ChatCompletionOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    try {
      const response = await this.client.post('/chat/completions', {
        model: this.config.model,
        messages: options.messages,
        temperature: options.temperature ?? this.config.temperature,
        max_tokens: options.maxTokens ?? this.config.maxTokens,
        stream: true
      }, {
        responseType: 'stream'
      });

      const stream = response.data;

      stream.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(line => line.trim());

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.substring(6);

            if (jsonStr === '[DONE]') {
              onChunk({ content: '', done: true });
              return;
            }

            try {
              const parsed = JSON.parse(jsonStr);
              const content = parsed.choices?.[0]?.delta?.content || '';

              if (content) {
                onChunk({ content, done: false });
              }

            } catch (error) {
              console.error('解析流式响应失败:', error);
            }
          }
        }
      });

      stream.on('error', (error: Error) => {
        this.handleError('流式响应错误', error);
        throw error;
      });

    } catch (error: any) {
      this.handleError('流式聊天失败', error);
      throw error;
    }
  }

  // ============= 会议纪要生成 =============

  /**
   * 生成会议纪要
   */
  async generateMeetingSummary(options: MeetingSummaryOptions): Promise<MeetingSummary> {
    const {
      transcript,
      meetingTitle,  // 🎯 不再提供默认值，让AI生成
      attendees = [],
      duration,
      meetingDate,  // 🎯 新增会议日期
      language = 'zh',
      style = 'formal',
      includeActionItems = true,
      includeSummary = true,
      includeKeyPoints = true
    } = options;

    try {
      // 构建系统提示词
      const systemPrompt = this.buildSummarySystemPrompt(language, style);

      // 构建用户提示词
      const userPrompt = this.buildSummaryUserPrompt({
        transcript,
        meetingTitle,  // 可能为undefined
        attendees,
        duration,
        meetingDate,  // 🎯 传递会议日期
        includeActionItems,
        includeSummary,
        includeKeyPoints
      });

      // 调用AI生成(优化参数以加快速度)
      const response = await this.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5, // 适中温度,平衡速度和质量
        maxTokens: 2000   // 降低token数量以加快生成速度
      });

      const content = response.choices[0].message.content;

      // 解析结构化结果
      const summary = this.parseMeetingSummary(content, {
        meetingTitle,
        attendees,
        duration,
        meetingDate  // 🎯 传递会议日期用于回退
      });

      return summary;

    } catch (error: any) {
      this.handleError('生成会议纪要失败', error);
      throw error;
    }
  }

  /**
   * 流式生成会议纪要
   */
  async generateMeetingSummaryStream(
    options: MeetingSummaryOptions,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    const {
      transcript,
      meetingTitle = '会议',
      attendees = [],
      duration,
      language = 'zh',
      style = 'formal'
    } = options;

    const systemPrompt = this.buildSummarySystemPrompt(language, style);
    const userPrompt = this.buildSummaryUserPrompt({
      transcript,
      meetingTitle,
      attendees,
      duration
    });

    await this.chatCompletionStream({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      maxTokens: 3000
    }, onChunk);
  }

  // ============= 智能分析 =============

  /**
   * 提取行动项
   */
  async extractActionItems(transcript: string): Promise<ActionItem[]> {
    try {
      const systemPrompt = `你是一个专业的会议分析助手。从会议转录中提取所有行动项（Action Items）。

行动项的特征：
- 明确的任务描述
- 可能有负责人
- 可能有截止日期
- 表示待办事项的动词：需要、应该、计划、安排等

返回JSON格式的数组，每个行动项包含：
- task: 任务描述
- assignee: 负责人（如果提到）
- deadline: 截止日期（如果提到）
- priority: 优先级（high/medium/low）`;

      const response = await this.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `会议转录：\n\n${transcript}\n\n请提取所有行动项。` }
        ],
        temperature: 0.2
      });

      const content = response.choices[0].message.content;
      const actionItems = this.parseActionItems(content);

      return actionItems;

    } catch (error: any) {
      this.handleError('提取行动项失败', error);
      throw error;
    }
  }

  /**
   * 会议优化建议
   */
  async getOptimizationSuggestions(summary: string): Promise<OptimizationSuggestion[]> {
    try {
      const systemPrompt = `你是一个会议效率专家。分析会议纪要并提供优化建议。

关注以下方面：
1. 会议组织和结构
2. 时间管理
3. 讨论深度和广度
4. 决策效率
5. 行动项的清晰度
6. 后续跟进

返回JSON格式的建议数组，每条建议包含：
- category: 建议类别
- suggestion: 具体建议
- reasoning: 原因说明
- priority: 优先级（high/medium/low）`;

      const response = await this.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `会议纪要：\n\n${summary}\n\n请提供优化建议。` }
        ],
        temperature: 0.5
      });

      const content = response.choices[0].message.content;
      const suggestions = this.parseOptimizationSuggestions(content);

      return suggestions;

    } catch (error: any) {
      this.handleError('获取优化建议失败', error);
      throw error;
    }
  }

  /**
   * 智能问答
   */
  async answerQuestion(question: string, context: string): Promise<string> {
    try {
      const systemPrompt = `你是一个专业的会议助手。基于提供的会议内容回答用户问题。

要求：
- 回答要基于会议内容，不要编造信息
- 如果会议内容中没有相关信息，明确说明
- 回答要简洁、准确、专业`;

      const response = await this.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `会议内容：\n\n${context}\n\n用户问题：${question}` }
        ],
        temperature: 0.3
      });

      return response.choices[0].message.content;

    } catch (error: any) {
      this.handleError('智能问答失败', error);
      throw error;
    }
  }

  // ============= 知识库文档解析 =============

  /**
   * 从文档内容中提取专业术语
   * 返回 JSON 格式的术语列表
   */
  async extractTermsFromDocument(documentText: string, category?: string): Promise<Array<{
    term: string;
    definition: string;
    category?: string;
    synonyms?: string[];
  }>> {
    try {
      console.log('[DeepSeek] 开始提取文档术语, 文本长度:', documentText.length);

      const systemPrompt = `你是一个专业的知识提取专家。从提供的文档内容中提取所有专业术语和关键概念。

要求：
1. 识别文档中的专业术语、技术词汇、关键概念
2. 为每个术语提供清晰准确的定义
3. 定义应该基于文档内容，简洁明了（1-3句话）
4. 如果有同义词或相关术语，一并列出
5. 返回严格的 JSON 数组格式

输出格式（必须是有效的 JSON）：
[
  {
    "term": "术语名称",
    "definition": "术语定义说明",
    "category": "${category || '通用'}",
    "synonyms": ["同义词1", "同义词2"]
  }
]

注意：
- 只返回 JSON，不要有任何额外文字
- 确保 JSON 格式正确，可以被 JSON.parse() 解析
- 每个术语都必须有 term 和 definition 字段
- synonyms 字段可选，如果没有同义词可以省略或返回空数组`;

      const userPrompt = `请从以下文档中提取专业术语：

文档内容：
${documentText.substring(0, 8000)} ${documentText.length > 8000 ? '...(内容过长已截断)' : ''}

请返回 JSON 格式的术语列表。`;

      const response = await this.chatCompletion({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        maxTokens: 4000
      });

      const content = response.choices[0].message.content;
      console.log('[DeepSeek] AI 响应:', content.substring(0, 200));

      // 解析 JSON
      const terms = this.parseTermsFromJSON(content);

      console.log('[DeepSeek] 成功提取术语数量:', terms.length);

      return terms;

    } catch (error: any) {
      this.handleError('提取文档术语失败', error);
      throw error;
    }
  }

  /**
   * 从 AI 响应中解析术语 JSON
   */
  private parseTermsFromJSON(content: string): Array<{
    term: string;
    definition: string;
    category?: string;
    synonyms?: string[];
  }> {
    try {
      // 尝试直接解析
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed.filter(item => item.term && item.definition);
      }

      // 如果是对象包含 terms 字段
      if (parsed.terms && Array.isArray(parsed.terms)) {
        return parsed.terms.filter(item => item.term && item.definition);
      }

      throw new Error('无效的 JSON 格式');

    } catch (error) {
      // 尝试提取 JSON 数组
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (Array.isArray(parsed)) {
            return parsed.filter(item => item.term && item.definition);
          }
        } catch (e) {
          console.error('[DeepSeek] JSON 提取失败:', e);
        }
      }

      console.error('[DeepSeek] 无法解析术语 JSON:', content.substring(0, 500));
      throw new Error('AI 返回的内容无法解析为术语列表');
    }
  }

  // ============= 提示词构建 =============

  /**
   * 构建摘要系统提示词
   */
  private buildSummarySystemPrompt(language: 'zh' | 'en', style: 'formal' | 'casual'): string {
    if (language === 'zh') {
      return `你是一个专业的会议记录员和分析师。你的任务是将会议转录整理成结构化的会议纪要。

输出格式要求：
1. **会议概况**：标题、日期、参会人员、时长
2. **会议摘要**：简明扼要的总结（3-5句话）
3. **关键讨论点**：列举主要话题和讨论内容
4. **决策事项**：会议中达成的决定
5. **行动项**：任务、负责人、截止日期
6. **下一步计划**：后续行动安排

${style === 'formal' ? '语言风格：正式、专业、客观' : '语言风格：友好、简洁、易懂'}

重要原则：
- 基于实际转录内容，不添加臆测
- 突出关键信息和决策
- 行动项要明确、可执行
- 使用清晰的结构和格式`;
    } else {
      return `You are a professional meeting recorder and analyst. Your task is to organize meeting transcripts into structured meeting minutes.

Output format requirements:
1. **Meeting Overview**: Title, Date, Attendees, Duration
2. **Meeting Summary**: Brief summary (3-5 sentences)
3. **Key Discussion Points**: Main topics and discussions
4. **Decisions Made**: Decisions reached in the meeting
5. **Action Items**: Tasks, assignees, deadlines
6. **Next Steps**: Follow-up actions

${style === 'formal' ? 'Language style: Formal, professional, objective' : 'Language style: Friendly, concise, easy to understand'}

Important principles:
- Based on actual transcript content, no speculation
- Highlight key information and decisions
- Action items should be clear and actionable
- Use clear structure and formatting`;
    }
  }

  /**
   * 构建摘要用户提示词
   */
  private buildSummaryUserPrompt(options: {
    transcript: string;
    meetingTitle?: string;  // 🎯 改为可选
    attendees: string[];
    duration?: string;  // 🎯 改为字符串格式
    meetingDate?: Date | string;  // 🎯 新增
    includeActionItems?: boolean;
    includeSummary?: boolean;
    includeKeyPoints?: boolean;
  }): string {
    const {
      transcript,
      meetingTitle,  // 可能为undefined
      attendees,
      duration,
      meetingDate,
      includeActionItems = true,
      includeSummary = true,
      includeKeyPoints = true
    } = options;

    let prompt = `请为以下会议生成纪要：\n\n`;

    prompt += `**会议信息：**\n`;
    // 🎯 如果没有标题，要求AI生成
    if (meetingTitle) {
      prompt += `- 会议标题：${meetingTitle}\n`;
    } else {
      prompt += `- 请根据会议内容生成一个简洁的会议标题\n`;
    }

    if (meetingDate) {
      const dateStr = meetingDate instanceof Date ? meetingDate.toLocaleString('zh-CN') : new Date(meetingDate).toLocaleString('zh-CN');
      prompt += `- 会议日期：${dateStr}\n`;
    }

    if (attendees.length > 0) {
      prompt += `- 参会人员：${attendees.join('、')}\n`;
    }

    if (duration) {
      prompt += `- 会议时长：${duration}\n`;
    }
    prompt += `\n`;

    prompt += `**会议转录（已按说话人格式化）：**\n${transcript}\n\n`;

    prompt += `**要求：**\n`;
    if (includeSummary) prompt += `- 生成会议摘要\n`;
    if (includeKeyPoints) prompt += `- 提取关键讨论点\n`;
    if (includeActionItems) prompt += `- 提取行动项（包含负责人和截止日期）\n`;

    return prompt;
  }

  // ============= 响应解析 =============

  /**
   * 解析会议纪要
   */
  private parseMeetingSummary(
    content: string,
    metadata: { meetingTitle?: string; attendees: string[]; duration?: string; meetingDate?: Date | string }
  ): MeetingSummary {
    // 尝试解析结构化内容
    // 这里使用简单的文本解析，实际可以要求AI返回JSON

    // 🎯 从AI生成的内容中提取会议标题
    let extractedTitle = metadata.meetingTitle;
    if (!extractedTitle) {
      // 尝试从内容中提取标题
      const titleMatch = content.match(/会议标题[：:]\s*(.+?)(?:\n|$)/i) ||
                        content.match(/^#\s*(.+?)(?:\n|$)/m) ||
                        content.match(/^(.+?)(?:\n|$)/);  // 第一行作为标题
      extractedTitle = titleMatch ? titleMatch[1].trim() : '会议纪要';
    }

    // 🎯 使用传入的会议日期或当前日期
    const meetingDateStr = metadata.meetingDate
      ? (metadata.meetingDate instanceof Date
          ? metadata.meetingDate.toLocaleDateString('zh-CN')
          : new Date(metadata.meetingDate).toLocaleDateString('zh-CN'))
      : new Date().toLocaleDateString('zh-CN');

    const summary: MeetingSummary = {
      title: extractedTitle,
      date: meetingDateStr,
      attendees: metadata.attendees,
      duration: metadata.duration,  // 🎯 直接使用字符串格式的时长
      summary: '',
      keyPoints: [],
      actionItems: [],
      decisions: [],
      nextSteps: []
    };

    // 解析摘要
    const summaryMatch = content.match(/会议摘要[：:]\s*([\s\S]*?)(?=\n\n|关键讨论点|$)/i);
    if (summaryMatch) {
      summary.summary = summaryMatch[1].trim();
    }

    // 解析关键点（简化版，实际应该更复杂）
    const keyPointsMatch = content.match(/关键讨论点[：:]\s*([\s\S]*?)(?=\n\n|决策事项|$)/i);
    if (keyPointsMatch) {
      const points = keyPointsMatch[1].split(/\n/).filter(line => line.trim());
      summary.keyPoints = points.map(p => p.replace(/^[-*•]\s*/, '').trim()).filter(p => p);
    }

    // 解析决策
    const decisionsMatch = content.match(/决策事项[：:]\s*([\s\S]*?)(?=\n\n|行动项|$)/i);
    if (decisionsMatch) {
      const decisions = decisionsMatch[1].split(/\n/).filter(line => line.trim());
      summary.decisions = decisions.map(d => d.replace(/^[-*•]\s*/, '').trim()).filter(d => d);
    }

    // 如果没有解析到具体结构，将整个content作为summary
    if (!summary.summary && !summary.keyPoints.length) {
      summary.summary = content.trim();
    }

    return summary;
  }

  /**
   * 解析行动项
   */
  private parseActionItems(content: string): ActionItem[] {
    try {
      // 尝试解析JSON
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed;
      }

      // 回退：简单文本解析
      return [];

    } catch (error) {
      console.error('解析行动项失败:', error);
      return [];
    }
  }

  /**
   * 解析优化建议
   */
  private parseOptimizationSuggestions(content: string): OptimizationSuggestion[] {
    try {
      // 尝试解析JSON
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed;
      }

      // 回退：返回空数组
      return [];

    } catch (error) {
      console.error('解析优化建议失败:', error);
      return [];
    }
  }

  // ============= 辅助方法 =============

  /**
   * 错误处理
   */
  private handleError(message: string, error: any): void {
    console.error(`❌ ${message}:`, error.response?.data || error.message);
    this.emit('error', { message, error });
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.chatCompletion({
        messages: [{ role: 'user', content: 'Hello' }],
        maxTokens: 10
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default DeepSeekService;
