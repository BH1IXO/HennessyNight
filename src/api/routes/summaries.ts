/**
 * 会议纪要路由
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { DeepSeekService } from '@/services/ai/DeepSeekService';
import { MeetingSummaryGenerator } from '@/services/ai/MeetingSummaryGenerator';

const router = Router();
const prisma = new PrismaClient();

// 初始化AI服务
const deepseek = new DeepSeekService({
  apiKey: process.env.DEEPSEEK_API_KEY!
});

const summaryGenerator = new MeetingSummaryGenerator(deepseek);

/**
 * GET /api/v1/summaries/meeting/:meetingId
 * 获取会议纪要
 */
router.get('/meeting/:meetingId', asyncHandler(async (req: Request, res: Response) => {
  const { meetingId } = req.params;

  const summaries = await prisma.summary.findMany({
    where: { meetingId },
    orderBy: { generatedAt: 'desc' }
  });

  res.json({ data: summaries });
}));

/**
 * POST /api/v1/summaries/generate
 * 生成会议纪要
 */
router.post('/generate', asyncHandler(async (req: Request, res: Response) => {
  const { meetingId, language = 'zh', style = 'formal', saveToDatabase = true } = req.body;

  if (!meetingId) {
    throw createError('meetingId is required', 400, 'INVALID_INPUT');
  }

  // 异步生成纪要
  const result = await summaryGenerator.generate({
    meetingId,
    language,
    style,
    saveToDatabase
  });

  res.json({
    message: '纪要生成成功',
    data: {
      summaryId: result.summaryId,
      duration: result.duration,
      summary: result.summary
    }
  });
}));

/**
 * POST /api/v1/summaries/:id/regenerate
 * 重新生成纪要
 */
router.post('/:id/regenerate', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // 获取原纪要的会议ID
  const existingSummary = await prisma.summary.findUnique({ where: { id } });

  if (!existingSummary) {
    throw createError('Summary not found', 404, 'SUMMARY_NOT_FOUND');
  }

  // 重新生成
  const result = await summaryGenerator.regenerate(existingSummary.meetingId);

  res.json({
    message: '纪要重新生成成功',
    data: result
  });
}));

/**
 * POST /api/v1/summaries/generate-from-text
 * 直接从转录文本生成纪要（不需要数据库）
 */
router.post('/generate-from-text', asyncHandler(async (req: Request, res: Response) => {
  const {
    transcript,
    meetingTitle = '会议',
    attendees = [],
    duration,
    language = 'zh',
    style = 'formal'
  } = req.body;

  if (!transcript || transcript.trim().length === 0) {
    throw createError('transcript is required', 400, 'INVALID_INPUT');
  }

  console.log('[Summaries API] 收到生成请求');
  console.log(`[Summaries API] 转录文本长度: ${transcript.length}`);
  console.log(`[Summaries API] 参会人员: ${attendees.join(', ') || '无'}`);

  try {
    // 调用DeepSeek生成纪要
    const summary = await deepseek.generateMeetingSummary({
      transcript,
      meetingTitle,
      attendees,
      duration,
      language,
      style,
      includeActionItems: true,
      includeSummary: true,
      includeKeyPoints: true
    });

    console.log('[Summaries API] DeepSeek生成成功');

    res.json({
      message: '纪要生成成功',
      data: summary
    });

  } catch (error: any) {
    console.error('[Summaries API] DeepSeek调用失败:', error.message);
    console.error('[Summaries API] 错误详情:', error.response?.data || error);

    throw createError(
      `DeepSeek API调用失败: ${error.message}`,
      500,
      'AI_GENERATION_FAILED'
    );
  }
}));

/**
 * POST /api/v1/summaries/optimize-text
 * 优化转录文本：去除多余空格并添加标点符号
 */
