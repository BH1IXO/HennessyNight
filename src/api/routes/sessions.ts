/**
 * 实时识别会话路由
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { getVoiceprintEngineManager } from '@/services/voiceprint/VoiceprintEngineManager';

const router = Router();

// 获取引擎管理器（单例）
let manager: ReturnType<typeof getVoiceprintEngineManager>;

try {
  manager = getVoiceprintEngineManager({
    maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '10'),
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600000'),
    cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL || '60000'),
    iflytekConfig: {
      appId: process.env.IFLYTEK_APP_ID!,
      apiKey: process.env.IFLYTEK_API_KEY!,
      apiSecret: process.env.IFLYTEK_API_SECRET!
    },
    pyannoteConfig: {
      modelPath: process.env.PYANNOTE_MODEL_PATH || 'pyannote/speaker-diarization',
      device: (process.env.PYANNOTE_DEVICE as 'cpu' | 'cuda') || 'cpu'
    }
  });
} catch (error) {
  console.error('❌ 初始化引擎管理器失败:', error);
}

/**
 * POST /api/v1/sessions/create
 * 创建识别会话
 */
router.post('/create', asyncHandler(async (req: Request, res: Response) => {
  const { meetingId, candidateSpeakerIds, engineConfig } = req.body;

  if (!meetingId) {
    throw createError('meetingId is required', 400, 'INVALID_INPUT');
  }

  const sessionId = await manager.createSession({
    meetingId,
    candidateSpeakerIds,
    engineConfig
  });

  res.status(201).json({
    message: '会话创建成功',
    data: { sessionId }
  });
}));

/**
 * DELETE /api/v1/sessions/:id
 * 销毁会话
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await manager.destroySession(id);

  res.json({ message: '会话已销毁' });
}));

/**
 * GET /api/v1/sessions/:id/status
 * 获取会话状态
 */
router.get('/:id/status', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const session = manager.getSession(id);

  if (!session) {
    throw createError('Session not found', 404, 'SESSION_NOT_FOUND');
  }

  res.json({ data: session });
}));

/**
 * GET /api/v1/sessions/stats
 * 获取统计信息
 */
router.get('/stats', asyncHandler(async (req: Request, res: Response) => {
  const stats = manager.getStats();
  res.json({ data: stats });
}));

/**
 * POST /api/v1/sessions/:id/pause
 * 暂停会话
 */
router.post('/:id/pause', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  manager.pauseSession(id);
  res.json({ message: '会话已暂停' });
}));

/**
 * POST /api/v1/sessions/:id/resume
 * 恢复会话
 */
router.post('/:id/resume', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  manager.resumeSession(id);
  res.json({ message: '会话已恢复' });
}));

export default router;
