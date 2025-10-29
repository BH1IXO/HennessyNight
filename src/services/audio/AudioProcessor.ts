/**
 * 音频处理服务
 * 提供音频格式转换、采样率调整、降噪等功能
 */

import ffmpeg from 'fluent-ffmpeg';
import { Readable, PassThrough } from 'stream';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

export interface AudioInfo {
  duration: number;      // 时长（秒）
  sampleRate: number;    // 采样率
  channels: number;      // 声道数
  bitrate: number;       // 比特率
  format: string;        // 格式
  size: number;          // 文件大小（字节）
}

export interface ConvertOptions {
  format?: 'wav' | 'mp3' | 'flac' | 'ogg';
  sampleRate?: number;   // 采样率，如16000
  channels?: number;     // 声道数，1=单声道，2=立体声
  bitrate?: string;      // 比特率，如'128k'
  codec?: string;        // 编码器
}

export interface AudioSegment {
  startTime: number;     // 开始时间（秒）
  endTime: number;       // 结束时间（秒）
  duration: number;      // 时长（秒）
  data?: Buffer;         // 音频数据
}

export class AudioProcessor {
  private tempDir: string;

  constructor(tempDir?: string) {
    this.tempDir = tempDir || path.join(process.cwd(), 'temp', 'audio');
    this.initTempDir();
  }

