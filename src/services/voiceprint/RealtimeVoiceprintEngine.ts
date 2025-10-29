/**
 * 实时声纹识别引擎 ⭐
 *
 * 核心功能：
 * 1. 实时音频流处理
 * 2. 实时转录（讯飞）+ 实时声纹识别（pyannote.audio）
 * 3. 说话人识别：根据声纹库匹配已注册说话人
 * 4. 事件驱动架构，实时返回结果
 *
 * 工作流程：
 * 1. 接收实时音频流
 * 2. 音频缓冲与分块
 * 3. 并行处理：
 *    - 讯飞实时转录 -> 获取文本
 *    - pyannote分离说话人 -> 获取说话人片段
 * 4. 声纹匹配：将检测到的说话人与数据库进行匹配
 * 5. 合并结果：文本 + 说话人标签
 * 6. 实时推送结果
 */

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { ITranscriptionProvider, IVoiceprintProvider } from '../providers/types';
import { AudioProcessor } from '../audio/AudioProcessor';
import path from 'path';
import fs from 'fs/promises';

// ============= 类型定义 =============

export interface RealtimeEngineConfig {
  // 音频配置
  sampleRate: number;              // 采样率，默认16000
  channels: number;                // 声道数，默认1

  // 缓冲配置
  bufferDuration: number;          // 缓冲时长（秒），默认3秒
  processingInterval: number;      // 处理间隔（毫秒），默认1000ms

  // 识别配置
  identificationThreshold: number; // 声纹匹配阈值，默认0.75
  minSpeechDuration: number;       // 最小有效语音时长（秒），默认1秒

  // 数据库配置
  enableSpeakerEnrollment: boolean; // 是否自动注册新说话人
  candidateSpeakerIds?: string[];   // 候选说话人ID列表（用于1:N识别）
}

export interface TranscriptSegment {
  text: string;                    // 转录文本
  startTime: number;               // 开始时间（秒）
  endTime: number;                 // 结束时间（秒）
  speakerId?: string;              // 匹配到的说话人ID
  speakerName?: string;            // 说话人姓名
  confidence: number;              // 识别置信度
  isUnknownSpeaker: boolean;       // 是否为未知说话人
}

export interface RealtimeEngineEvents {
  'transcript': (segment: TranscriptSegment) => void;
  'speaker_identified': (speakerId: string, speakerName: string, confidence: number) => void;
  'speaker_unknown': (embeddingId: string) => void;
  'error': (error: Error) => void;
  'status': (status: EngineStatus) => void;
}

export enum EngineStatus {
  IDLE = 'idle',
  STARTING = 'starting',
  RUNNING = 'running',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  ERROR = 'error'
}

// ============= 实时声纹识别引擎 =============

export class RealtimeVoiceprintEngine extends EventEmitter {
  private prisma: PrismaClient;
  private transcriptionProvider: ITranscriptionProvider;
  private voiceprintProvider: IVoiceprintProvider;
  private audioProcessor: AudioProcessor;

  private config: RealtimeEngineConfig;
  private status: EngineStatus = EngineStatus.IDLE;

  // 音频缓冲
  private audioBuffer: Buffer[] = [];
  private bufferStartTime: number = 0;
  private currentTime: number = 0;

  // 处理队列
  private processingTimer?: NodeJS.Timeout;
  private isProcessing: boolean = false;

  // 会话信息
  private sessionId?: string;
  private meetingId?: string;

  // 说话人缓存
  private speakerCache: Map<string, { id: string; name: string; embedding: number[] }> = new Map();

  // 临时文件
  private tempDir: string;

  constructor(
    transcriptionProvider: ITranscriptionProvider,
    voiceprintProvider: IVoiceprintProvider,
    config: Partial<RealtimeEngineConfig> = {}
  ) {
    super();

    this.prisma = new PrismaClient();
    this.transcriptionProvider = transcriptionProvider;
    this.voiceprintProvider = voiceprintProvider;
    this.audioProcessor = new AudioProcessor();

    // 配置默认值
    this.config = {
      sampleRate: 16000,
      channels: 1,
      bufferDuration: 3,
      processingInterval: 1000,
      identificationThreshold: 0.75,
      minSpeechDuration: 1.0,
      enableSpeakerEnrollment: false,
      ...config
    };

    this.tempDir = path.join(process.cwd(), 'temp', 'realtime');
    this.initTempDir();
  }

  // ============= 公共API =============

