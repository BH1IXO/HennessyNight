/**
 * 说话人管理路由
 */

import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import audioConverter from '@/services/audio/AudioConverter';

const router = Router();
const prisma = new PrismaClient();

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'temp', 'voiceprints'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `voiceprint-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp3|wav|m4a|aac|ogg|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    if (extname) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

// 验证Schema
const createSpeakerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  department: z.string().max(100).optional(),
  title: z.string().max(100).optional()
});

/**
 * GET /api/v1/speakers
 * 获取说话人列表
 */
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { status, limit = '20', offset = '0', search } = req.query;

  const where: any = {};

  if (status) where.profileStatus = status;

  if (search && typeof search === 'string') {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } }
    ];
  }

  const [speakers, total] = await Promise.all([
    prisma.speaker.findMany({
      where,
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            messages: true,
            enrollmentAudios: true
          }
        }
      }
    }),
    prisma.speaker.count({ where })
  ]);

  res.json({
    data: speakers,
    pagination: {
      total,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    }
  });
}));

/**
 * POST /api/v1/speakers
 * 创建说话人（支持声纹文件上传）
 */
router.post('/', upload.single('voiceFile'), asyncHandler(async (req: Request, res: Response) => {
  const { name, email } = req.body;
  const voiceFile = req.file;

  if (!name || !email) {
    throw createError('name and email are required', 400, 'INVALID_INPUT');
  }

  console.log('[Speakers API] 创建说话人:', { name, email, hasVoiceFile: !!voiceFile });

  // 创建说话人记录
  const speaker = await prisma.speaker.create({
    data: {
      name,
      email: email || undefined,
      profileStatus: voiceFile ? 'ENROLLING' : 'CREATED'
    }
  });

  let voiceprintId = null;

  // 如果有声纹文件，提取特征并保存
  if (voiceFile) {
    let audioFilePath = voiceFile.path;
    let convertedFilePath: string | null = null;

    try {
      console.log('[Speakers API] 开始提取声纹特征...');

      // 检查是否需要转换音频格式
      console.log(`[Speakers API] 检查音频文件: ${audioFilePath}`);
      const needsConversion = await audioConverter.needsConversion(audioFilePath);

      if (needsConversion) {
        console.log(`[Speakers API] 需要转换音频格式`);
        convertedFilePath = await audioConverter.convertToVoskFormat({
          inputPath: audioFilePath
        });
        audioFilePath = convertedFilePath;
        console.log(`[Speakers API] 音频转换完成: ${convertedFilePath}`);
      } else {
        console.log(`[Speakers API] 音频格式正确，无需转换`);
      }

      // 调用Python脚本提取声纹特征
      const { spawn } = require('child_process');
      const pythonPath = path.join(process.cwd(), 'python', 'pyannote-env', 'Scripts', 'python.exe');
      const scriptPath = path.join(process.cwd(), 'python', 'simple_voiceprint.py');

      const extractFeatures = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          const pythonProcess = spawn(pythonPath, [scriptPath, 'extract', audioFilePath]);

          let stdout = '';
          let stderr = '';

          pythonProcess.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          pythonProcess.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
            console.log('[Voiceprint] ' + data.toString());
          });

          pythonProcess.on('close', (code: number) => {
            if (code === 0) {
              try {
                const result = JSON.parse(stdout);
                resolve(result);
              } catch (e) {
                reject(new Error('Failed to parse voiceprint features'));
              }
            } else {
              reject(new Error(`Python process exited with code ${code}: ${stderr}`));
            }
          });

          pythonProcess.on('error', (error: Error) => {
            reject(error);
          });
        });
      };

      const result = await extractFeatures();

      if (result.success) {
        voiceprintId = voiceFile.filename;

        // 更新状态为已完成，保存声纹特征数据
        await prisma.speaker.update({
          where: { id: speaker.id },
          data: {
            profileStatus: 'ENROLLED',
            voiceFile: voiceFile.path,
            voiceprintData: {
              features: result.features,
              featureDim: result.feature_dim,
              extractedAt: new Date().toISOString()
            }
          }
        });

        console.log('[Speakers API] 声纹特征提取成功:', {
          speakerId: speaker.id,
          featureDim: result.feature_dim,
          voiceprintId
        });
      } else {
        throw new Error('Feature extraction failed');
      }

    } catch (error: any) {
      console.error('[Speakers API] 声纹处理失败:', error);

      // 更新状态为失败
      await prisma.speaker.update({
        where: { id: speaker.id },
        data: { profileStatus: 'FAILED' }
      });

      throw createError(`声纹处理失败: ${error.message}`, 500, 'VOICEPRINT_FAILED');
    } finally {
      // 清理转换后的临时文件
      if (convertedFilePath) {
        await audioConverter.cleanupConvertedFile(convertedFilePath);
      }
    }
  }

  res.status(201).json({
    message: '声纹已成功保存',
    data: {
      id: speaker.id,
      name: speaker.name,
      email: speaker.email,
      voiceprintId,
      createdAt: speaker.createdAt
    }
  });
}));

/**
 * GET /api/v1/speakers/:id
 * 获取说话人详情
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const speaker = await prisma.speaker.findUnique({
    where: { id },
    include: {
      enrollmentAudios: true,
      messages: {
        take: 10,
        orderBy: { timestamp: 'desc' }
      },
      _count: {
        select: {
          messages: true,
          enrollmentAudios: true
        }
      }
    }
  });

  if (!speaker) {
    throw createError('Speaker not found', 404, 'SPEAKER_NOT_FOUND');
  }

  res.json({ data: speaker });
}));

/**
 * PUT /api/v1/speakers/:id
 * 更新说话人
 */
router.put('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const validated = createSpeakerSchema.partial().parse(req.body);

  const speaker = await prisma.speaker.update({
    where: { id },
    data: validated
  });

  res.json({
    message: '说话人更新成功',
    data: speaker
  });
}));

/**
 * DELETE /api/v1/speakers/:id
 * 删除说话人
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  await prisma.speaker.delete({ where: { id } });

  res.json({ message: '说话人删除成功' });
}));

/**
 * POST /api/v1/speakers/identify
 * 实时声纹识别（1:N识别）
 */
router.post('/identify', upload.single('audioFile'), asyncHandler(async (req: Request, res: Response) => {
  const audioFile = req.file;

  if (!audioFile) {
    throw createError('audioFile is required', 400, 'INVALID_INPUT');
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎤 [Speakers API] 开始实时声纹识别');
  console.log('📁 音频文件:', audioFile.filename);
  console.log('='.repeat(60));

  try {
    // ========== 第1步：查询数据库 ==========
    console.log('\n💾 第1步：查询数据库中的已注册声纹...');
    const speakers = await prisma.speaker.findMany({
      where: {
        profileStatus: 'ENROLLED',
        voiceprintData: { not: Prisma.DbNull }
      },
      select: {
        id: true,
        name: true,
        voiceprintData: true
      }
    });

    console.log(`   ✅ 数据库中共有 ${speakers.length} 个已注册声纹`);

    if (speakers.length === 0) {
      console.log('   ⚠️  警告：数据库中没有已注册声纹！');
      res.json({
        success: true,
        identified: false,
        message: '没有已注册的说话人',
        confidence: 0,
        allCandidates: []
      });
      return;
    }

    // ========== 第2步：构建声纹数据库 ==========
    console.log('\n🔨 第2步：构建声纹数据库（speaker_id -> embedding）...');
    const voiceprintDatabase: Record<string, number[]> = {};
    for (const speaker of speakers) {
      const vpData: any = speaker.voiceprintData;
      if (vpData && vpData.features) {
        voiceprintDatabase[speaker.id] = vpData.features;
        console.log(`   - ${speaker.name}: embedding维度 = ${vpData.features.length}`);
      }
    }

    console.log(`   ✅ 声纹数据库构建完成，包含 ${Object.keys(voiceprintDatabase).length} 个说话人`);

    // ========== 第3步：调用Python脚本进行识别 ==========
    console.log('\n🐍 第3步：调用Python脚本进行声纹识别...');
    const { spawn } = require('child_process');
    const fs = require('fs');
    const pythonPath = path.join(process.cwd(), 'python', 'pyannote-env', 'Scripts', 'python.exe');
    const scriptPath = path.join(process.cwd(), 'python', 'simple_voiceprint.py');

    // 创建临时JSON文件存储声纹数据库
    const tempDbPath = path.join(process.cwd(), 'temp', `voiceprint-db-${Date.now()}.json`);
    await fs.promises.writeFile(tempDbPath, JSON.stringify(voiceprintDatabase, null, 2));

    console.log(`   - Python脚本: ${scriptPath}`);
    console.log(`   - 测试音频: ${audioFile.path}`);
    console.log(`   - 声纹数据库: ${tempDbPath}`);

    const identifySpeaker = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        const pythonProcess = spawn(pythonPath, [scriptPath, 'identify', audioFile.path, tempDbPath]);

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
          console.log('[Voiceprint Identify] ' + data.toString());
        });

        pythonProcess.on('close', async (code: number) => {
          // 清理临时文件
          try {
            await fs.promises.unlink(tempDbPath);
            await fs.promises.unlink(audioFile.path);
          } catch (e) {
            console.error('[Speakers API] 清理临时文件失败:', e);
          }

          if (code === 0) {
            try {
              const result = JSON.parse(stdout);
              resolve(result);
            } catch (e) {
              reject(new Error('Failed to parse identification result'));
            }
          } else {
            reject(new Error(`Python process exited with code ${code}: ${stderr}`));
          }
        });

        pythonProcess.on('error', (error: Error) => {
          reject(error);
        });
      });
    };

    const result = await identifySpeaker();

    // ========== 第4步：处理识别结果 ==========
    console.log('\n✅ 第4步：处理识别结果...');
    console.log('   原始结果:', JSON.stringify(result, null, 2));

    // 将speaker_id映射回名称
    if (result.identified) {
      const identifiedSpeaker = speakers.find(s => s.id === result.speaker_id);
      result.speaker_name = identifiedSpeaker?.name || '未知';
      result.speaker_id = result.speaker_id;

      console.log(`\n   ✅✅✅ 识别成功！`);
      console.log(`   说话人: ${result.speaker_name}`);
      console.log(`   置信度: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   是否超过阈值(0.7): ${result.confidence >= 0.7 ? '是' : '否'}`);
    } else {
      console.log(`\n   ❌ 识别失败`);
      console.log(`   最高置信度: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   未达到阈值(0.7)`);
    }

    // ========== 第5步：映射所有候选人 ==========
    console.log('\n🏆 第5步：所有候选人相似度排名:');
    if (result.all_candidates) {
      result.all_candidates = result.all_candidates.map((candidate: any, index: number) => {
        const speaker = speakers.find(s => s.id === candidate.speaker_id);
        const mappedCandidate = {
          speaker_id: candidate.speaker_id,
          speaker_name: speaker?.name || '未知',
          confidence: candidate.confidence
        };
        console.log(`   ${index + 1}. ${mappedCandidate.speaker_name}: ${(mappedCandidate.confidence * 100).toFixed(2)}%`);
        return mappedCandidate;
      });
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎉 声纹识别完成！');
    console.log('='.repeat(60) + '\n');

    res.json({
      success: true,
      ...result
    });

  } catch (error: any) {
    console.error('[Speakers API] 声纹识别失败:', error);
    throw createError(`声纹识别失败: ${error.message}`, 500, 'IDENTIFY_FAILED');
  }
}));

/**
 * POST /api/v1/speakers/:id/enroll
 * 注册声纹（需要音频文件）
 */
router.post('/:id/enroll', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { audioUrl, audioData } = req.body;

  if (!audioUrl && !audioData) {
    throw createError('audioUrl or audioData is required', 400, 'INVALID_INPUT');
  }

  // 更新状态为注册中
  await prisma.speaker.update({
    where: { id },
    data: { profileStatus: 'ENROLLING' }
  });

  // TODO: 调用声纹注册服务
  // 实际应该异步处理音频并提取声纹特征

  res.json({
    message: '声纹注册任务已提交',
    data: { speakerId: id, status: 'ENROLLING' }
  });
}));

export default router;
