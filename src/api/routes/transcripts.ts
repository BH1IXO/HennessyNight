/**
 * 转录管理路由
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler, createError } from '../middleware/errorHandler';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/v1/transcripts/meeting/:meetingId
 * 获取会议转录
 */
router.get('/meeting/:meetingId', asyncHandler(async (req: Request, res: Response) => {
  const { meetingId } = req.params;

  const transcripts = await prisma.transcriptMessage.findMany({
    where: { meetingId },
    orderBy: { timestamp: 'asc' },
    include: {
      speaker: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  // 按说话人分组统计
  const speakerStats = transcripts.reduce((acc: any, msg) => {
    const speakerLabel = msg.speakerLabel || 'Unknown';
    if (!acc[speakerLabel]) {
      acc[speakerLabel] = {
        count: 0,
        totalLength: 0
      };
    }
    acc[speakerLabel].count++;
    acc[speakerLabel].totalLength += msg.content.length;
    return acc;
  }, {});

  res.json({
    data: transcripts,
    stats: {
      totalMessages: transcripts.length,
      speakers: Object.keys(speakerStats).length,
      speakerStats
    }
  });
}));

/**
 * POST /api/v1/transcripts
 * 创建转录记录（手动添加）
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { meetingId, speakerId, speakerLabel, content, timestamp } = req.body;

  const transcript = await prisma.transcriptMessage.create({
    data: {
      meetingId,
      speakerId,
      speakerLabel,
      content,
      timestamp: timestamp ? new Date(timestamp) : new Date()
    },
    include: {
      speaker: true
    }
  });

  res.status(201).json({
    message: '转录记录创建成功',
    data: transcript
  });
}));

export default router;
