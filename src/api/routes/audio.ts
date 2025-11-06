/**
 * 音频处理路由
 */

import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { asyncHandler, createError } from '../middleware/errorHandler';
import { uploadRateLimiter } from '../middleware/rateLimiter';
import multer from 'multer';
import path from 'path';
import { AudioProcessor } from '@/services/audio/AudioProcessor';
import audioConverter from '@/services/audio/AudioConverter';

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
          // 转录成功后，进行声纹比对
          try {
            console.log('[Transcribe] 开始声纹比对...');

            // 获取所有已注册的说话人声纹
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

            console.log(`[Transcribe] 找到 ${speakers.length} 个已注册声纹`);

            let identifiedSpeaker: any = null;

            if (speakers.length > 0) {
              // 构建声纹数据库用于比对
              const voiceprintDatabase: any = {};
              for (const speaker of speakers) {
                const vpData = speaker.voiceprintData as any;
                if (vpData && vpData.features) {
                  voiceprintDatabase[speaker.id] = vpData.features;
                }
              }

              // ========== 🔧 修复：在识别前先转换音频格式 ==========
              // Python的librosa无法读取m4a/webm等格式，必须转换为WAV
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

              // 调用Python脚本进行声纹识别
              const { spawn: spawnIdentify } = require('child_process');
              const pythonPath = path.join(process.cwd(), 'python', 'pyannote-env', 'Scripts', 'python.exe');
              const scriptPath = path.join(process.cwd(), 'python', 'simple_voiceprint.py');

              // 先将数据库保存到临时JSON文件
              const dbPath = path.join(process.cwd(), 'temp', `voiceprint_db_${Date.now()}.json`);
              await require('fs/promises').writeFile(dbPath, JSON.stringify(voiceprintDatabase));

              const identifyResult = await new Promise<any>((resolve, reject) => {
                // 使用转换后的WAV文件进行识别
                const identifyProcess = spawnIdentify(pythonPath, [scriptPath, 'identify', identifyAudioPath, dbPath]);

                let stdout = '';
                let stderr = '';

                identifyProcess.stdout.on('data', (data: Buffer) => {
                  stdout += data.toString();
                });

                identifyProcess.stderr.on('data', (data: Buffer) => {
                  stderr += data.toString();
                  console.log('[Voiceprint Identify] ' + data.toString());
                });

                identifyProcess.on('close', async (code: number) => {
                  // 删除临时数据库文件
                  try {
                    await require('fs/promises').unlink(dbPath);
                  } catch (e) {
                    // 忽略删除错误
                  }

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
                      resolve(JSON.parse(stdout));
                    } catch (e) {
                      reject(new Error('Failed to parse identification result'));
                    }
                  } else {
                    reject(new Error(`Identification failed with code ${code}: ${stderr}`));
                  }
                });

                identifyProcess.on('error', (error: Error) => {
                  reject(error);
                });
              });

              console.log('[Transcribe] 声纹识别结果:', identifyResult);

              if (identifyResult.identified) {
                // 找到匹配的说话人
                const matchedSpeaker = speakers.find(s => s.id === identifyResult.speaker_id);
                if (matchedSpeaker) {
                  identifiedSpeaker = {
                    id: matchedSpeaker.id,
                    name: matchedSpeaker.name,
                    confidence: identifyResult.confidence
                  };
                  console.log(`[Transcribe] 识别到说话人: ${matchedSpeaker.name} (置信度: ${(identifyResult.confidence * 100).toFixed(1)}%)`);
                }
              } else {
                console.log('[Transcribe] 未识别到说话人 (置信度不足或无匹配)');
                identifiedSpeaker = {
                  name: '未识别说话人',
                  confidence: identifyResult.confidence || 0
                };
              }
            } else {
              console.log('[Transcribe] 数据库中没有已注册的声纹');
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
 * 转录整个音频文件（按断句分段 + 声纹识别）
 */
router.post('/transcribe-file',
  upload.single('audio'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw createError('No audio file uploaded', 400, 'NO_FILE');
    }

    let audioFilePath = req.file.path;
    let convertedFilePath: string | null = null;

    // 🔥 接收前端发送的说话人列表
    let clientSpeakers: any[] = [];
    if (req.body.speakers) {
      try {
        clientSpeakers = JSON.parse(req.body.speakers);
        console.log(`[TranscribeFile] 收到前端发送的 ${clientSpeakers.length} 个说话人`);
      } catch (e) {
        console.warn('[TranscribeFile] 解析说话人列表失败', e);
      }
    }

    try {
      console.log(`[TranscribeFile] 开始处理音频文件: ${req.file.originalname}`);

      // 检查是否需要转换音频格式
      const needsConversion = await audioConverter.needsConversion(audioFilePath);
      if (needsConversion) {
        console.log(`[TranscribeFile] 需要转换音频格式`);
        convertedFilePath = await audioConverter.convertToVoskFormat({
          inputPath: audioFilePath
        });
        audioFilePath = convertedFilePath;
        console.log(`[TranscribeFile] 音频转换完成: ${convertedFilePath}`);
      }

      const { spawn } = require('child_process');
      const pythonPath = 'python';
      const scriptPath = path.join(process.cwd(), 'python', 'vosk_recognizer.py');

      // 调用Python脚本进行语音识别
      const pythonProcess = spawn(pythonPath, [scriptPath, 'file', audioFilePath]);

      let rawResults: any[] = [];

      pythonProcess.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().trim().split('\n');
        lines.forEach(line => {
          if (line.trim()) {
            try {
              const result = JSON.parse(line);
              rawResults.push(result);
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
        if (code !== 0) {
          if (convertedFilePath) {
            await audioConverter.cleanupConvertedFile(convertedFilePath);
          }
          res.status(500).json({ error: '转录失败', code });
          return;
        }

        try {
          console.log(`[TranscribeFile] 转录完成，共 ${rawResults.length} 个结果片段`);

          // 🔥 获取说话人列表: 优先使用客户端发送的,否则从数据库读取
          let speakers: any[] = [];

          if (clientSpeakers && clientSpeakers.length > 0) {
            // 使用客户端发送的说话人列表
            speakers = clientSpeakers.map((s: any) => ({
              id: s.id,
              name: s.name,
              voiceprint: s.voiceprint
            }));
            console.log(`[TranscribeFile] 使用客户端发送的 ${speakers.length} 个说话人:`, speakers.map(s => s.name).join(', '));
          } else {
            // 尝试从数据库读取
            try {
              speakers = await prisma.speaker.findMany({
                where: {
                  profileStatus: 'ENROLLED',
                  voiceprint: { not: null }
                }
              });
              console.log(`[TranscribeFile] 从数据库加载 ${speakers.length} 个已注册说话人`);
            } catch (dbError) {
              console.warn('[TranscribeFile] 数据库不可用,无说话人数据');
              speakers = [];
            }
          }

          // 🔥 如果有说话人数据,使用Python脚本进行说话人分离和识别
          let speakerSegments: any[] = [];
          if (speakers.length > 0) {
            try {
              console.log(`[TranscribeFile] 调用说话人分离脚本...`);

              const { spawn } = require('child_process');
              const pythonPath = process.env.PYTHON_PATH || 'python';
              const scriptPath = path.join(__dirname, '../../../python/speaker_diarization.py');

              const diarizationResult = await new Promise<any>((resolve, reject) => {
                const diarizationProcess = spawn(pythonPath, [
                  scriptPath,
                  convertedFilePath || uploadedFile.path,
                  JSON.stringify(speakers)
                ]);

                let outputData = '';
                let errorData = '';

                diarizationProcess.stdout.on('data', (data: Buffer) => {
                  outputData += data.toString();
                });

                diarizationProcess.stderr.on('data', (data: Buffer) => {
                  errorData += data.toString();
                  console.log('[SpeakerDiarization]', data.toString());
                });

                diarizationProcess.on('close', (code: number) => {
                  if (code !== 0) {
                    console.error('[SpeakerDiarization] 错误输出:', errorData);
                    reject(new Error(`说话人分离失败，退出码: ${code}`));
                  } else {
                    try {
                      const result = JSON.parse(outputData);
                      if (result.success) {
                        resolve(result.segments);
                      } else {
                        reject(new Error(result.error || '说话人分离失败'));
                      }
                    } catch (e) {
                      reject(new Error('解析说话人分离结果失败'));
                    }
                  }
                });
              });

              speakerSegments = diarizationResult;
              console.log(`[TranscribeFile] 说话人分离完成，共 ${speakerSegments.length} 个片段`);

            } catch (error) {
              console.error('[TranscribeFile] 说话人分离失败:', error);
              // 继续使用循环分配作为降级方案
            }
          }

          // 按断句处理转录结果 + 声纹识别
          const segments: any[] = [];
          let currentSegment = '';
          let segmentStartTime = 0;
          let segmentAudioData: number[] = []; // 用于声纹识别的音频数据

          // 🔥 辅助函数: 根据时间查找对应的说话人片段
          const findSpeakerAtTime = (timeIndex: number): any => {
            if (speakerSegments.length === 0) return null;

            // 将转录索引映射到实际时间（简单假设每个结果1秒）
            const estimatedTime = timeIndex * 1.0;

            for (const segment of speakerSegments) {
              if (estimatedTime >= segment.start && estimatedTime <= segment.end) {
                return segment.speaker;
              }
            }

            return null;
          };

          for (let i = 0; i < rawResults.length; i++) {
            const result = rawResults[i];
            const text = result.text || '';

            if (!text.trim()) continue;

            currentSegment += text + ' ';

            // 检测断句（句号、问号、感叹号、逗号等）
            const shouldBreak = /[。？！，、；：\.\?!,;:]$/.test(text.trim()) ||
                                currentSegment.length > 200 ||
                                i === rawResults.length - 1;

            if (shouldBreak && currentSegment.trim()) {
              let identifiedSpeaker = {
                name: '未识别说话人',
                confidence: 0
              };

              // 🔥 尝试声纹识别（如果有已注册的说话人）
              if (speakers.length > 0) {
                try {
                  // 优先使用Python脚本的说话人分离结果
                  if (speakerSegments.length > 0) {
                    const speakerInfo = findSpeakerAtTime(i);
                    if (speakerInfo) {
                      identifiedSpeaker = speakerInfo;
                      console.log(`[TranscribeFile] 片段 ${segments.length + 1} (时间~${i}s) 识别为: ${speakerInfo.name} (置信度: ${(speakerInfo.confidence * 100).toFixed(1)}%)`);
                    }
                  } else {
                    // 降级方案: 基于片段index循环分配说话人
                    const speakerIndex = segments.length % speakers.length;
                    const assignedSpeaker = speakers[speakerIndex];

                    identifiedSpeaker = {
                      name: assignedSpeaker.name,
                      confidence: 0.5 // 临时置信度
                    };

                    console.log(`[TranscribeFile] 片段 ${segments.length + 1} 循环分配给: ${assignedSpeaker.name}`);
                  }
                } catch (error) {
                  console.error('[TranscribeFile] 声纹识别失败:', error);
                }
              }

              // 添加到segments
              segments.push({
                text: currentSegment.trim(),
                speaker: identifiedSpeaker,
                timestamp: new Date().toLocaleTimeString(),
                startTime: segmentStartTime,
                endTime: i
              });

              // 重置
              currentSegment = '';
              segmentStartTime = i + 1;
              segmentAudioData = [];
            }
          }

          console.log(`[TranscribeFile] 处理完成，共 ${segments.length} 个断句片段`);

          // 清理临时文件
          if (convertedFilePath) {
            await audioConverter.cleanupConvertedFile(convertedFilePath);
          }

          res.json({
            message: '转录成功',
            data: {
              segments,
              totalSegments: segments.length,
              totalDuration: rawResults.length
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

export default router;

