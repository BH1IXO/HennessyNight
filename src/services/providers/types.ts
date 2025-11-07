/**
 * 服务提供商统一接口定义
 */

// ==================== 转录服务 ====================

export interface TranscriptionOptions {
  language?: string;           // 语言代码，如 'zh-CN', 'en-US'
  sampleRate?: number;        // 采样率
  enablePunctuation?: boolean; // 启用标点符号
  enableWordTimestamp?: boolean; // 启用词级时间戳
  hotWords?: string[];        // 热词
}

export interface TranscriptSegment {
  text: string;
  startTime: number;  // 秒
  endTime: number;    // 秒
  confidence?: number; // 置信度 0-1
  speaker?: string;   // 说话人标识
  words?: Array<{
    word: string;
    startTime: number;
    endTime: number;
    confidence?: number;
  }>;
}

export interface TranscriptResult {
  text?: string;            // 完整文本（别名）
  segments: TranscriptSegment[];
  fullText: string;
  language?: string;
  duration?: number;
  metadata?: Record<string, any>; // 额外元数据，如句子信息
}

export interface TranscriptionStatus {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number; // 0-100
  result?: TranscriptResult;
  error?: string;
}

export interface RealtimeConfig {
  language?: string;
  sampleRate?: number;
  onTranscript?: (text: string, isFinal: boolean) => void; // 实时转录回调
  onResult?: (result: TranscriptSegment) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
}

export interface ITranscriptionProvider {
  readonly name: string;
  readonly type: 'iflytek' | 'tencent' | 'azure' | 'whisper' | 'funasr' | 'vosk';

  // 实时转录（WebSocket）
  startRealtime(config: RealtimeConfig): Promise<void>;
  sendAudio(audioData: Buffer): Promise<void>;
  stopRealtime(): Promise<void>;

  // 批量转录（HTTP API）
  transcribeFile(
    audioFile: Buffer,
    options?: TranscriptionOptions
  ): Promise<TranscriptResult>;

  // 查询转录状态（用于长音频异步处理）
  getStatus?(taskId: string): Promise<TranscriptionStatus>;

  // 健康检查
  healthCheck(): Promise<boolean>;
}

// ==================== 声纹识别服务 ====================

export interface VoiceprintProfile {
  profileId: string;
  userId: string;
  status: 'created' | 'enrolling' | 'enrolled' | 'failed';
  enrollmentProgress?: number; // 0-100
  metadata?: Record<string, any>;
}

export interface EnrollmentResult {
  success: boolean;
  profileId: string;
  enrollmentProgress: number; // 已训练进度 0-100
  remainingEnrollments?: number; // 还需要多少次训练
  message?: string;
}

export interface IdentificationResult {
  identified: boolean;
  profileId?: string;
  speakerId?: string;    // 别名，等同于profileId
  confidence?: number; // 0-1
  candidates?: Array<{
    profileId: string;
    confidence: number;
  }>;
}

export interface VerificationResult {
  verified: boolean;
  confidence: number; // 0-1
  threshold?: number; // 验证阈值
}

export interface DiarizationSegment {
  speaker: string;      // 说话人标识，如 'SPEAKER_01'
  startTime: number;    // 秒
  endTime: number;      // 秒
  confidence?: number;
}

export interface DiarizationResult {
  segments: DiarizationSegment[];
  numSpeakers?: number; // 检测到的说话人数量
}

export interface IVoiceprintProvider {
  readonly name: string;
  readonly type: 'pyannote' | 'iflytek' | 'tencent' | 'azure' | 'speechbrain';

  // 创建声纹档案
  createProfile(userId: string): Promise<VoiceprintProfile>;

  // 训练声纹（可能需要多次调用）
  enrollProfile(
    profileId: string,
    audioData: Buffer
  ): Promise<EnrollmentResult>;

  // 删除声纹档案
  deleteProfile(profileId: string): Promise<void>;

  // 1:N识别（从多个声纹中识别说话人）
  identifySpeaker(
    audioData: Buffer,
    candidateProfileIds: string[]
  ): Promise<IdentificationResult>;

  // 1:1验证（验证音频是否为某人）
  verifySpeaker(
    profileId: string,
    audioData: Buffer
  ): Promise<VerificationResult>;

  // 说话人分离（不需要预先注册声纹）
  diarization(audioData: Buffer): Promise<DiarizationResult>;

  // 健康检查
  healthCheck(): Promise<boolean>;
}

// ==================== 通用错误类型 ====================

export class ProviderError extends Error {
  constructor(
    public provider: string,
    public code: string,
    message: string,
    public details?: any
  ) {
    super(`[${provider}] ${message}`);
    this.name = 'ProviderError';
  }
}

export class AudioFormatError extends ProviderError {
  constructor(provider: string, message: string) {
    super(provider, 'AUDIO_FORMAT_ERROR', message);
    this.name = 'AudioFormatError';
  }
}

export class ProfileNotFoundError extends ProviderError {
  constructor(provider: string, profileId: string) {
    super(provider, 'PROFILE_NOT_FOUND', `Profile ${profileId} not found`);
    this.name = 'ProfileNotFoundError';
  }
}

export class InsufficientEnrollmentError extends ProviderError {
  constructor(provider: string, message: string) {
    super(provider, 'INSUFFICIENT_ENROLLMENT', message);
    this.name = 'InsufficientEnrollmentError';
  }
}
