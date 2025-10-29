/**
 * 讯飞语音转录服务
 * 文档：https://www.xfyun.cn/doc/asr/voicedictation/API.html
 */

import WebSocket from 'ws';
import crypto from 'crypto';
import { URL } from 'url';
import axios from 'axios';
import FormData from 'form-data';
import {
  ITranscriptionProvider,
  TranscriptionOptions,
  TranscriptResult,
  TranscriptSegment,
  TranscriptionStatus,
  RealtimeConfig,
  ProviderError
} from '../types';

interface IFlytekConfig {
  appId: string;
  apiKey: string;
  apiSecret: string;
}

export class IFlytekTranscriptionProvider implements ITranscriptionProvider {
  readonly name = 'iFlytek Speech Recognition';
  readonly type = 'iflytek' as const;

  private config: IFlytekConfig;
  private ws: WebSocket | null = null;
  private realtimeConfig: RealtimeConfig | null = null;
  private audioBuffer: Buffer[] = [];

  // 讯飞实时转录WebSocket地址
  private readonly REALTIME_URL = 'wss://iat-api.xfyun.cn/v2/iat';
  // 讯飞录音文件识别接口
  private readonly FILE_URL = 'https://raasr.xfyun.cn/api/upload';

  constructor(config: IFlytekConfig) {
    this.config = config;
  }

