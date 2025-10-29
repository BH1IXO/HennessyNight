/**
 * 音频格式转换服务
 * 使用 FFmpeg 将各种音频格式转换为 Vosk 所需的 WAV 格式
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import path from 'path';
import fs from 'fs/promises';

// 设置 ffmpeg 路径
ffmpeg.setFfmpegPath(ffmpegPath.path);

export interface ConvertOptions {
  inputPath: string;
  outputPath?: string;
  sampleRate?: number;
  channels?: number;
  bitDepth?: number;
}

export class AudioConverter {
  private readonly defaultSampleRate = 16000;  // 16kHz
  private readonly defaultChannels = 1;        // 单声道
  private readonly defaultBitDepth = 16;       // 16位

  /**
   * 将音频文件转换为 Vosk 兼容的 WAV 格式
   * @param options 转换选项
   * @returns 转换后的文件路径
   */
  async convertToVoskFormat(options: ConvertOptions): Promise<string> {
    const {
      inputPath,
      outputPath = this.generateOutputPath(inputPath),
      sampleRate = this.defaultSampleRate,
      channels = this.defaultChannels,
      bitDepth = this.defaultBitDepth
    } = options;

    console.log(`[AudioConverter] 开始转换音频: ${inputPath}`);
    console.log(`[AudioConverter] 目标格式: ${sampleRate}Hz, ${channels}声道, ${bitDepth}位`);

    // 检查输入文件是否存在
    try {
      await fs.access(inputPath);
    } catch (error) {
      throw new Error(`输入文件不存在: ${inputPath}`);
    }

    return new Promise<string>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFrequency(sampleRate)      // 采样率
        .audioChannels(channels)          // 声道数
        .audioBitrate(`${bitDepth}k`)     // 比特率（近似）
        .format('wav')                    // 输出格式
        .audioCodec('pcm_s16le')          // 16位 PCM 编码
        .on('start', (commandLine) => {
          console.log(`[AudioConverter] FFmpeg 命令: ${commandLine}`);
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log(`[AudioConverter] 转换进度: ${progress.percent.toFixed(2)}%`);
          }
        })
        .on('end', () => {
          console.log(`[AudioConverter] 转换完成: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err, _stdout, stderr) => {
          console.error(`[AudioConverter] 转换失败: ${err.message}`);
          console.error(`[AudioConverter] FFmpeg stderr: ${stderr}`);
          reject(new Error(`音频转换失败: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * 获取音频文件信息
   * @param filePath 音频文件路径
   * @returns 音频信息
   */
  async getAudioInfo(filePath: string): Promise<{
    duration: number;
    format: string;
    sampleRate: number;
    channels: number;
    bitrate: number;
  }> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.error(`[AudioConverter] 获取音频信息失败: ${err.message}`);
          reject(new Error(`获取音频信息失败: ${err.message}`));
          return;
        }

        const audioStream = metadata.streams.find(s => s.codec_type === 'audio');
        if (!audioStream) {
          reject(new Error('找不到音频流'));
          return;
        }

        resolve({
          duration: metadata.format.duration || 0,
          format: metadata.format.format_name || 'unknown',
          sampleRate: typeof audioStream.sample_rate === 'number' ? audioStream.sample_rate : parseInt(String(audioStream.sample_rate) || '0'),
          channels: audioStream.channels || 0,
          bitrate: typeof metadata.format.bit_rate === 'number' ? metadata.format.bit_rate : parseInt(String(metadata.format.bit_rate) || '0')
        });
      });
    });
  }

  /**
   * 检查音频文件是否需要转换
   * @param filePath 音频文件路径
   * @returns 是否需要转换
   */
  async needsConversion(filePath: string): Promise<boolean> {
    try {
      const info = await this.getAudioInfo(filePath);
      const ext = path.extname(filePath).toLowerCase();

      // 如果不是 WAV 格式，需要转换
      if (ext !== '.wav') {
        console.log(`[AudioConverter] 文件格式为 ${ext}，需要转换`);
        return true;
      }

      // 如果是 WAV 但参数不符合要求，也需要转换
      if (
        info.sampleRate !== this.defaultSampleRate ||
        info.channels !== this.defaultChannels
      ) {
        console.log(`[AudioConverter] WAV 文件参数不符合要求，需要转换`);
        console.log(`[AudioConverter] 当前: ${info.sampleRate}Hz, ${info.channels}声道`);
        console.log(`[AudioConverter] 需要: ${this.defaultSampleRate}Hz, ${this.defaultChannels}声道`);
        return true;
      }

      console.log(`[AudioConverter] 文件已是正确格式，无需转换`);
      return false;
    } catch (error) {
      console.error(`[AudioConverter] 检查文件时出错: ${error}`);
      // 出错时保守起见，认为需要转换
      return true;
    }
  }

  /**
   * 生成输出文件路径
   * @param inputPath 输入文件路径
   * @returns 输出文件路径
   */
  private generateOutputPath(inputPath: string): string {
    const dir = path.dirname(inputPath);
    const ext = path.extname(inputPath);
    const basename = path.basename(inputPath, ext);
    return path.join(dir, `${basename}_converted.wav`);
  }

  /**
   * 删除临时转换文件
   * @param filePath 文件路径
   */
  async cleanupConvertedFile(filePath: string): Promise<void> {
    try {
      if (filePath.includes('_converted.wav')) {
        await fs.unlink(filePath);
        console.log(`[AudioConverter] 已删除临时文件: ${filePath}`);
      }
    } catch (error) {
      console.error(`[AudioConverter] 删除临时文件失败: ${error}`);
    }
  }
}

export default new AudioConverter();