router.post('/optimize-text', asyncHandler(async (req: Request, res: Response) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    throw createError('text is required and must be a string', 400, 'INVALID_INPUT');
  }

  console.log('[Summaries API] 收到文本优化请求, 文本长度:', text.length);

  try {
    // 使用DeepSeek优化文本
    const response = await deepseek.chatCompletion({
      messages: [
        {
          role: 'system',
          content: `你是一个专业的文本处理助手。你的任务是：
1. 为输入的无标点符号中文文本添加合适的标点符号（逗号、句号、问号、感叹号等）
2. 保持原文内容不变，只添加标点符号
3. 根据语义和语境判断合适的断句位置
4. 直接返回处理后的文本，不要添加任何解释或说明`
        },
        {
          role: 'user',
          content: text
        }
      ],
      temperature: 0.3,
      maxTokens: 500
    });

    const optimizedText = response.choices[0].message.content.trim();

    console.log('[Summaries API] 文本优化成功');

    res.json({
      message: '文本优化成功',
      data: {
        optimizedText,
        originalLength: text.length,
        optimizedLength: optimizedText.length
      }
    });

  } catch (error: any) {
    console.error('[Summaries API] 文本优化失败:', error.message);

    // 如果AI调用失败，返回原文本
    res.json({
      message: '文本优化失败，返回原始文本',
      data: {
        optimizedText: text
      }
    });
  }
}));

/**
 * POST /api/v1/summaries/refine-summary
 * 根据用户要求优化会议纪要
 */
router.post('/refine-summary', asyncHandler(async (req: Request, res: Response) => {
  const { currentSummary, userRequest, chatHistory = [] } = req.body;

  if (!currentSummary) {
    throw createError('currentSummary is required', 400, 'INVALID_INPUT');
  }

  if (!userRequest || typeof userRequest !== 'string') {
    throw createError('userRequest is required and must be a string', 400, 'INVALID_INPUT');
  }

  console.log('[Summaries API] 收到会议纪要优化请求');
  console.log('[Summaries API] 用户要求:', userRequest);

  try {
    // 构建对话历史
    const messages: any[] = [
      {
        role: 'system',
        content: `你是一个专业的会议纪要优化助手。你的任务是根据用户的要求，对现有的会议纪要进行优化和修改。

重要原则：
1. 保持原有纪要的核心内容和事实
2. 根据用户要求进行针对性修改
3. 返回优化后的完整纪要（JSON格式）
4. 同时提供一个简短的回复说明你做了什么修改

返回格式：
{
  "reply": "简短说明你做的修改（1-2句话）",
  "refinedSummary": {
    "title": "会议标题",
    "summary": "会议摘要",
    "keyPoints": ["要点1", "要点2"],
    "actionItems": ["行动项1", "行动项2"],
    "decisions": ["决策1", "决策2"],
    "nextSteps": ["下一步1", "下一步2"]
  }
}`
      }
    ];

    // 添加历史对话
    chatHistory.forEach((msg: any) => {
      messages.push({
        role: msg.role,
        content: msg.content
      });
    });

    // 添加当前请求
    messages.push({
      role: 'user',
      content: `当前会议纪要：
${JSON.stringify(currentSummary, null, 2)}

用户要求：${userRequest}

请根据用户要求优化会议纪要，并返回JSON格式的结果。`
    });

    // 调用DeepSeek
    const response = await deepseek.chatCompletion({
      messages,
      temperature: 0.7,
      maxTokens: 3000
    });

    const content = response.choices[0].message.content.trim();

    // 解析JSON响应
    let result;
    try {
      // 尝试提取JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('无法解析JSON');
      }
    } catch (parseError) {
      console.error('[Summaries API] JSON解析失败，使用原纪要');
      result = {
        reply: content,
        refinedSummary: currentSummary
      };
    }

    console.log('[Summaries API] 会议纪要优化成功');

    res.json({
      message: '会议纪要优化成功',
      data: result
    });

  } catch (error: any) {
    console.error('[Summaries API] 会议纪要优化失败:', error.message);

    throw createError(
      `会议纪要优化失败: ${error.message}`,
      500,
      'AI_REFINEMENT_FAILED'
    );
  }
}));

export default router;
