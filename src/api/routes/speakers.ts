/**
 * 说话人管理路由
 */

import { Router, Request, Response } from 'express';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import audioConverter from '@/services/audio/AudioConverter';
import { speakerStorage } from '@/services/storage/SpeakerStorage';

const router = Router();

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
  const { search } = req.query;

  let speakers = await speakerStorage.findAll();

  // 简单的搜索过滤
  if (search && typeof search === 'string') {
    const searchLower = search.toLowerCase();
    speakers = speakers.filter(s =>
      s.name.toLowerCase().includes(searchLower) ||
      (s.email && s.email.toLowerCase().includes(searchLower))
    );
  }

  // 按创建时间倒序排列
  speakers.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  res.json({
    data: speakers,
    pagination: {
      total: speakers.length,
      limit: speakers.length,
      offset: 0
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

  if (!name) {
    throw createError('name is required', 400, 'INVALID_INPUT');
  }

  console.log('[Speakers API] 创建说话人:', { name, email, hasVoiceFile: !!voiceFile });

  let voiceprintData: any = undefined;
  let audioFilePath = voiceFile?.path;
  let convertedFilePath: string | null = null;
  let audioDuration: number | undefined;

  // 如果有声纹文件，提取特征
  if (voiceFile && audioFilePath) {
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

      // 调用WeSpeaker提取声纹特征 (256维深度学习特征)
      const { spawn } = require('child_process');
      const pythonPath = path.join(process.cwd(), 'python', 'pyannote-env', 'Scripts', 'python.exe');
      const scriptPath = path.join(process.cwd(), 'python', 'wespeaker_service.py');

      const extractFeatures = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          // 使用WeSpeaker: python wespeaker_service.py extract <audio> chinese cpu
          const pythonProcess = spawn(pythonPath, [scriptPath, 'extract', audioFilePath, 'chinese', 'cpu']);

          let stdout = '';
          let stderr = '';

          pythonProcess.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          pythonProcess.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
            console.log('[WeSpeaker] ' + data.toString());
          });

          pythonProcess.on('close', (code: number) => {
            if (code === 0) {
              try {
                const result = JSON.parse(stdout);
                resolve(result);
              } catch (e) {
                reject(new Error('Failed to parse WeSpeaker features'));
              }
            } else {
              reject(new Error(`WeSpeaker process exited with code ${code}: ${stderr}`));
            }
          });

          pythonProcess.on('error', (error: Error) => {
            reject(error);
          });
        });
      };

      const result = await extractFeatures();

      if (result.success) {
        // 保存WeSpeaker声纹特征数据 (256维)
        voiceprintData = {
          features: result.embedding,  // WeSpeaker使用embedding字段
          featureDim: result.shape[0],  // WeSpeaker使用shape数组
          extractedAt: new Date().toISOString(),
          model: 'wespeaker-chinese',
          modelType: 'chinese'
        };

        console.log('[Speakers API] WeSpeaker声纹特征提取成功:', {
          featureDim: result.shape[0],
          model: 'wespeaker-chinese'
        });

        // 获取音频时长（使用转换后的WAV文件，在清理之前）
        try {
          console.log(`[Speakers API] 开始提取音频时长: ${audioFilePath}`);

          const getDuration = (): Promise<number> => {
            return new Promise((resolve, reject) => {
              const process = spawn(pythonPath, ['-c', `
import soundfile as sf
info = sf.info(r'${audioFilePath}')
print(info.duration)
`]);

              let output = '';
              let errorOutput = '';
              process.stdout.on('data', (data: Buffer) => { output += data.toString(); });
              process.stderr.on('data', (data: Buffer) => { errorOutput += data.toString(); });
              process.on('close', (code: number) => {
                if (code === 0) {
                  resolve(parseFloat(output.trim()));
                } else {
                  reject(new Error(`Failed to get duration: ${errorOutput}`));
                }
              });
            });
          };

          audioDuration = await getDuration();
          console.log(`[Speakers API] ✅ 音频时长: ${audioDuration}秒`);
        } catch (error) {
          console.warn('[Speakers API] ⚠️ 无法获取音频时长:', error);
        }
      } else {
        throw new Error('Feature extraction failed');
      }

    } catch (error: any) {
      console.error('[Speakers API] 声纹处理失败:', error);
      throw createError(`声纹处理失败: ${error.message}`, 500, 'VOICEPRINT_FAILED');
    } finally {
      // 清理转换后的临时文件
      if (convertedFilePath) {
        await audioConverter.cleanupConvertedFile(convertedFilePath);
      }
    }
  }

  // 创建说话人记录（支持多样本累积）
  const speaker = await speakerStorage.create({
    name,
    email: email || undefined,
    phone: undefined,
    voiceprintData,
    voiceFile: voiceFile?.path
  }, audioDuration);

  // 计算统计信息
  const sampleCount = speaker.samples?.length || 0;
  const totalDuration = speaker.samples?.reduce((sum, s) => sum + (s.duration || 0), 0) || 0;

  res.status(201).json({
    message: sampleCount > 1 ? `声纹样本已添加 (共${sampleCount}个样本)` : '声纹已成功保存',
    data: {
      ...speaker,
      sampleCount,
      totalDuration: Math.round(totalDuration * 10) / 10  // 保留1位小数
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

  console.log(`[Speakers API] 删除说话人: ${id}`);

  const deleted = await speakerStorage.delete(id);

  if (!deleted) {
    throw createError('Speaker not found', 404, 'SPEAKER_NOT_FOUND');
  }

  console.log(`[Speakers API] ✅ 说话人删除成功: ${id}`);

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

    // ========== 第3步：调用WeSpeaker进行识别 ==========
    console.log('\n🐍 第3步：调用WeSpeaker进行声纹识别...');
    const { spawn } = require('child_process');
    const fs = require('fs');
    const pythonPath = path.join(process.cwd(), 'python', 'pyannote-env', 'Scripts', 'python.exe');
    const scriptPath = path.join(process.cwd(), 'python', 'wespeaker_service.py');

    // 创建临时JSON文件存储声纹数据库
    const tempDbPath = path.join(process.cwd(), 'temp', `voiceprint-db-${Date.now()}.json`);
    await fs.promises.writeFile(tempDbPath, JSON.stringify(voiceprintDatabase, null, 2));

    console.log(`   - WeSpeaker脚本: ${scriptPath}`);
    console.log(`   - 测试音频: ${audioFile.path}`);
    console.log(`   - 声纹数据库: ${tempDbPath}`);

    const identifySpeaker = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        // WeSpeaker identify: python wespeaker_service.py identify <audio> <db.json> <threshold> <model> <device>
        const pythonProcess = spawn(pythonPath, [scriptPath, 'identify', audioFile.path, tempDbPath, '0.60', 'chinese', 'cpu']);

        let stdout = '';
        let stderr = '';

        pythonProcess.stdout.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        pythonProcess.stderr.on('data', (data: Buffer) => {
          stderr += data.toString();
          console.log('[WeSpeaker Identify] ' + data.toString());
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

      console.log(`\n   ✅✅✅ WeSpeaker识别成功！`);
      console.log(`   说话人: ${result.speaker_name}`);
      console.log(`   相似度: ${(result.similarity * 100).toFixed(1)}%`);
      console.log(`   置信度: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   阈值: 0.60 (WeSpeaker推荐)`);
      console.log(`   是否超过阈值: ${result.confidence >= 0.60 ? '是' : '否'}`);
    } else {
      console.log(`\n   ❌ 识别失败`);
      console.log(`   最高相似度: ${(result.similarity * 100).toFixed(1)}%`);
      console.log(`   置信度: ${(result.confidence * 100).toFixed(1)}%`);
      console.log(`   未达到阈值(0.60)`);
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
