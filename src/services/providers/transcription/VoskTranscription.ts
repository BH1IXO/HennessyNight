/**
 * Vosk实时语音识别Provider
 * 支持真正的流式实时转录（<500ms延迟）
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { ITranscriptionProvider, TranscriptResult, TranscriptionOptions, RealtimeConfig } from '../types';

export interface VoskConfig {
  modelPath: string;       // Vosk模型路径
  language?: string;       // 语言代码，默认'zh'
  sampleRate?: number;     // 采样率，默认16000
}

export class VoskTranscriptionProvider implements ITranscriptionProvider {
  readonly name = 'Vosk Speech Recognition';
  readonly type = 'vosk' as const;

  private config: VoskConfig;
  private pythonPath: string;
  private tempDir: string;

  // 实时转录
  private realtimeProcess?: ChildProcess;
  private realtimeCallback?: (text: string, isFinal: boolean) => void;
  private realtimeErrorCallback?: (error: Error) => void;

  constructor(config: VoskConfig) {
    this.config = {
      language: config.language || 'zh',
      sampleRate: config.sampleRate || 16000,
      ...config
    };

    // Python环境路径
    const pythonEnvPath = path.join(process.cwd(), 'python', 'pyannote-env');
    this.pythonPath = path.join(
      pythonEnvPath,
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python'
    );

    this.tempDir = path.join(process.cwd(), 'temp', 'vosk');
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
      console.log('🎤 开始Vosk转录（文件模式）...');

      // 保存音频到临时文件
      const tempPath = await this.saveToTemp(audioFile);

      // 调用Python脚本进行转录
      const result = await this.runVoskFile(
        tempPath,
        options?.language || this.config.language!
      );

      // 清理临时文件
      await fs.unlink(tempPath).catch(() => {});

      console.log('✅ Vosk转录完成');

      return {
        text: result.text,
        segments: result.segments.map((seg: any) => ({
          text: seg.text,
          startTime: seg.start,
          endTime: seg.end,
          confidence: seg.confidence || 1.0,
          speaker: undefined
        })),
        language: result.language,
        duration: result.segments.length > 0
          ? result.segments[result.segments.length - 1].end
          : 0
      };

    } catch (error: any) {
      console.error('❌ Vosk转录失败:', error);
      throw new Error(`Vosk转录失败: ${error.message}`);
    }
  }

  /**
   * 启动实时转录
   */
  async startRealtime(config: RealtimeConfig): Promise<void> {
    if (this.realtimeProcess) {
      throw new Error('实时转录已在运行中');
    }

    try {
      console.log('🎤 启动Vosk实时转录...');

      this.realtimeCallback = config.onTranscript;
      this.realtimeErrorCallback = config.onError;

      const scriptPath = path.join(process.cwd(), 'python', 'vosk_service.py');

      // 启动Python流式处理进程
      this.realtimeProcess = spawn(this.pythonPath, [
        scriptPath,
        'stream',
        this.config.modelPath,
        this.config.language || 'zh'
      ]);

      let buffer = '';

      // 处理输出（JSON格式）
      this.realtimeProcess.stdout?.on('data', (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          try {
            const result = JSON.parse(line);

            if (!result.success) {
              console.error('❌ Vosk错误:', result.error);
              if (this.realtimeErrorCallback) {
                this.realtimeErrorCallback(new Error(result.error));
              }
              continue;
            }

            // 处理转录结果
            if (result.type === 'interim') {
              // 中间结果（不确定）
              if (this.realtimeCallback) {
                this.realtimeCallback(result.text, false);
              }
            } else if (result.type === 'partial' || result.type === 'final') {
              // 确定的结果
              if (this.realtimeCallback && result.text) {
                this.realtimeCallback(result.text, result.type === 'final');
              }
            }
          } catch (err) {
            console.error('❌ 解析Vosk结果失败:', line, err);
          }
        }
      });

      this.realtimeProcess.stderr?.on('data', (data) => {
        const msg = data.toString();
        console.error('Vosk stderr:', msg);
      });

      this.realtimeProcess.on('close', (code) => {
        console.log(`Vosk进程退出，代码: ${code}`);
        this.realtimeProcess = undefined;
      });

      this.realtimeProcess.on('error', (error) => {
        console.error('❌ Vosk进程错误:', error);
        if (this.realtimeErrorCallback) {
          this.realtimeErrorCallback(error);
        }
      });

      console.log('✅ Vosk实时转录已启动');

    } catch (error: any) {
      console.error('❌ 启动Vosk实时转录失败:', error);
      throw new Error(`启动Vosk实时转录失败: ${error.message}`);
    }
  }

  /**
   * 发送音频数据（实时模式）
   */
  async sendAudio(audioData: Buffer): Promise<void> {
    if (!this.realtimeProcess || !this.realtimeProcess.stdin) {
      throw new Error('实时转录未启动');
    }

    try {
      // 直接写入PCM数据到stdin
      this.realtimeProcess.stdin.write(audioData);
    } catch (error: any) {
      console.error('❌ 发送音频数据失败:', error);
      throw error;
    }
  }

  /**
   * 停止实时转录
   */
  async stopRealtime(): Promise<void> {
    if (!this.realtimeProcess) {
      return;
    }

    try {
      console.log('⏹️  停止Vosk实时转录...');

      // 关闭stdin（触发FinalResult）
      if (this.realtimeProcess.stdin) {
        this.realtimeProcess.stdin.end();
      }

      // 等待进程结束
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.realtimeProcess?.kill();
          resolve();
        }, 3000);

        this.realtimeProcess?.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.realtimeProcess = undefined;
      this.realtimeCallback = undefined;
      this.realtimeErrorCallback = undefined;

      console.log('✅ Vosk实时转录已停止');

    } catch (error: any) {
      console.error('❌ 停止Vosk实时转录失败:', error);
      throw error;
    }
  }

  /**
   * 运行Vosk文件转录
   */
  private runVoskFile(audioPath: string, language: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'python', 'vosk_service.py');

      console.log(`📝 调用Vosk: 语言=${language}`);

      const python = spawn(this.pythonPath, [
        scriptPath,
        'file',
        this.config.modelPath,
        audioPath,
        language
      ]);

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Vosk执行失败 (退出码: ${code})\n${errorOutput}`));
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
          reject(new Error(`解析Vosk结果失败: ${output}`));
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
    const filename = `vosk_${uuidv4()}.wav`;
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
          if (code !== 0) {
            resolve(false);
            return;
          }

          // 检查模型是否存在
          fs.access(this.config.modelPath)
            .then(() => resolve(true))
            .catch(() => resolve(false));
        });

        checkPython.on('error', () => {
          resolve(false);
        });
      });
    } catch {
      return false;
    }
  }
}

export default VoskTranscriptionProvider;