  /**
   * 获取音频文件信息
   */
  async getAudioInfo(inputPath: string): Promise<AudioInfo> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          return reject(new Error(`获取音频信息失败: ${err.message}`));
        }

        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        if (!audioStream) {
          return reject(new Error('未找到音频流'));
        }

        resolve({
          duration: metadata.format.duration || 0,
          sampleRate: audioStream.sample_rate ? parseInt(String(audioStream.sample_rate)) : 0,
          channels: audioStream.channels || 0,
          bitrate: metadata.format.bit_rate ? parseInt(String(metadata.format.bit_rate)) : 0,
          format: metadata.format.format_name || '',
          size: metadata.format.size || 0
        });
      });
    });
  }

  /**
   * 转换音频格式
   */
  async convert(
    input: string | Buffer,
    outputPath: string,
    options: ConvertOptions = {}
  ): Promise<string> {
    const {
      format = 'wav',
      sampleRate = 16000,
      channels = 1,
      bitrate = '256k',
      codec
    } = options;

    return new Promise(async (resolve, reject) => {
      try {
        let inputPath: string;

        // 如果输入是Buffer，先保存到临时文件
        if (Buffer.isBuffer(input)) {
          inputPath = await this.saveToTemp(input);
        } else {
          inputPath = input;
        }

        const command = ffmpeg(inputPath)
          .toFormat(format)
          .audioFrequency(sampleRate)
          .audioChannels(channels);

        // 对于WAV格式，使用PCM编码
        if (format === 'wav') {
          command.audioCodec('pcm_s16le');
        } else if (codec) {
          command.audioCodec(codec);
        }

        if (format !== 'wav') {
          command.audioBitrate(bitrate);
        }

        command
          .on('start', (commandLine) => {
            console.log(`🎵 执行命令: ${commandLine}`);
          })
          .on('progress', (progress) => {
            if (progress.percent) {
              console.log(`⏳ 处理进度: ${progress.percent.toFixed(1)}%`);
            }
          })
          .on('end', () => {
            console.log('✅ 音频转换完成');
            // 如果输入是临时文件，清理它
            if (Buffer.isBuffer(input)) {
              fs.unlink(inputPath).catch(console.error);
            }
            resolve(outputPath);
          })
          .on('error', (err) => {
            reject(new Error(`音频转换失败: ${err.message}`));
          })
          .save(outputPath);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 转换为标准WAV格式（16kHz, 单声道, PCM）
   * 这是大多数语音API要求的格式
   */
  async convertToStandardWav(
    input: string | Buffer,
    outputPath?: string
  ): Promise<string> {
    const output = outputPath || path.join(this.tempDir, `${uuidv4()}.wav`);

    return this.convert(input, output, {
      format: 'wav',
      sampleRate: 16000,
      channels: 1,
      codec: 'pcm_s16le'
    });
  }

  /**
   * 降噪处理
   */
  async denoise(inputPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters([
          'highpass=f=200',    // 高通滤波器，去除低频噪音
          'lowpass=f=3000',    // 低通滤波器，去除高频噪音
          'afftdn=nf=-25'      // FFT降噪
        ])
        .on('end', () => {
          console.log('✅ 降噪完成');
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new Error(`降噪失败: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * 音量归一化
   */
  async normalize(inputPath: string, outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFilters('loudnorm')
        .on('end', () => {
          console.log('✅ 音量归一化完成');
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new Error(`音量归一化失败: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * 裁剪音频
   */
  async trim(
    inputPath: string,
    outputPath: string,
    startTime: number,
    duration: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        .on('end', () => {
          console.log('✅ 裁剪完成');
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new Error(`裁剪失败: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * 合并多个音频文件
   */
  async merge(inputPaths: string[], outputPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg();

      // 添加所有输入文件
      inputPaths.forEach(path => {
        command.input(path);
      });

      command
        .on('end', () => {
          console.log('✅ 合并完成');
          resolve(outputPath);
        })
        .on('error', (err) => {
          reject(new Error(`合并失败: ${err.message}`));
        })
        .mergeToFile(outputPath, this.tempDir);
    });
  }

  /**
   * 分割音频为多个段落
   */
  async split(
    inputPath: string,
    segments: Array<{ start: number; end: number }>
  ): Promise<AudioSegment[]> {
    const results: AudioSegment[] = [];

    for (let i = 0; i < segments.length; i++) {
      const { start, end } = segments[i];
      const duration = end - start;
      const outputPath = path.join(this.tempDir, `segment_${i}_${uuidv4()}.wav`);

      await this.trim(inputPath, outputPath, start, duration);

      const data = await fs.readFile(outputPath);

      results.push({
        startTime: start,
        endTime: end,
        duration,
        data
      });

      // 清理临时文件
      await fs.unlink(outputPath);
    }

    return results;
  }

  /**
   * 检测静音段落
   */
  async detectSilence(
    inputPath: string,
    threshold: number = -40,  // dB
    minDuration: number = 0.5 // 秒
  ): Promise<Array<{ start: number; end: number }>> {
    return new Promise((resolve, reject) => {
      const silences: Array<{ start: number; end: number }> = [];
      let currentSilence: { start?: number; end?: number } = {};

      ffmpeg(inputPath)
        .audioFilters(`silencedetect=n=${threshold}dB:d=${minDuration}`)
        .on('stderr', (stderrLine) => {
          // 解析ffmpeg输出的静音检测信息
          const silenceStart = /silence_start: ([\d.]+)/.exec(stderrLine);
          const silenceEnd = /silence_end: ([\d.]+)/.exec(stderrLine);

          if (silenceStart) {
            currentSilence.start = parseFloat(silenceStart[1]);
          }
          if (silenceEnd && currentSilence.start !== undefined) {
            currentSilence.end = parseFloat(silenceEnd[1]);
            silences.push({
              start: currentSilence.start,
              end: currentSilence.end
            });
            currentSilence = {};
          }
        })
        .on('end', () => {
          resolve(silences);
        })
        .on('error', (err) => {
          reject(new Error(`静音检测失败: ${err.message}`));
        })
        // 使用null输出，我们只需要stderr信息
        .output('pipe:1')
        .format('null')
        .run();
    });
  }

  /**
   * 基于静音检测智能分段
   */
  async smartSegment(
    inputPath: string,
    minSegmentDuration: number = 1.0,   // 最小段落长度（秒）
    maxSegmentDuration: number = 30.0,  // 最大段落长度（秒）
    silenceThreshold: number = -40,     // 静音阈值（dB）
    minSilenceDuration: number = 0.5    // 最小静音长度（秒）
  ): Promise<AudioSegment[]> {
    // 1. 获取音频总时长
    const info = await this.getAudioInfo(inputPath);
    const totalDuration = info.duration;

    // 2. 检测静音段落
    const silences = await this.detectSilence(
      inputPath,
      silenceThreshold,
      minSilenceDuration
    );

    console.log(`检测到 ${silences.length} 个静音段落`);

    // 3. 根据静音段落生成分段点
    const segments: Array<{ start: number; end: number }> = [];
    let currentStart = 0;

    for (const silence of silences) {
      const segmentDuration = silence.start - currentStart;

      // 如果当前段落达到最小长度，且没有超过最大长度，就在此处分段
      if (segmentDuration >= minSegmentDuration) {
        segments.push({
          start: currentStart,
          end: silence.start
        });
        currentStart = silence.end;
      }

      // 如果当前段落超过最大长度，强制分段
      if (silence.start - currentStart >= maxSegmentDuration) {
        segments.push({
          start: currentStart,
          end: currentStart + maxSegmentDuration
        });
        currentStart = currentStart + maxSegmentDuration;
      }
    }

    // 处理最后一段
    if (currentStart < totalDuration) {
      segments.push({
        start: currentStart,
        end: totalDuration
      });
    }

    console.log(`生成 ${segments.length} 个音频段落`);

    // 4. 分割音频
    return this.split(inputPath, segments);
  }

  /**
   * Buffer转AudioStream
   */
  bufferToStream(buffer: Buffer): Readable {
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);
    return stream;
  }

  /**
   * 保存Buffer到临时文件
   */
  private async saveToTemp(buffer: Buffer): Promise<string> {
    const filename = `temp_${uuidv4()}.audio`;
    const filepath = path.join(this.tempDir, filename);
    await fs.writeFile(filepath, buffer);
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
   * 清理临时文件
   */
  async cleanTemp(olderThan: number = 3600000): Promise<void> {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();

      for (const file of files) {
        const filepath = path.join(this.tempDir, file);
        const stats = await fs.stat(filepath);

        // 删除超过指定时间的文件
        if (now - stats.mtimeMs > olderThan) {
          await fs.unlink(filepath);
          console.log(`🗑️  清理临时文件: ${file}`);
        }
      }
    } catch (error) {
      console.error('清理临时文件失败:', error);
    }
  }
}

export default AudioProcessor;