  /**
   * 实时转录 - WebSocket
   */
  async startRealtime(config: RealtimeConfig): Promise<void> {
    this.realtimeConfig = config;
    this.audioBuffer = [];

    const wsUrl = this.generateRealtimeUrl(config);

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
          console.log('✅ 讯飞实时转录连接成功');
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleRealtimeMessage(data);
        });

        this.ws.on('error', (error) => {
          console.error('❌ 讯飞实时转录错误:', error);
          if (this.realtimeConfig?.onError) {
            this.realtimeConfig.onError(error);
          }
          reject(error);
        });

        this.ws.on('close', () => {
          console.log('🔌 讯飞实时转录连接关闭');
          if (this.realtimeConfig?.onComplete) {
            this.realtimeConfig.onComplete();
          }
        });
      } catch (error) {
        reject(new ProviderError('iflytek', 'CONNECTION_ERROR', 'Failed to connect', error));
      }
    });
  }

  /**
   * 发送音频数据
   */
  async sendAudio(audioData: Buffer): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new ProviderError('iflytek', 'NOT_CONNECTED', 'WebSocket not connected');
    }

    // 讯飞要求音频数据需要base64编码
    const audioBase64 = audioData.toString('base64');

    const frame = {
      data: {
        status: 1, // 0:首帧, 1:中间帧, 2:尾帧
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: audioBase64
      }
    };

    this.ws.send(JSON.stringify(frame));
  }

  /**
   * 停止实时转录
   */
  async stopRealtime(): Promise<void> {
    if (!this.ws) return;

    // 发送结束帧
    const endFrame = {
      data: {
        status: 2, // 结束帧
        format: 'audio/L16;rate=16000',
        encoding: 'raw',
        audio: ''
      }
    };

    this.ws.send(JSON.stringify(endFrame));

    // 等待一小段时间让服务器处理
    await new Promise(resolve => setTimeout(resolve, 500));

    this.ws.close();
    this.ws = null;
    this.realtimeConfig = null;
  }

  /**
   * 批量转录文件
   */
  async transcribeFile(
    audioFile: Buffer,
    options?: TranscriptionOptions
  ): Promise<TranscriptResult> {
    try {
      // 1. 上传音频文件
      const uploadResult = await this.uploadAudioFile(audioFile);

      // 2. 轮询获取结果
      const result = await this.pollTranscriptionResult(uploadResult.orderId);

      return result;
    } catch (error) {
      throw new ProviderError(
        'iflytek',
        'TRANSCRIPTION_ERROR',
        'Failed to transcribe file',
        error
      );
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      // 简单测试：生成签名URL
      const testUrl = this.generateRealtimeUrl({
        language: 'zh-CN',
        sampleRate: 16000
      });
      return testUrl.length > 0;
    } catch (error) {
      return false;
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 生成实时转录WebSocket URL（带鉴权）
   */
  private generateRealtimeUrl(config: RealtimeConfig): string {
    const host = 'iat-api.xfyun.cn';
    const path = '/v2/iat';
    const date = new Date().toUTCString();

    // 生成签名
    const signatureOrigin = `host: ${host}\ndate: ${date}\nGET ${path} HTTP/1.1`;
    const signature = crypto
      .createHmac('sha256', this.config.apiSecret)
      .update(signatureOrigin)
      .digest('base64');

    const authorizationOrigin = `api_key="${this.config.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
    const authorization = Buffer.from(authorizationOrigin).toString('base64');

    // 构建URL
    const url = new URL(`wss://${host}${path}`);
    url.searchParams.append('authorization', authorization);
    url.searchParams.append('date', date);
    url.searchParams.append('host', host);

    return url.toString();
  }

  /**
   * 处理实时转录消息
   */
  private handleRealtimeMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      if (message.code !== 0) {
        const error = new Error(`讯飞错误: ${message.message}`);
        if (this.realtimeConfig?.onError) {
          this.realtimeConfig.onError(error);
        }
        return;
      }

      // 解析识别结果
      if (message.data && message.data.result) {
        const ws = message.data.result.ws;
        let text = '';

        for (const w of ws) {
          for (const cw of w.cw) {
            text += cw.w;
          }
        }

        if (text && this.realtimeConfig?.onResult) {
          const segment: TranscriptSegment = {
            text,
            startTime: 0, // 讯飞实时转录不提供精确时间
            endTime: 0,
            confidence: message.data.result.confidence
          };
          this.realtimeConfig.onResult(segment);
        }
      }

      // 检查是否结束
      if (message.data && message.data.status === 2) {
        console.log('✅ 讯飞实时转录完成');
      }
    } catch (error) {
      console.error('❌ 解析讯飞消息失败:', error);
      if (this.realtimeConfig?.onError) {
        this.realtimeConfig.onError(error as Error);
      }
    }
  }

  /**
   * 上传音频文件到讯飞
   */
  private async uploadAudioFile(audioFile: Buffer): Promise<{ orderId: string }> {
    const timestamp = Math.floor(Date.now() / 1000);
    const baseString = this.config.appId + timestamp;
    const md5 = crypto.createHash('md5').update(baseString).digest('hex');
    const signature = crypto
      .createHmac('sha1', this.config.apiSecret)
      .update(md5)
      .digest('base64');

    const formData = new FormData();
    formData.append('appId', this.config.appId);
    formData.append('signa', signature);
    formData.append('ts', timestamp.toString());
    formData.append('fileSize', audioFile.length.toString());
    formData.append('fileName', 'audio.wav');
    formData.append('duration', '60'); // 预估时长
    formData.append('file', audioFile, {
      filename: 'audio.wav',
      contentType: 'audio/wav'
    });

    const response = await axios.post(this.FILE_URL, formData, {
      headers: formData.getHeaders(),
      timeout: 30000
    });

    if (response.data.code !== '000000') {
      throw new Error(`讯飞上传失败: ${response.data.descInfo}`);
    }

    return { orderId: response.data.content.orderId };
  }

  /**
   * 轮询转录结果
   */
  private async pollTranscriptionResult(
    orderId: string,
    maxAttempts: number = 60
  ): Promise<TranscriptResult> {
    const checkUrl = 'https://raasr.xfyun.cn/api/getResult';

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒

      const timestamp = Math.floor(Date.now() / 1000);
      const baseString = this.config.appId + timestamp;
      const md5 = crypto.createHash('md5').update(baseString).digest('hex');
      const signature = crypto
        .createHmac('sha1', this.config.apiSecret)
        .update(md5)
        .digest('base64');

      const response = await axios.post(checkUrl, {
        appId: this.config.appId,
        signa: signature,
        ts: timestamp.toString(),
        orderId
      });

      if (response.data.code !== '000000') {
        throw new Error(`讯飞查询失败: ${response.data.descInfo}`);
      }

      const status = response.data.content.orderInfo.status;

      if (status === 4) {
        // 转写完成
        return this.parseIFlytekResult(response.data.content);
      } else if (status === 5) {
        // 转写失败
        throw new Error(`讯飞转写失败: ${response.data.content.orderInfo.failType}`);
      }

      console.log(`⏳ 讯飞转写进行中... (${i + 1}/${maxAttempts})`);
    }

    throw new Error('讯飞转写超时');
  }

  /**
   * 解析讯飞转录结果
   */
  private parseIFlytekResult(content: any): TranscriptResult {
    const segments: TranscriptSegment[] = [];
    let fullText = '';

    if (content.orderResult && content.orderResult.lattice) {
      const lattice = JSON.parse(content.orderResult.lattice);

      for (const item of lattice) {
        const json1Best = JSON.parse(item.json_1best);
        const st = json1Best.st;

        for (const rtItem of st.rt) {
          for (const wsItem of rtItem.ws) {
            let text = '';
            for (const cwItem of wsItem.cw) {
              text += cwItem.w;
            }

            const segment: TranscriptSegment = {
              text,
              startTime: wsItem.bg / 1000, // 毫秒转秒
              endTime: wsItem.ed / 1000,
              confidence: wsItem.rl
            };

            segments.push(segment);
            fullText += text;
          }
        }
      }
    }

    return {
      segments,
      fullText,
      language: 'zh-CN'
    };
  }
}

export default IFlytekTranscriptionProvider;
