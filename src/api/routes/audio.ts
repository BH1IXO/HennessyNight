/**
 * 音频处理路由
 */

import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { uploadRateLimiter } from '../middleware/rateLimiter';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { AudioProcessor } from '@/services/audio/AudioProcessor';
import audioConverter from '@/services/audio/AudioConverter';
import { speakerStorage } from '@/services/storage/SpeakerStorage';

const router = Router();
const prisma = new PrismaClient();
const audioProcessor = new AudioProcessor();

// 配置文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(process.cwd(), 'temp', 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /mp3|wav|m4a|aac|ogg|webm/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  }
});

/**
 * POST /api/v1/audio/upload
 * 上传音频文件
 */
router.post(
  '/upload',
  uploadRateLimiter,
  upload.single('audio'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw createError('No file uploaded', 400, 'NO_FILE');
    }

    const { meetingId } = req.body;

    if (!meetingId) {
      throw createError('meetingId is required', 400, 'INVALID_INPUT');
    }

    // 获取音频信息
    const audioInfo = await audioProcessor.getAudioInfo(req.file.path);

    // 保存到数据库
    const audioFile = await prisma.audioFile.create({
      data: {
        meetingId,
        filename: req.file.originalname,
        filePath: req.file.path,
        size: req.file.size,
        mimeType: req.file.mimetype,
        duration: audioInfo.duration,
        processingStatus: 'PENDING'
      }
    });

    res.status(201).json({
      message: '文件上传成功',
      data: audioFile
    });
  })
);

/**
 * POST /api/v1/audio/process
 * 处理音频文件（转录 + 声纹识别）
 */
router.post('/process', asyncHandler(async (req: Request, res: Response) => {
  const { audioFileId, options = {} } = req.body;

  if (!audioFileId) {
    throw createError('audioFileId is required', 400, 'INVALID_INPUT');
  }

  // 获取音频文件
  const audioFile = await prisma.audioFile.findUnique({
    where: { id: audioFileId }
  });

  if (!audioFile) {
    throw createError('Audio file not found', 404, 'AUDIO_NOT_FOUND');
  }

  // 更新状态为处理中
  await prisma.audioFile.update({
    where: { id: audioFileId },
    data: { processingStatus: 'PROCESSING' }
  });

  // TODO: 异步处理音频
  // 1. 转换格式
  // 2. 转录
  // 3. 声纹识别
  // 4. 保存结果

  res.json({
    message: '音频处理任务已提交',
    data: { audioFileId, status: 'PROCESSING' }
  });
}));

/**
 * GET /api/v1/audio/:id/info
 * 获取音频信息
 */
router.get('/:id/info', asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const audioFile = await prisma.audioFile.findUnique({
    where: { id }
  });

  if (!audioFile) {
    throw createError('Audio file not found', 404, 'AUDIO_NOT_FOUND');
  }

  res.json({ data: audioFile });
}));

/**
 * POST /api/v1/audio/transcribe
 * 实时转录音频流
 */
