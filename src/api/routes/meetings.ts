/**
 * 会议管理路由
 */

import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// ============= 验证Schema =============

const createMeetingSchema = z.object({
  title: z.string().min(1).max(200),
  scheduledAt: z.string().datetime().optional(),
  description: z.string().max(1000).optional(),
  location: z.string().max(200).optional(),
  attendeeIds: z.array(z.string()).optional()
});

const updateMeetingSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  scheduledAt: z.string().datetime().optional(),
  description: z.string().max(1000).optional(),
  location: z.string().max(200).optional(),
  status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional()
});

// ============= 路由处理 =============

/**
 * GET /api/v1/meetings
 * 获取会议列表
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { status, limit = '20', offset = '0', search } = req.query;

  // 构建查询条件
  const where: any = {};

  if (status && typeof status === 'string') {
    where.status = status;
  }

  if (search && typeof search === 'string') {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } }
    ];
  }

  // 查询会议
  const [meetings, total] = await Promise.all([
    prisma.meeting.findMany({
      where,
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      orderBy: { scheduledAt: 'desc' },
      include: {
        attendees: {
          include: {
            speaker: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        transcripts: {
          select: {
            id: true
          }
        },
        summaries: {
          select: {
            id: true
          }
        }
      }
    }),
    prisma.meeting.count({ where })
  ]);

  res.json({
    data: meetings,
    pagination: {
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      hasMore: total > parseInt(offset as string) + parseInt(limit as string)
    }
  });
}));

/**
 * POST /api/v1/meetings
 * 创建新会议
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  // 验证请求体
  const validated = createMeetingSchema.parse(req.body);

  // 如果有参会人员，先获取speaker信息
  let attendeeData: Array<{ speakerId: string; name: string; email?: string }> = [];
  if (validated.attendeeIds && validated.attendeeIds.length > 0) {
    const speakers = await prisma.speaker.findMany({
      where: { id: { in: validated.attendeeIds } },
      select: { id: true, name: true, email: true }
    });
    attendeeData = speakers.map(s => ({
      speakerId: s.id,
      name: s.name,
      email: s.email || undefined
    }));
  }

  // 创建会议
  const meeting = await prisma.meeting.create({
    data: {
      title: validated.title,
      scheduledAt: validated.scheduledAt ? new Date(validated.scheduledAt) : new Date(),
      description: validated.description,
      location: validated.location,
      status: 'SCHEDULED',
      // 关联参会人员
      attendees: attendeeData.length > 0 ? {
        create: attendeeData
      } : undefined
    },
    include: {
      attendees: {
        include: {
          speaker: true
        }
      }
    }
  });

  res.status(201).json({
    message: '会议创建成功',
    data: meeting
  });
}));

/**
 * GET /api/v1/meetings/:id
 * 获取单个会议详情
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    include: {
      attendees: {
        include: {
          speaker: true
        }
      },
      transcripts: {
        orderBy: { timestamp: 'asc' },
        include: {
          speaker: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      summaries: {
        orderBy: { generatedAt: 'desc' }
      },
      audioFiles: true
    }
  });

  if (!meeting) {
    throw createError('Meeting not found', 404, 'MEETING_NOT_FOUND');
  }

  // 计算统计信息
  const stats = {
    transcriptCount: meeting.transcripts.length,
    summaryCount: meeting.summaries.length,
    audioFileCount: meeting.audioFiles.length,
    duration: meeting.startTime && meeting.endTime
      ? Math.round((meeting.endTime.getTime() - meeting.startTime.getTime()) / 60000)
      : null
  };

  res.json({
    data: { ...meeting, stats }
  });
}));

/**
 * PUT /api/v1/meetings/:id
 * 更新会议信息
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const validated = updateMeetingSchema.parse(req.body);

  // 检查会议是否存在
  const existing = await prisma.meeting.findUnique({ where: { id } });
  if (!existing) {
    throw createError('Meeting not found', 404, 'MEETING_NOT_FOUND');
  }

  // 更新会议
  const meeting = await prisma.meeting.update({
    where: { id },
    data: {
      ...validated,
      scheduledAt: validated.scheduledAt ? new Date(validated.scheduledAt) : undefined
    },
    include: {
      attendees: {
        include: {
          speaker: true
        }
      }
    }
  });

  res.json({
    message: '会议更新成功',
    data: meeting
  });
}));

/**
 * DELETE /api/v1/meetings/:id
 * 删除会议
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // 检查会议是否存在
  const existing = await prisma.meeting.findUnique({ where: { id } });
  if (!existing) {
    throw createError('Meeting not found', 404, 'MEETING_NOT_FOUND');
  }

  // 删除会议（级联删除相关数据）
  await prisma.meeting.delete({ where: { id } });

  res.json({
    message: '会议删除成功'
  });
}));

/**
 * POST /api/v1/meetings/:id/start
 * 开始会议
 */
router.post('/:id/start', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const meeting = await prisma.meeting.update({
    where: { id },
    data: {
      status: 'IN_PROGRESS',
      startTime: new Date()
    }
  });

  res.json({
    message: '会议已开始',
    data: meeting
  });
}));

/**
 * POST /api/v1/meetings/:id/finish
 * 结束会议
 */
router.post('/:id/finish', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { generateSummary = true } = req.body;

  // 更新会议状态
  const meeting = await prisma.meeting.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      endTime: new Date()
    }
  });

  // 异步生成纪要（如果需要）
  if (generateSummary) {
    // TODO: 触发纪要生成任务
    console.log(`📝 已触发会议 ${id} 的纪要生成任务`);
  }

  res.json({
    message: '会议已结束',
    data: meeting
  });
}));

/**
 * POST /api/v1/meetings/:id/attendees
 * 添加参会人员
 */
router.post('/:id/attendees', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { speakerIds } = req.body;

  if (!Array.isArray(speakerIds) || speakerIds.length === 0) {
    throw createError('speakerIds must be a non-empty array', 400, 'INVALID_INPUT');
  }

  // 先获取speaker信息
  const speakers = await prisma.speaker.findMany({
    where: { id: { in: speakerIds } },
    select: { id: true, name: true, email: true }
  });

  // 批量添加参会人员
  await prisma.meetingAttendee.createMany({
    data: speakers.map(speaker => ({
      meetingId: id,
      speakerId: speaker.id,
      name: speaker.name,
      email: speaker.email || undefined
    })),
    skipDuplicates: true // 跳过重复记录
  });

  // 返回更新后的参会人员列表
  const attendees = await prisma.meetingAttendee.findMany({
    where: { meetingId: id },
    include: { speaker: true }
  });

  res.json({
    message: '参会人员添加成功',
    data: attendees
  });
}));

/**
 * DELETE /api/v1/meetings/:id/attendees/:speakerId
 * 移除参会人员
 */
router.delete('/:id/attendees/:speakerId', asyncHandler(async (req: Request, res: Response) => {
  const { id, speakerId } = req.params;

  await prisma.meetingAttendee.deleteMany({
    where: {
      meetingId: id,
      speakerId: speakerId
    }
  });

  res.json({
    message: '参会人员移除成功'
  });
}));

export default router;