  /**
   * 启动实时识别引擎
   */
  async start(meetingId: string, candidateSpeakerIds?: string[]): Promise<void> {
    if (this.status === EngineStatus.RUNNING) {
      throw new Error('引擎已在运行中');
    }

    try {
      this.setStatus(EngineStatus.STARTING);
      this.meetingId = meetingId;

      // 设置候选说话人
      if (candidateSpeakerIds) {
        this.config.candidateSpeakerIds = candidateSpeakerIds;
      }

      // 加载候选说话人声纹数据到缓存
      await this.loadSpeakerCache();

      // 启动转录服务
      await this.transcriptionProvider.startRealtime({
        onTranscript: (text, isFinal) => {
          this.handleTranscript(text, isFinal);
        },
        onError: (error) => {
          this.emit('error', error);
        },
        language: 'zh_cn',
        enablePunctuation: true,
        enableNumberConversion: true
      });

      // 重置状态
      this.audioBuffer = [];
      this.bufferStartTime = Date.now();
      this.currentTime = 0;

      // 启动处理定时器
      this.processingTimer = setInterval(() => {
        this.processBuffer();
      }, this.config.processingInterval);

      this.setStatus(EngineStatus.RUNNING);
      console.log('✅ 实时声纹识别引擎已启动');

    } catch (error) {
      this.setStatus(EngineStatus.ERROR);
      throw error;
    }
  }

  /**
   * 停止实时识别引擎
   */
  async stop(): Promise<void> {
    if (this.status !== EngineStatus.RUNNING) {
      return;
    }

    try {
      this.setStatus(EngineStatus.STOPPING);

      // 处理剩余缓冲
      if (this.audioBuffer.length > 0) {
        await this.processBuffer();
      }

      // 停止转录服务
      await this.transcriptionProvider.stopRealtime();

      // 清理定时器
      if (this.processingTimer) {
        clearInterval(this.processingTimer);
        this.processingTimer = undefined;
      }

      // 清空缓冲和缓存
      this.audioBuffer = [];
      this.speakerCache.clear();

      this.setStatus(EngineStatus.IDLE);
      console.log('✅ 实时声纹识别引擎已停止');

    } catch (error) {
      this.setStatus(EngineStatus.ERROR);
      throw error;
    }
  }

  /**
   * 发送音频数据
   */
  async sendAudio(audioData: Buffer): Promise<void> {
    if (this.status !== EngineStatus.RUNNING) {
      throw new Error('引擎未运行');
    }

    try {
      // 1. 发送到转录服务（实时）
      await this.transcriptionProvider.sendAudio(audioData);

      // 2. 添加到缓冲区（用于声纹识别）
      this.audioBuffer.push(audioData);

      // 3. 更新时间
      const audioDuration = audioData.length / (this.config.sampleRate * 2); // 16位PCM
      this.currentTime += audioDuration;

    } catch (error) {
      this.emit('error', error as Error);
    }
  }

  /**
   * 暂停/恢复
   */
  pause(): void {
    if (this.status === EngineStatus.RUNNING) {
      this.setStatus(EngineStatus.PAUSED);
    }
  }

  resume(): void {
    if (this.status === EngineStatus.PAUSED) {
      this.setStatus(EngineStatus.RUNNING);
    }
  }

  /**
   * 获取当前状态
   */
  getStatus(): EngineStatus {
    return this.status;
  }

  // ============= 核心处理逻辑 =============

