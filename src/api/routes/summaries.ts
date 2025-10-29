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

export default router;
