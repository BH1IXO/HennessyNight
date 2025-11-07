/**
 * FunASR语音识别Provider
 * 阿里达摩院开源ASR，支持实时流式识别 + VAD断句 + 标点预测
 *
 * 特性：
 * - 实时流式识别 (<500ms延迟)
 * - VAD自动断句
 * - 智能标点预测
 * - 中文识别准确率 95%+
 * - 完全免费开源
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { ITranscriptionProvider, TranscriptResult, TranscriptionOptions, RealtimeConfig } from '../types';

export interface FunAsrConfig {
  mode?: 'realtime' | 'offline' | '2pass';  // 识别模式
  language?: string;                         // 语言代码 (zh, en)
  device?: 'cpu' | 'cuda';                   // 运行设备
}

export class FunAsrTranscriptionProvider implements ITranscriptionProvider {
  readonly name = 'FunASR Speech Recognition (Alibaba DAMO)';
  readonly type = 'funasr' as const;

  private config: FunAsrConfig;
  private pythonPath: string;
  private tempDir: string;

  // 实时转录
  private realtimeProcess?: ChildProcess;
  private realtimeCallback?: (text: string, isFinal: boolean) => void;
  private realtimeErrorCallback?: (error: Error) => void;

  constructor(config: FunAsrConfig = {}) {
    this.config = {
      mode: config.mode || '2pass',
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

    this.tempDir = path.join(process.cwd(), 'temp', 'funasr');
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
      console.log('🎤 开始FunASR转录（文件模式）...');
      console.log(`   模式: ${this.config.mode}`);
      console.log(`   语言: ${options?.language || this.config.language}`);

      // 保存音频到临时文件
      const tempPath = await this.saveToTemp(audioFile);

      // 调用Python脚本进行转录
      const result = await this.runFunAsrFile(
        tempPath,
        options?.language || this.config.language!,
        this.config.mode!,
        this.config.device!
      );

      // 清理临时文件
      await fs.unlink(tempPath).catch(() => {});

      console.log('✅ FunASR转录完成');
      console.log(`   文本长度: ${result.text.length} 字`);
      console.log(`   分段数: ${result.segments?.length || 0}`);

      return {
        text: result.text,
        segments: result.segments?.map((seg: any) => ({
          text: seg.text,
          startTime: seg.start,
          endTime: seg.end,
          confidence: seg.confidence || 1.0,
          speaker: undefined
        })) || [],
        language: result.language,
        duration: result.segments?.length > 0
          ? result.segments[result.segments.length - 1].end
          : 0,
        metadata: {
          mode: result.mode,
          sentences: result.sentences || []
        }
      };

    } catch (error: any) {
      console.error('❌ FunASR转录失败:', error);
      throw new Error(`FunASR转录失败: ${error.message}`);
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
      console.log('🎤 启动FunASR实时转录...');
      console.log('   特性: 流式识别 + VAD断句 + 标点预测');

      this.realtimeCallback = config.onTranscript;
      this.realtimeErrorCallback = config.onError;

      const scriptPath = path.join(process.cwd(), 'python', 'funasr_service.py');

      // 启动Python流式处理进程
      this.realtimeProcess = spawn(this.pythonPath, [
        scriptPath,
        'stream'
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
              console.error('❌ FunASR错误:', result.error);
              if (this.realtimeErrorCallback) {
                this.realtimeErrorCallback(new Error(result.error));
              }
              continue;
            }

            // 处理转录结果
            const isFinal = result.type === 'final';
            const text = result.text;

            if (this.realtimeCallback && text) {
              this.realtimeCallback(text, isFinal);
            }

            // 输出调试信息
            if (isFinal) {
              console.log(`📝 [完整] ${text}`);
            }

          } catch (err) {
            console.error('❌ 解析FunASR结果失败:', line, err);
          }
        }
      });

      this.realtimeProcess.stderr?.on('data', (data) => {
        const msg = data.toString();
        // FunASR的日志输出到stderr
        if (msg.includes('[FunASR]')) {
          console.log(msg.trim());
        }
      });

      this.realtimeProcess.on('close', (code) => {
        console.log(`FunASR进程退出，代码: ${code}`);
        this.realtimeProcess = undefined;
      });

      this.realtimeProcess.on('error', (error) => {
        console.error('❌ FunASR进程错误:', error);
        if (this.realtimeErrorCallback) {
          this.realtimeErrorCallback(error);
        }
      });

      console.log('✅ FunASR实时转录已启动');

    } catch (error: any) {
      console.error('❌ 启动FunASR实时转录失败:', error);
      throw new Error(`启动FunASR实时转录失败: ${error.message}`);
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
      console.log('⏹️  停止FunASR实时转录...');

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

      console.log('✅ FunASR实时转录已停止');

    } catch (error: any) {
      console.error('❌ 停止FunASR实时转录失败:', error);
      throw error;
    }
  }

  /**
   * 运行FunASR文件转录
   */
  private runFunAsrFile(
    audioPath: string,
    language: string,
    mode: string,
    device: string
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(process.cwd(), 'python', 'funasr_service.py');

      console.log(`📝 调用FunASR: 语言=${language}, 模式=${mode}`);

      const python = spawn(this.pythonPath, [
        scriptPath,
        'file',
        audioPath,
        language,
        mode,
        device
      ]);

      let output = '';
      let errorOutput = '';

      python.stdout.on('data', (data) => {
        output += data.toString();
      });

      python.stderr.on('data', (data) => {
        const msg = data.toString();
        errorOutput += msg;
        // 输出FunASR的日志
        if (msg.includes('[FunASR]')) {
          console.log(msg.trim());
        }
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`FunASR执行失败 (退出码: ${code})\n${errorOutput}`));
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
          reject(new Error(`解析FunASR结果失败: ${output}`));
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
    const filename = `funasr_${uuidv4()}.wav`;
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
      const scriptPath = path.join(process.cwd(), 'python', 'funasr_service.py');
      const python = spawn(this.pythonPath, [scriptPath, 'test']);

      return new Promise((resolve) => {
        let output = '';

        python.stdout.on('data', (data) => {
          output += data.toString();
        });

        python.on('close', (code) => {
          if (code !== 0) {
            resolve(false);
            return;
          }

          try {
            const result = JSON.parse(output);
            resolve(result.success === true);
          } catch {
            resolve(false);
          }
        });

        python.on('error', () => {
          resolve(false);
        });
      });
    } catch {
      return false;
    }
  }
}

export default FunAsrTranscriptionProvider;