router.post('/transcribe',
  upload.single('audio'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw createError('No audio file uploaded', 400, 'NO_FILE');
    }

    let audioFilePath = req.file.path;
    let convertedFilePath: string | null = null;

    try {
      // 检查是否需要转换音频格式
      console.log(`[Transcribe] 检查音频文件: ${audioFilePath}`);
      const needsConversion = await audioConverter.needsConversion(audioFilePath);

      if (needsConversion) {
        console.log(`[Transcribe] 需要转换音频格式`);
        convertedFilePath = await audioConverter.convertToVoskFormat({
          inputPath: audioFilePath
        });
        audioFilePath = convertedFilePath;
        console.log(`[Transcribe] 音频转换完成: ${convertedFilePath}`);
      } else {
        console.log(`[Transcribe] 音频格式正确，无需转换`);
      }

      const { spawn } = require('child_process');
      // 🔧 临时修复：使用系统Python (虚拟环境pyannote-env不存在)
      // const pythonPath = path.join(process.cwd(), 'python', 'pyannote-env', 'Scripts', 'python.exe');
      const pythonPath = 'python'; // 使用系统Python
      const scriptPath = path.join(process.cwd(), 'python', 'vosk_recognizer.py');

      // 调用Python脚本进行语音识别
      const pythonProcess = spawn(pythonPath, [scriptPath, 'file', audioFilePath]);

      let results: any[] = [];

      pythonProcess.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            try {
              const result = JSON.parse(line);
              results.push(result);
            } catch (e) {
              // 忽略无法解析的行
            }
          }
        });
      });

      pythonProcess.stderr.on('data', (data: Buffer) => {
        console.log(`[Vosk] ${data.toString()}`);
      });

      pythonProcess.on('close', async (code: number) => {
        if (code === 0) {
          // 转录成功后，进行声纹比对 (使用WeSpeaker 256维)
          try {
            console.log('[Transcribe] ====================');
            console.log('[Transcribe] 🔍 开始声纹比对 (WeSpeaker 256维)...');

            // 🔥 从JSON文件读取声纹数据 (不再使用Prisma)
            const speakers = await speakerStorage.getAllSpeakers();
            console.log(`[Transcribe] ====================`);
            console.log(`[Transcribe] 📊 从JSON加载了 ${speakers.length} 个已注册声纹`);
            console.log(`[Transcribe] 📋 声纹列表:`);
            speakers.forEach((s: any, i: number) => {
              const vpLength = s.voiceprintData?.features ? s.voiceprintData.features.length : 0;
              const sampleCount = s.samples ? s.samples.length : 0;
              console.log(`[Transcribe]   ${i + 1}. ${s.name} (${s.email}) - 向量:${vpLength}维, 样本数:${sampleCount}`);
            });
            console.log(`[Transcribe] ====================`);

            let identifiedSpeaker: any = null;

            if (speakers.length > 0) {
              // ========== 🔧 修复：在识别前先转换音频格式 ==========
              let identifyAudioPath = audioFilePath;
              let identifyConvertedFilePath: string | null = null;

              try {
                console.log(`[Transcribe] 检查音频格式: ${audioFilePath}`);
                const needsConversion = await audioConverter.needsConversion(audioFilePath);

                if (needsConversion) {
                  console.log('[Transcribe] 音频需要转换为WAV格式进行声纹识别...');
                  identifyConvertedFilePath = await audioConverter.convertToVoskFormat({
                    inputPath: audioFilePath
                  });
                  identifyAudioPath = identifyConvertedFilePath;
                  console.log(`[Transcribe] 音频转换完成: ${identifyAudioPath}`);
                } else {
                  console.log('[Transcribe] 音频格式正确，无需转换');
                }
              } catch (convertError) {
                console.error('[Transcribe] 音频转换失败:', convertError);
                throw convertError;
              }

              // 🔥 使用WeSpeaker提取声纹特征
              const { spawn: spawnIdentify } = require('child_process');
              const pythonPath = path.join(process.cwd(), 'python', 'pyannote-env', 'Scripts', 'python.exe');
              const scriptPath = path.join(process.cwd(), 'python', 'wespeaker_service.py');

              const extractFeatures = (): Promise<any> => {
                return new Promise((resolve, reject) => {
                  const pythonProcess = spawnIdentify(pythonPath, [scriptPath, 'extract', identifyAudioPath, 'chinese', 'cpu']);

                  let stdout = '';
                  let stderr = '';

                  pythonProcess.stdout.on('data', (data: Buffer) => {
                    stdout += data.toString();
                  });

                  pythonProcess.stderr.on('data', (data: Buffer) => {
                    stderr += data.toString();
                  });

                  pythonProcess.on('close', async (code: number) => {
                    // 删除声纹识别用的转换后的临时音频文件
                    if (identifyConvertedFilePath) {
                      try {
                        await audioConverter.cleanupConvertedFile(identifyConvertedFilePath);
                        console.log('[Transcribe] 已清理声纹识别临时音频文件');
                      } catch (e) {
                        console.error('[Transcribe] 清理声纹识别临时音频文件失败:', e);
                      }
                    }

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

              if (!result.success) {
                throw new Error('Feature extraction failed');
              }

              const userEmbedding = result.embedding;
              console.log(`[Transcribe] ====================`);
              console.log(`[Transcribe] ✅ WeSpeaker特征提取完成: ${userEmbedding.length}维`);
              console.log(`[Transcribe] 🔢 特征向量预览: [${userEmbedding.slice(0, 5).map((v: number) => v.toFixed(4)).join(', ')}...]`);
              console.log(`[Transcribe] ====================`);
              console.log(`[Transcribe] 🔍 开始声纹比对...`);

              // 🔥 计算余弦相似度
              const cosineSimilarity = (a: number[], b: number[]): number => {
                if (a.length !== b.length) return 0;
                let dotProduct = 0;
                let normA = 0;
                let normB = 0;
                for (let i = 0; i < a.length; i++) {
                  dotProduct += a[i] * b[i];
                  normA += a[i] * a[i];
                  normB += b[i] * b[i];
                }
                return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
              };

              // 🔥 匹配说话人
              let bestMatch: any = null;
              let bestSimilarity = 0;

              for (const speaker of speakers) {
                if (!speaker.voiceprintData?.features || speaker.voiceprintData.features.length === 0) {
                  console.log(`[Transcribe]   ⚠️ ${speaker.name}: 无声纹数据，跳过`);
                  continue;
                }

                const similarity = cosineSimilarity(userEmbedding, speaker.voiceprintData.features);
                console.log(`[Transcribe]   📊 ${speaker.name}: ${(similarity * 100).toFixed(2)}% (向量维度:${speaker.voiceprintData.features.length})`);

                if (similarity > bestSimilarity) {
                  bestSimilarity = similarity;
                  bestMatch = speaker;
                }
              }

              // 🔥 阈值判断 (实时音频使用更宽松的阈值)
              const threshold = 0.32;  // 降低到32%以提高实时识别率
              console.log(`[Transcribe] ====================`);
              console.log(`[Transcribe] 🎯 识别阈值: ${(threshold * 100).toFixed(0)}% (实时模式-宽松)`);
              console.log(`[Transcribe] 🏆 最高相似度: ${bestMatch ? bestMatch.name : '无'} - ${(bestSimilarity * 100).toFixed(2)}%`);

              if (bestMatch && bestSimilarity >= threshold) {
                console.log(`[Transcribe] ✅ 识别成功: ${bestMatch.name} (${(bestSimilarity * 100).toFixed(2)}%)`);
                console.log(`[Transcribe] ====================`);
                identifiedSpeaker = {
                  id: bestMatch.id,
                  name: bestMatch.name,
                  confidence: bestSimilarity
                };
              } else {
                console.log(`[Transcribe] ❌ 未匹配到说话人 (最高相似度: ${(bestSimilarity * 100).toFixed(2)}% < 阈值${(threshold * 100).toFixed(0)}%)`);
                console.log(`[Transcribe] ====================`);
                identifiedSpeaker = {
                  name: '未识别说话人',
                  confidence: bestSimilarity
                };
              }
            } else {
              console.log('[Transcribe] ⚠️ 没有已注册的声纹');
              identifiedSpeaker = {
                name: '未识别说话人',
                confidence: 0
              };
            }

            // 清理转换后的临时文件
            if (convertedFilePath) {
              await audioConverter.cleanupConvertedFile(convertedFilePath);
            }

            res.json({
              message: '转录成功',
              data: {
                results,
                speaker: identifiedSpeaker
              }
            });
          } catch (error: any) {
            console.error('[Transcribe] 声纹识别失败:', error);

            // 即使声纹识别失败，也返回转录结果
            // 清理转换后的临时文件
            if (convertedFilePath) {
              await audioConverter.cleanupConvertedFile(convertedFilePath);
            }

            res.json({
              message: '转录成功，但声纹识别失败',
              data: {
                results,
                speaker: {
                  name: '未识别说话人',
                  confidence: 0,
                  error: error.message
                }
              }
            });
          }
        } else {
          // 清理转换后的临时文件
          if (convertedFilePath) {
            await audioConverter.cleanupConvertedFile(convertedFilePath);
          }

          res.status(500).json({
            error: '转录失败',
            code
          });
        }
      });

      pythonProcess.on('error', async (error: Error) => {
        console.error('Python进程错误:', error);

        // 清理转换后的临时文件
        if (convertedFilePath) {
          await audioConverter.cleanupConvertedFile(convertedFilePath);
        }

        res.status(500).json({
          error: '转录失败',
          message: error.message
        });
      });
    } catch (error: any) {
      console.error('[Transcribe] 处理失败:', error);

      // 清理转换后的临时文件
      if (convertedFilePath) {
        await audioConverter.cleanupConvertedFile(convertedFilePath);
      }

      throw createError(`音频处理失败: ${error.message}`, 500, 'PROCESSING_FAILED');
    }
  })
);

/**
 * POST /api/v1/audio/transcribe-file
 * 转录整个音频文件（使用FunASR + WeSpeaker多说话人识别）
 */
router.post('/transcribe-file',
  upload.single('audio'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw createError('No audio file uploaded', 400, 'NO_FILE');
    }

    let audioFilePath = req.file.path;
    let convertedFilePath: string | null = null;

    try {
      console.log(`[TranscribeFile] 开始处理音频文件: ${req.file.originalname}`);

      // 检查是否需要转换音频格式为16kHz单声道WAV
      const needsConversion = await audioConverter.needsConversion(audioFilePath);
      if (needsConversion) {
        console.log(`[TranscribeFile] 需要转换音频格式`);
        convertedFilePath = await audioConverter.convertToVoskFormat({
          inputPath: audioFilePath
        });
        audioFilePath = convertedFilePath;
        console.log(`[TranscribeFile] 音频转换完成: ${convertedFilePath}`);
      }

      // 加载已注册的声纹数据
      const speakers = await speakerStorage.findAll();
      console.log(`[TranscribeFile] 📋 加载了 ${speakers.length} 个已注册声纹`);

      // 准备参考声纹JSON
      const referenceEmbeddings: Record<string, number[]> = {};
      for (const speaker of speakers) {
        if (speaker.voiceprintData?.features && speaker.voiceprintData.features.length > 0) {
          referenceEmbeddings[speaker.name] = speaker.voiceprintData.features;
        }
      }
      const referenceJson = JSON.stringify(referenceEmbeddings);

      const { spawn } = require('child_process');
      const pythonPath = path.join(process.cwd(), 'python', 'pyannote-env', 'Scripts', 'python.exe');
      const scriptPath = path.join(process.cwd(), 'python', 'transcribe_with_speaker.py');

      // 调用Python脚本进行转录+说话人识别
      const pythonProcess = spawn(pythonPath, [
        scriptPath,
        audioFilePath,
        referenceJson,
        '0.40',  // threshold
        'chinese',
        'cpu'
      ]);

      let stdout = '';
      let stderr = '';

      pythonProcess.stdout.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      pythonProcess.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
        // 实时输出Python日志
        const lines = stderr.trim().split('\n');
        lines.forEach(line => {
          if (line) console.log(`[TranscribeSpeaker/Python] ${line}`);
        });
      });

      pythonProcess.on('close', async (code: number) => {
        if (code !== 0) {
          console.error(`[TranscribeFile] Python进程退出,代码: ${code}`);
          console.error(`[TranscribeFile] stderr:`, stderr);
          if (convertedFilePath) {
            await audioConverter.cleanupConvertedFile(convertedFilePath);
          }
          res.status(500).json({ error: '转录失败', code, stderr });
          return;
        }

        try {
          // 解析Python脚本返回的JSON结果
          const result = JSON.parse(stdout);

          if (!result.success) {
            throw new Error(result.error || 'Transcription failed');
          }

          console.log(`[TranscribeFile] 转录完成，共 ${result.segments.length} 个分段`);

          // Python脚本已经完成了转录和说话人识别,直接使用结果
          // 格式化segments以匹配前端期望的格式
          const segments = result.segments.map((seg: any) => ({
            text: seg.text,
            speaker: seg.speaker,
            timestamp: new Date(seg.start * 1000).toLocaleTimeString(),
            startTime: seg.start,
            endTime: seg.end
          }));

          console.log(`[TranscribeFile] 处理完成，共 ${segments.length} 个分段`);

          // 清理临时文件
          if (convertedFilePath) {
            await audioConverter.cleanupConvertedFile(convertedFilePath);
          }

          res.json({
            message: '转录成功',
            data: {
              segments,
              totalSegments: segments.length,
              fullText: result.full_text || ''
            }
          });

        } catch (error: any) {
          console.error('[TranscribeFile] 处理失败:', error);

          if (convertedFilePath) {
            await audioConverter.cleanupConvertedFile(convertedFilePath);
          }

          res.status(500).json({
            error: '处理失败',
            message: error.message
          });
        }
      });

      pythonProcess.on('error', async (error: Error) => {
        console.error('[TranscribeFile] Python进程错误:', error);

        if (convertedFilePath) {
          await audioConverter.cleanupConvertedFile(convertedFilePath);
        }

        res.status(500).json({
          error: '转录失败',
          message: error.message
        });
      });

    } catch (error: any) {
      console.error('[TranscribeFile] 处理失败:', error);

      if (convertedFilePath) {
        await audioConverter.cleanupConvertedFile(convertedFilePath);
      }

      throw createError(`音频处理失败: ${error.message}`, 500, 'PROCESSING_FAILED');
    }
  })
);