  /**
   * 处理音频缓冲区
   * 定期触发，进行声纹识别和说话人匹配
   */
  private async processBuffer(): Promise<void> {
    if (this.isProcessing || this.audioBuffer.length === 0) {
      return;
    }

    // 检查缓冲时长是否足够
    const bufferDuration = this.audioBuffer.reduce((acc, buf) => {
      return acc + buf.length / (this.config.sampleRate * 2);
    }, 0);

    if (bufferDuration < this.config.bufferDuration) {
      return; // 缓冲不足，等待更多数据
    }

    this.isProcessing = true;

    try {
      // 1. 合并缓冲区音频
      const audioData = Buffer.concat(this.audioBuffer);

      // 2. 保存到临时文件
      const tempAudioPath = await this.saveTempAudio(audioData);

      // 3. 转换为标准格式
      const processedAudioPath = path.join(
        this.tempDir,
        `processed_${Date.now()}.wav`
      );
      await this.audioProcessor.convertToStandardWav(tempAudioPath, processedAudioPath);

      // 4. 执行说话人分离
      const diarizationResult = await this.voiceprintProvider.diarization(
        await fs.readFile(processedAudioPath)
      );

      console.log(`📊 检测到 ${diarizationResult.numSpeakers} 个说话人`);

      // 5. 为每个说话人片段进行识别
      for (const segment of diarizationResult.segments) {
        await this.identifySpeakerSegment(
          processedAudioPath,
          segment,
          this.bufferStartTime
        );
      }

      // 6. 清理临时文件
      await fs.unlink(tempAudioPath);
      await fs.unlink(processedAudioPath);

      // 7. 清空缓冲区
      this.audioBuffer = [];
      this.bufferStartTime = Date.now();

    } catch (error) {
      console.error('❌ 缓冲处理失败:', error);
      this.emit('error', error as Error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 识别说话人片段
   */
  private async identifySpeakerSegment(
    audioPath: string,
    segment: any,
    bufferStartTime: number
  ): Promise<void> {
    try {
      // 检查片段时长
      const duration = segment.end - segment.start;
      if (duration < this.config.minSpeechDuration) {
        console.log(`⏭️  跳过过短片段: ${duration.toFixed(2)}s`);
        return;
      }

      // 1. 提取片段音频
      const segmentPath = path.join(this.tempDir, `segment_${Date.now()}.wav`);
      await this.audioProcessor.trim(audioPath, segmentPath, segment.start, duration);

      // 2. 读取音频数据
      const segmentData = await fs.readFile(segmentPath);

      // 3. 执行说话人识别
      let speakerId: string | undefined;
      let speakerName: string | undefined;
      let confidence: number = 0;
      let isUnknown = true;

      if (this.config.candidateSpeakerIds && this.config.candidateSpeakerIds.length > 0) {
        // 1:N 识别（有候选说话人）
        const identifyResult = await this.voiceprintProvider.identifySpeaker(
          segmentData,
          this.config.candidateSpeakerIds
        );

        if (identifyResult.speakerId && identifyResult.confidence >= this.config.identificationThreshold) {
          speakerId = identifyResult.speakerId;
          confidence = identifyResult.confidence;
          isUnknown = false;

          // 从缓存获取说话人信息
          const cached = this.speakerCache.get(speakerId);
          if (cached) {
            speakerName = cached.name;
          } else {
            // 从数据库获取
            const speaker = await this.prisma.speaker.findUnique({
              where: { id: speakerId }
            });
            if (speaker) {
              speakerName = speaker.name;
            }
          }

          console.log(`✅ 识别到说话人: ${speakerName} (置信度: ${(confidence * 100).toFixed(1)}%)`);
          this.emit('speaker_identified', speakerId, speakerName || 'Unknown', confidence);
        } else {
          console.log(`❓ 未识别到已注册说话人 (置信度: ${(identifyResult.confidence * 100).toFixed(1)}%)`);
          this.emit('speaker_unknown', segment.speaker);
        }
      } else {
        // 纯说话人分离模式（无候选说话人）
        console.log(`👤 检测到说话人: ${segment.speaker}`);
        this.emit('speaker_unknown', segment.speaker);
      }

      // 4. 保存到数据库（如果有会议ID）
      if (this.meetingId) {
        await this.saveTranscriptSegment({
          meetingId: this.meetingId,
          speakerId: speakerId,
          speakerLabel: speakerName || segment.speaker,
          text: '', // 转录文本由handleTranscript处理
          startTime: segment.start,
          endTime: segment.end,
          confidence: confidence,
          isUnknown: isUnknown
        });
      }

      // 5. 清理临时文件
      await fs.unlink(segmentPath);

    } catch (error) {
      console.error('❌ 说话人片段识别失败:', error);
      this.emit('error', error as Error);
    }
  }

  /**
   * 处理转录结果
   */
  private handleTranscript(text: string, isFinal: boolean): void {
    if (!isFinal) {
      return; // 只处理最终结果
    }

    console.log(`📝 转录: ${text}`);

    // 转录结果与声纹识别结果的合并在数据库层面进行
    // 这里只发出事件，具体关联由上层业务逻辑处理

    // 可以通过时间戳匹配转录文本和说话人
    // 这部分逻辑可以在后续优化中实现更精确的对齐
  }

  // ============= 辅助方法 =============

  /**
   * 加载说话人缓存
   */
  private async loadSpeakerCache(): Promise<void> {
    if (!this.config.candidateSpeakerIds || this.config.candidateSpeakerIds.length === 0) {
      return;
    }

    try {
      const speakers = await this.prisma.speaker.findMany({
        where: {
          id: { in: this.config.candidateSpeakerIds },
          profileStatus: 'ENROLLED'
        }
      });

      for (const speaker of speakers) {
        if (speaker.voiceprintData) {
          const voiceprintData = speaker.voiceprintData as any;
          this.speakerCache.set(speaker.id, {
            id: speaker.id,
            name: speaker.name,
            embedding: voiceprintData.embedding || []
          });
        }
      }

      console.log(`✅ 加载 ${this.speakerCache.size} 个说话人声纹数据到缓存`);

    } catch (error) {
      console.error('❌ 加载说话人缓存失败:', error);
      throw error;
    }
  }

  /**
   * 保存转录片段到数据库
   */
  private async saveTranscriptSegment(data: {
    meetingId: string;
    speakerId?: string;
    speakerLabel: string;
    text: string;
    startTime: number;
    endTime: number;
    confidence: number;
    isUnknown: boolean;
  }): Promise<void> {
    try {
      await this.prisma.transcriptMessage.create({
        data: {
          meetingId: data.meetingId,
          speakerId: data.speakerId,
          speakerLabel: data.speakerLabel,
          content: data.text,
          timestamp: new Date(this.bufferStartTime + data.startTime * 1000),
          confidence: data.confidence
        }
      });
    } catch (error) {
      console.error('❌ 保存转录片段失败:', error);
    }
  }

  /**
   * 保存临时音频文件
   */
  private async saveTempAudio(audioData: Buffer): Promise<string> {
    const filename = `audio_${Date.now()}.raw`;
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
   * 设置状态
   */
  private setStatus(status: EngineStatus): void {
    this.status = status;
    this.emit('status', status);
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    await this.stop();
    await this.prisma.$disconnect();
  }
}

export default RealtimeVoiceprintEngine;
