/**
 * AI交互优化对话路由
 * 用于会议纪要的智能优化建议
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { DeepSeekService } from '@/services/ai/DeepSeekService';

const router = Router();

// 初始化DeepSeek服务
const deepseek = new DeepSeekService({
  apiKey: process.env.DEEPSEEK_API_KEY!
});

// 会话存储（简单实现，生产环境应该用Redis）
const chatSessions = new Map<string, Array<{
  role: 'system' | 'user' | 'assistant';
  content: string;
}>>();

/**
 * POST /api/v1/ai-chat/optimize
 * AI优化会议纪要对话
 */
router.post('/optimize', asyncHandler(async (req: Request, res: Response) => {
  const {
    sessionId,
    message,
    currentSummary
  } = req.body;

  if (!message || !message.trim()) {
    throw createError('message is required', 400, 'INVALID_INPUT');
  }

  console.log('[AI Chat] 收到优化请求');
  console.log(`[AI Chat] Session: ${sessionId || 'new'}`);
  console.log(`[AI Chat] Message: ${message}`);

  try {
    // 获取或创建会话
    const sid = sessionId || `session_${Date.now()}`;
    let messages = chatSessions.get(sid) || [];

    // 如果是新会话，添加系统提示词
    if (messages.length === 0) {
      messages.push({
        role: 'system',
        content: `你是一个专业的会议纪要编辑助手。你的任务是根据用户的要求优化和改进会议纪要。

当前会议纪要内容：
"""
${currentSummary || '（暂无内容）'}
"""

你应该：
1. 理解用户的修改需求
2. 直接提供修改后的完整会议纪要文本
3. 保持会议纪要的专业性和格式规范

注意：
- 直接输出修改后的完整纪要，不要只说"建议"
- 保持原有的Markdown格式
- 不要添加多余的解释，直接给出结果`
      });
    }

    // 添加用户消息
    messages.push({
      role: 'user',
      content: message
    });

    // 调用DeepSeek
    const response = await deepseek.chatCompletion({
      messages,
      temperature: 0.5,
      maxTokens: 3000
    });

    const assistantMessage = response.choices[0].message.content;

    // 添加助手回复
    messages.push({
      role: 'assistant',
      content: assistantMessage
    });

    // 保存会话（限制最多10轮对话）
    if (messages.length > 21) { // system + 10轮对话(user+assistant)
      messages = [messages[0], ...messages.slice(-20)];
    }
    chatSessions.set(sid, messages);

    console.log('[AI Chat] 回复生成成功');

    res.json({
      message: '对话成功',
      data: {
        sessionId: sid,
        response: assistantMessage,
        modifiedSummary: assistantMessage, // 直接返回修改后的纪要
        conversationLength: Math.floor((messages.length - 1) / 2)
      }
    });

  } catch (error: any) {
    console.error('[AI Chat] 对话失败:', error.message);
    throw createError(
      `AI对话失败: ${error.message}`,
      500,
      'AI_CHAT_FAILED'
    );
  }
}));

/**
 * DELETE /api/v1/ai-chat/session/:sessionId
 * 清除会话
 */
router.delete('/session/:sessionId', asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  chatSessions.delete(sessionId);

  res.json({ message: '会话已清除' });
}));

export default router;
