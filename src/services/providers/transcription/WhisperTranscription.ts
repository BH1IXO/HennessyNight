/**
 * Whisper语音识别Provider
 * 使用OpenAI Whisper进行本地语音转文字
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { ITranscriptionProvider, TranscriptResult, TranscriptionOptions } from '../types';

export interface WhisperConfig {
  modelSize?: 'tiny' | 'base' | 'small' | 'medium' | 'large';
  language?: string;
  device?: 'cpu' | 'cuda';
}

export class WhisperTranscriptionProvider implements ITranscriptionProvider {
  readonly name = 'Whisper Speech Recognition';
  readonly type = 'whisper' as const;

  private config: WhisperConfig;
  private pythonPath: string;
  private tempDir: string;

  constructor(config: WhisperConfig = {}) {
    this.config = {
      modelSize: config.modelSize || 'base',
      language: config.language || 'zh',
      device: config.device || 'cpu'
    };

    // Python环境路径
    const pythonEnvPath = path.join(process.cwd(), 'python', 'pyannote-env');
    this.pythonPath = path.join(
      pythonEnvPath,
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python'
    );

    this.tempDir = path.join(process.cwd(), 'temp', 'whisper');
    this.initTempDir();
  }

  /**
   * 转录音频文件
   */
  async transcribeFile(
    audioFile: Buffer,
    options?: TranscriptionOptions
  ): Promise<TranscriptResult> {
    try {
      console.log('🎤 开始Whisper转录...');

      // 保存音频到临时文件
      const tempPath = await this.saveToTemp(audioFile);

      // 调用Python脚本进行转录
      const result = await this.runWhisper(
        tempPath,
        options?.language || this.config.language!,
        this.config.modelSize!
      );

      // 清理临时文件
      await fs.unlink(tempPath).catch(() => {});

      console.log('✅ Whisper转录完成');

      return {
        text: result.text,
        segments: result.segments.map((seg: any) => ({
          text: seg.text,
          startTime: seg.start,
          endTime: seg.end,
          confidence: 1.0, // Whisper不提供置信度
          speaker: undefined
        })),
        language: result.language,
        duration: result.segments.length > 0
          ? result.segments[result.segments.length - 1].end
          : 0
      };

    } catch (error: any) {
      console.error('❌ Whisper转录失败:', error);
      throw new Error(`Whisper转录失败: ${error.message}`);
    }
  }

  /**
   * 运行Whisper Python脚本
   */
  private runWhisper(
    audioPath: string,
    language: string,
    modelSize: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'python', 'whisper_service.py');

      console.log(`📝 调用Whisper: ${modelSize} 模型, 语言: ${language}`);

      const python = spawn(this.pythonPath, [
        scriptPath,
        audioPath,
        language,
        modelSize
      ]);

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        const msg = data.toString();
        errorOutput += msg;
        // 输出进度信息
        if (msg.includes('正在') || msg.includes('✅')) {
          console.log(msg.trim());
        }
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Whisper执行失败 (退出码: ${code})\n${errorOutput}`));
          return;
        }

        try {
          const result = JSON.parse(output);

          if (!result.success) {
            reject(new Error(result.error));
            return;
          }

          resolve(result);
        } catch (error) {
          reject(new Error(`解析Whisper结果失败: ${output}`));
        }
      });

      python.on('error', (error) => {
        reject(new Error(`启动Python进程失败: ${error.message}`));
      });
    });
  }

  /**
   * 保存音频到临时文件
   */
  private async saveToTemp(audioData: Buffer): Promise<string> {
    const filename = `whisper_${uuidv4()}.wav`;
    const filepath = path.join(this.tempDir, filename);
    await fs.writeFile(filepath, audioData);
    return filepath;
  }

  /**
   * 初始化临时目录
   */
  private async initTempDir(): Promise<void> {
    try {
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error('创建临时目录失败:', error);
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      // 检查Python环境
      const checkPython = spawn(this.pythonPath, ['--version']);

      return new Promise((resolve) => {
        checkPython.on('close', (code) => {
          resolve(code === 0);
        });

        checkPython.on('error', () => {
          resolve(false);
        });
      });
    } catch {
      return false;
    }
  }

  /**
   * Whisper不支持实时转录
   */
  async startRealtime(): Promise<void> {
    throw new Error('Whisper不支持实时转录，请使用 transcribeFile 方法处理音频文件');
  }

  async sendAudio(): Promise<void> {
    throw new Error('Whisper不支持实时转录');
  }

  async stopRealtime(): Promise<void> {
    throw new Error('Whisper不支持实时转录');
  }
}

export default WhisperTranscriptionProvider;
