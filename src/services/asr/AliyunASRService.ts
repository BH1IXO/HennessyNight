/**
 * 阿里云语音识别服务
 * 使用录音文件识别REST API
 * 文档: https://help.aliyun.com/document_detail/90727.html
 */

import axios from 'axios';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import FormData from 'form-data';

interface AliyunASRConfig {
  accessKeyId: string;
  accessKeySecret: string;
  appKey: string;
  region?: string; // 默认 cn-shanghai
}

interface TranscriptionResult {
  success: boolean;
  text?: string;
  segments?: Array<{
    text: string;
    start: number;
    end: number;
    speaker?: {
      name: string;
      confidence: number;
    };
  }>;
  error?: string;
}

export class AliyunASRService {
  private config: AliyunASRConfig;
  private endpoint: string;

  constructor(config: AliyunASRConfig) {
    this.config = config;
    const region = config.region || 'cn-shanghai';
    this.endpoint = `https://nls-meta.${region}.aliyuncs.com`;
  }

  /**
   * 转录音频文件
   */
  async transcribeFile(audioFilePath: string): Promise<TranscriptionResult> {
    try {
      console.log(`[AliyunASR] 开始转录: ${audioFilePath}`);

      // 1. 提交录音文件识别请求
      const taskId = await this.submitTask(audioFilePath);
      console.log(`[AliyunASR] 任务已提交: ${taskId}`);

      // 2. 轮询查询结果
      const result = await this.pollTaskResult(taskId);
      console.log(`[AliyunASR] 转录完成`);

      return result;
    } catch (error: any) {
      console.error(`[AliyunASR] 转录失败:`, error);
      return {
        success: false,
        error: error.message || '转录失败'
      };
    }
  }

  /**
   * 提交识别任务
   */
  private async submitTask(audioFilePath: string): Promise<string> {
    const url = `${this.endpoint}/pop/2018-08-08/fileTranscribe`;

    // 读取音频文件
    const audioData = await fs.readFile(audioFilePath);

    // 构建请求参数
    const timestamp = new Date().toISOString();
    const nonce = crypto.randomUUID();

    const params = {
      appkey: this.config.appKey,
      format: 'wav',
      sample_rate: 16000,
      enable_words: true, // 启用词级别时间戳
      timestamp,
      signature_method: 'HMAC-SHA1',
      signature_version: '1.0',
      signature_nonce: nonce,
      access_key_id: this.config.accessKeyId,
    };

    // 生成签名
    const signature = this.generateSignature('POST', params);

    // 构建表单数据
    const formData = new FormData();
    formData.append('appkey', this.config.appKey);
    formData.append('format', 'wav');
    formData.append('sample_rate', '16000');
    formData.append('enable_words', 'true');
    formData.append('timestamp', timestamp);
    formData.append('signature_method', 'HMAC-SHA1');
    formData.append('signature_version', '1.0');
    formData.append('signature_nonce', nonce);
    formData.append('access_key_id', this.config.accessKeyId);
    formData.append('signature', signature);
    formData.append('file', audioData, {
      filename: 'audio.wav',
      contentType: 'audio/wav'
    });

    // 发送请求
    const response = await axios.post(url, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 30000
    });

    if (response.data.status !== 'SUCCESS') {
      throw new Error(`提交任务失败: ${response.data.message || 'Unknown error'}`);
    }

    return response.data.task_id;
  }

  /**
   * 轮询查询任务结果
   */
  private async pollTaskResult(taskId: string, maxAttempts: number = 60): Promise<TranscriptionResult> {
    const url = `${this.endpoint}/pop/2018-08-08/fileTranscribeResult`;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // 等待3秒后查询
      await this.sleep(3000);

      const timestamp = new Date().toISOString();
      const nonce = crypto.randomUUID();

      const params = {
        task_id: taskId,
        timestamp,
        signature_method: 'HMAC-SHA1',
        signature_version: '1.0',
        signature_nonce: nonce,
        access_key_id: this.config.accessKeyId,
      };

      const signature = this.generateSignature('GET', params);

      const response = await axios.get(url, {
        params: {
          ...params,
          signature
        },
        timeout: 10000
      });

      const status = response.data.status;

      if (status === 'SUCCESS') {
        // 解析结果
        return this.parseResult(response.data.result);
      } else if (status === 'FAILED') {
        throw new Error(`识别失败: ${response.data.message || 'Unknown error'}`);
      }

      // RUNNING 或 QUEUEING 状态，继续轮询
      console.log(`[AliyunASR] 任务状态: ${status}, 等待中... (${attempt + 1}/${maxAttempts})`);
    }

    throw new Error('识别超时');
  }

  /**
   * 解析识别结果
   */
  private parseResult(resultJson: string): TranscriptionResult {
    try {
      const result = JSON.parse(resultJson);
      const sentences = result.sentences || [];

      const segments = sentences.map((sentence: any) => ({
        text: sentence.text,
        start: sentence.begin_time / 1000, // 毫秒转秒
        end: sentence.end_time / 1000,
        speaker: {
          name: '未识别',
          confidence: 0
        }
      }));

      const fullText = sentences.map((s: any) => s.text).join('');

      return {
        success: true,
        text: fullText,
        segments
      };
    } catch (error: any) {
      throw new Error(`解析结果失败: ${error.message}`);
    }
  }

  /**
   * 生成签名
   */
  private generateSignature(method: string, params: Record<string, any>): string {
    // 1. 对参数进行排序
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${this.percentEncode(key)}=${this.percentEncode(params[key])}`)
      .join('&');

    // 2. 构造待签名字符串
    const stringToSign = `${method}&${this.percentEncode('/')}&${this.percentEncode(sortedParams)}`;

    // 3. 计算签名
    const signature = crypto
      .createHmac('sha1', this.config.accessKeySecret + '&')
      .update(stringToSign)
      .digest('base64');

    return signature;
  }

  /**
   * URL编码
   */
  private percentEncode(str: string): string {
    return encodeURIComponent(str)
      .replace(/\*/g, '%2A')
      .replace(/'/g, '%27')
      .replace(/~/g, '%7E')
      .replace(/%20/g, '+');
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// 导出单例
let aliyunASRInstance: AliyunASRService | null = null;

export function getAliyunASRService(): AliyunASRService {
  if (!aliyunASRInstance) {
    const config = {
      accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
      accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
      appKey: process.env.ALIYUN_ASR_APP_KEY || '',
      region: process.env.ALIYUN_REGION || 'cn-shanghai'
    };

    if (!config.accessKeyId || !config.accessKeySecret || !config.appKey) {
      throw new Error('阿里云ASR配置不完整，请检查环境变量');
    }

    aliyunASRInstance = new AliyunASRService(config);
  }

  return aliyunASRInstance;
}