/**
 * POST /api/v1/audio/identify-speaker
 * 实时声纹识别 (使用WeSpeaker 256维)
 */
router.post('/identify-speaker',
  (req, res, next) => {
    console.log('[IdentifySpeaker] ⚡ 请求到达路由 (BEFORE multer middleware)');
    console.log('[IdentifySpeaker] Content-Type:', req.get('content-type'));
    console.log('[IdentifySpeaker] Method:', req.method);
    next();
  },
  (req, res, next) => {
    // Multer中间件包装 - 用于捕获multer错误
    const multerMiddleware = upload.single('audioFile');
    multerMiddleware(req, res, (err: any) => {
      if (err) {
        console.error('[IdentifySpeaker] ❌ Multer错误 - 文件上传失败:');
        console.error('[IdentifySpeaker] 错误类型:', err.constructor.name);
        console.error('[IdentifySpeaker] 错误消息:', err.message);
        console.error('[IdentifySpeaker] 错误代码:', err.code);
        console.error('[IdentifySpeaker] 错误字段:', err.field);
        console.error('[IdentifySpeaker] 完整错误:', err);
        return res.status(400).json({
          error: '文件上传失败',
          message: err.message,
          code: err.code || 'MULTER_ERROR'
        });
      }
      console.log('[IdentifySpeaker] ✅ Multer处理完成');
      console.log('[IdentifySpeaker] 文件是否存在:', !!req.file);
      if (req.file) {
        console.log('[IdentifySpeaker] 文件信息:', {
          fieldname: req.file.fieldname,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size
        });
      }
      next();
    });
  },
  asyncHandler(async (req: Request, res: Response) => {
    // 🔍 最早期日志 - 检查是否进入handler
    console.log('='.repeat(80));
    console.log('[IdentifySpeaker] 🚀 ENTRY POINT - 进入识别handler');
    console.log('[IdentifySpeaker] 请求时间:', new Date().toISOString());
    console.log('[IdentifySpeaker] 请求方法:', req.method);
    console.log('[IdentifySpeaker] 请求路径:', req.path);
    console.log('[IdentifySpeaker] Content-Type:', req.get('content-type'));
    console.log('='.repeat(80));

    console.log('[IdentifySpeaker] 开始实时声纹识别');

    const audioFile = req.file;
    const speakersData = req.body.speakers;

    console.log('[IdentifySpeaker] 📥 接收到的数据:');
    console.log('[IdentifySpeaker]   - audioFile:', audioFile ? `存在 (${audioFile.originalname}, ${audioFile.size} bytes)` : '不存在');
    console.log('[IdentifySpeaker]   - speakersData:', speakersData ? `存在 (长度:${speakersData.length})` : '不存在');

    if (!audioFile) {
      throw createError('未提供音频文件', 400, 'NO_AUDIO_FILE');
    }

    if (!speakersData) {
      throw createError('未提供声纹数据', 400, 'NO_SPEAKERS');
    }

    let convertedFilePath: string | null = null;

    try {
      const audioFilePath = audioFile.path;
      console.log(`[IdentifySpeaker] 音频文件: ${audioFilePath}`);
      console.log(`[IdentifySpeaker] 文件大小: ${audioFile.size} bytes`);

      // 检查文件大小 - 拒绝太小的文件(可能损坏或太短)
      if (audioFile.size < 1000) {
        console.log(`[IdentifySpeaker] ⚠️ 音频文件太小 (${audioFile.size} bytes),跳过识别`);

        // 清理文件
        setTimeout(async () => {
          try {
            await fs.unlink(audioFile.path).catch(() => {});
            console.log('[IdentifySpeaker] 小文件已清理');
          } catch (e) {
            console.error('[IdentifySpeaker] 清理小文件失败:', e);
          }
        }, 100);

        return res.json({
          success: true,
          data: {
            matched: false,
            message: '音频太短,无法识别'
          }
        });
      }

      // 解析声纹数据
      const speakers = JSON.parse(speakersData);
      console.log(`[IdentifySpeaker] ====================`);
      console.log(`[IdentifySpeaker] 📊 声纹数量: ${speakers.length}`);
      console.log(`[IdentifySpeaker] 📋 声纹列表:`);
      speakers.forEach((s: any, i: number) => {
        const vpLength = s.voiceprint ? s.voiceprint.length : 0;
        console.log(`[IdentifySpeaker]   ${i + 1}. ${s.name} (ID:${s.id}) - 向量维度:${vpLength}维`);
      });
      console.log(`[IdentifySpeaker] ====================`);

      if (speakers.length === 0) {
        console.log(`[IdentifySpeaker] ⚠️ 没有注册声纹，跳过识别`);
        return res.json({
          success: true,
          data: {
            matched: false,
            message: '没有注册声纹'
          }
        });
      }

      // 🎯 检查音频参数并转换格式
      console.log(`[IdentifySpeaker] 正在检查音频参数...`);
      try {
        const audioInfo = await audioConverter.getAudioInfo(audioFilePath);
        console.log(`[IdentifySpeaker] 📊 接收到的音频参数:`);
        console.log(`[IdentifySpeaker]   - 格式: ${audioInfo.format}`);
        console.log(`[IdentifySpeaker]   - 采样率: ${audioInfo.sampleRate}Hz`);
        console.log(`[IdentifySpeaker]   - 声道数: ${audioInfo.channels}`);
        console.log(`[IdentifySpeaker]   - 比特率: ${audioInfo.bitrate}`);
        console.log(`[IdentifySpeaker]   - 时长: ${audioInfo.duration.toFixed(2)}秒`);
      } catch (infoError) {
        console.warn(`[IdentifySpeaker] ⚠️ 无法获取音频信息:`, infoError);
      }

      const needsConversion = await audioConverter.needsConversion(audioFilePath);
      let processedAudioPath = audioFilePath;

      if (needsConversion) {
        console.log(`[IdentifySpeaker] 需要转换音频格式 → 目标: 16kHz, 单声道, WAV`);
        convertedFilePath = await audioConverter.convertToVoskFormat({
          inputPath: audioFilePath
        });
        processedAudioPath = convertedFilePath;
        console.log(`[IdentifySpeaker] ✅ 音频转换完成: ${convertedFilePath}`);
      } else {
        console.log(`[IdentifySpeaker] ✅ 音频格式正确,无需转换`);
      }

      // 🎯 使用多说话人识别服务
      const { spawn } = require('child_process');
      const pythonPath = path.join(process.cwd(), 'python', 'pyannote-env', 'Scripts', 'python.exe');
      const multiSpeakerScript = path.join(process.cwd(), 'python', 'multi_speaker_识别.py');

      // 准备参考声纹JSON
      const referenceEmbeddings: Record<string, number[]> = {};
      for (const speaker of speakers) {
        if (speaker.voiceprint && speaker.voiceprint.length > 0) {
          referenceEmbeddings[speaker.name] = speaker.voiceprint;
        }
      }
      const referenceJson = JSON.stringify(referenceEmbeddings);

      console.log(`[IdentifySpeaker] 使用多说话人识别模式`);
      console.log(`[IdentifySpeaker] 阈值: 40% (适应音频质量差异)`);

      const identifyMultiSpeaker = (): Promise<any> => {
        return new Promise((resolve, reject) => {
          // 使用多说话人识别: identify_multi <audio> <reference_json> [threshold] [chunk_duration] [model] [device]
          const pythonProcess = spawn(pythonPath, [
            multiSpeakerScript,
            'identify_multi',
            processedAudioPath,
            referenceJson,
            '0.40',  // threshold: 40%
            '4.0',   // chunk_duration: 4秒
            'chinese',
            'cpu'
          ]);

          let stdout = '';
          let stderr = '';

          pythonProcess.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
          });

          pythonProcess.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
            // 实时输出Python日志
            const lines = stderr.trim().split('\n');
            lines.forEach(line => {
              if (line) console.log(`[IdentifySpeaker/Python] ${line}`);
            });
          });

          pythonProcess.on('close', (code: number) => {
            if (code === 0) {
              try {
                const result = JSON.parse(stdout);
                resolve(result);
              } catch (e) {
                reject(new Error('Failed to parse multi-speaker result'));
              }
            } else {
              reject(new Error(`Multi-speaker process exited with code ${code}`));
            }
          });

          pythonProcess.on('error', (error: Error) => {
            reject(error);
          });
        });
      };

      const result = await identifyMultiSpeaker();

      if (!result.success) {
        throw new Error('Multi-speaker identification failed');
      }

      console.log(`[IdentifySpeaker] ====================`);
      console.log(`[IdentifySpeaker] ✅ 多说话人识别完成`);
      console.log(`[IdentifySpeaker] 检测到 ${result.numDetectedSpeakers || 0} 个说话人`);
      if (result.detectedSpeakers && result.detectedSpeakers.length > 0) {
        console.log(`[IdentifySpeaker] 说话人列表: ${result.detectedSpeakers.join(', ')}`);
      }
      console.log(`[IdentifySpeaker] ====================`);

      // 转换结果格式以兼容现有代码
      let bestMatch: any = null;
      let bestSimilarity = result.confidence || 0;
      let allScores: { name: string; similarity: number }[] = [];

      if (result.identified && result.profileId) {
        // 找到匹配的speaker对象
        bestMatch = speakers.find((s: any) => s.name === result.profileId);

        // 构建所有分数列表
        if (result.candidates) {
          allScores = result.candidates.map((c: any) => ({
            name: c.profileId,
            similarity: c.confidence
          }));
        }
      }

      // 🎯 阈值判断 (实时音频使用更宽松的阈值)
      // 注册声纹时音质好: 0.4-0.5
      // 实时识别音质差: 0.30-0.35 (宽松)
      const threshold = 0.32;  // 降低到32%以提高实时识别率
      console.log(`[IdentifySpeaker] ====================`);
      console.log(`[IdentifySpeaker] 🎯 识别阈值: ${(threshold * 100).toFixed(0)}% (实时模式-宽松)`);
      console.log(`[IdentifySpeaker] 🏆 最高相似度: ${bestMatch ? bestMatch.name : '无'} - ${(bestSimilarity * 100).toFixed(2)}%`);

      if (bestMatch && bestSimilarity >= threshold) {
        console.log(`[IdentifySpeaker] ✅ 识别成功: ${bestMatch.name} (${(bestSimilarity * 100).toFixed(2)}%)`);
        console.log(`[IdentifySpeaker] ====================`);

        // 先发送响应，在响应完成后再清理临时文件
        const responseData = {
          success: true,
          data: {
            matched: true,
            speaker: bestMatch,
            similarity: bestSimilarity,
            allScores,
            // 多说话人检测信息
            multiSpeaker: result.multiSpeaker || false,
            detectedSpeakers: result.detectedSpeakers || [bestMatch.name],
            numDetectedSpeakers: result.numDetectedSpeakers || 1,
            candidates: result.candidates || []
          }
        };

        // 延迟清理文件（不阻塞响应）
        setTimeout(async () => {
          try {
            if (convertedFilePath) {
              await audioConverter.cleanupConvertedFile(convertedFilePath);
            }
            if (audioFile) {
              await fs.unlink(audioFile.path).catch(() => {});
            }
            console.log('[IdentifySpeaker] 临时文件清理完成');
          } catch (cleanupError) {
            console.error('[IdentifySpeaker] 清理临时文件失败:', cleanupError);
          }
        }, 100);

        return res.json(responseData);
      } else {
        console.log(`[IdentifySpeaker] ❌ 未匹配到说话人 (最高相似度: ${(bestSimilarity * 100).toFixed(2)}% < 阈值${(threshold * 100).toFixed(0)}%)`);
        console.log(`[IdentifySpeaker] ====================`);

        // 先发送响应，在响应完成后再清理临时文件
        const responseData = {
          success: true,
          data: {
            matched: false,
            bestSimilarity: bestSimilarity,
            allScores,
            // 多说话人检测信息
            multiSpeaker: false,
            detectedSpeakers: [],
            numDetectedSpeakers: 0,
            candidates: result.candidates || []
          }
        };

        // 延迟清理文件（不阻塞响应）
        setTimeout(async () => {
          try {
            if (convertedFilePath) {
              await audioConverter.cleanupConvertedFile(convertedFilePath);
            }
            if (audioFile) {
              await fs.unlink(audioFile.path).catch(() => {});
            }
            console.log('[IdentifySpeaker] 临时文件清理完成');
          } catch (cleanupError) {
            console.error('[IdentifySpeaker] 清理临时文件失败:', cleanupError);
          }
        }, 100);

        return res.json(responseData);
      }

    } catch (error: any) {
      console.error('='.repeat(80));
      console.error('[IdentifySpeaker] ❌ 识别失败 - 详细错误信息:');
      console.error('[IdentifySpeaker] 错误消息:', error.message);
      console.error('[IdentifySpeaker] 错误类型:', error.constructor.name);
      console.error('[IdentifySpeaker] 错误栈:');
      console.error(error.stack);
      console.error('[IdentifySpeaker] audioFile 存在:', !!audioFile);
      console.error('[IdentifySpeaker] convertedFilePath:', convertedFilePath);
      console.error('='.repeat(80));

      // 清理临时文件（错误路径）- 延迟清理避免阻塞响应
      setTimeout(async () => {
        try {
          if (convertedFilePath) {
            await audioConverter.cleanupConvertedFile(convertedFilePath);
          }
          if (audioFile) {
            await fs.unlink(audioFile.path).catch(() => {});
          }
          console.log('[IdentifySpeaker] 错误路径下的文件清理完成');
        } catch (cleanupError) {
          console.error('[IdentifySpeaker] 清理临时文件失败:', cleanupError);
        }
      }, 100);

      // ⚠️ 重要: 即使发生错误,也返回200状态码和"未识别"结果
      // 这样前端可以正常更新UI,而不是显示错误状态
      console.log('[IdentifySpeaker] 🔄 返回"未识别"响应(避免前端500错误)');
      return res.json({
        success: true,
        data: {
          matched: false,
          message: '识别失败',
          error: error.message
        }
      });
    }
  })
);

export default router;

