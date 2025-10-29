/**
 * pyannote.audio 声纹识别服务
 * 文档：https://github.com/pyannote/pyannote-audio
 *
 * 注意：需要Python环境和pyannote.audio库
 */

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import {
  IVoiceprintProvider,
  VoiceprintProfile,
  EnrollmentResult,
  IdentificationResult,
  VerificationResult,
  DiarizationResult,
  DiarizationSegment,
  ProviderError,
  ProfileNotFoundError
} from '../types';

interface PyannoteConfig {
  pythonPath?: string;        // Python解释器路径
  modelPath?: string;         // 模型路径
  device?: 'cpu' | 'cuda';    // 运行设备
  tempDir?: string;           // 临时文件目录
  minSpeakers?: number;       // 最小说话人数
  maxSpeakers?: number;       // 最大说话人数
}

interface StoredProfile {
  profileId: string;
  userId: string;
  embeddings: number[][];     // 声纹特征向量
  enrollmentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export class PyannoteVoiceprintProvider implements IVoiceprintProvider {
  readonly name = 'pyannote.audio Speaker Recognition';
  readonly type = 'pyannote' as const;

  private config: PyannoteConfig;
  private profiles: Map<string, StoredProfile> = new Map();
  private tempDir: string;

  constructor(config: PyannoteConfig = {}) {
    this.config = {
      pythonPath: config.pythonPath || 'python',
      modelPath: config.modelPath || 'pyannote/speaker-diarization',
      device: config.device || 'cpu',
      tempDir: config.tempDir || path.join(process.cwd(), 'temp', 'pyannote'),
      minSpeakers: config.minSpeakers || 1,
      maxSpeakers: config.maxSpeakers || 10
    };

    this.tempDir = this.config.tempDir!;
    this.initTempDir();
  }

  /**
   * 创建声纹档案
   */
  async createProfile(userId: string): Promise<VoiceprintProfile> {
    const profileId = `pyannote_${uuidv4()}`;

    const profile: StoredProfile = {
      profileId,
      userId,
      embeddings: [],
      enrollmentCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.profiles.set(profileId, profile);

    return {
      profileId,
      userId,
      status: 'created',
      enrollmentProgress: 0
    };
  }

  /**
   * 训练声纹
   * pyannote不需要显式训练，每次调用都提取embeddings
   */
  async enrollProfile(
    profileId: string,
    audioData: Buffer
  ): Promise<EnrollmentResult> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new ProfileNotFoundError('pyannote', profileId);
    }

    try {
      // 保存音频到临时文件
      const audioPath = await this.saveAudioTemp(audioData);

      // 提取声纹特征
      const embeddings = await this.extractEmbeddings(audioPath);

      // 保存embeddings
      profile.embeddings.push(...embeddings);
      profile.enrollmentCount++;
      profile.updatedAt = new Date();

      // 清理临时文件
      await fs.unlink(audioPath);

      // pyannote通常1-2次就够了
      const progress = Math.min((profile.enrollmentCount / 2) * 100, 100);

      return {
        success: true,
        profileId,
        enrollmentProgress: progress,
        remainingEnrollments: progress >= 100 ? 0 : 2 - profile.enrollmentCount,
        message: progress >= 100
          ? '声纹训练完成'
          : `已完成 ${profile.enrollmentCount}/2 次训练`
      };
    } catch (error) {
      throw new ProviderError(
        'pyannote',
        'ENROLLMENT_ERROR',
        'Failed to enroll profile',
        error
      );
    }
  }

  /**
   * 删除声纹档案
   */
  async deleteProfile(profileId: string): Promise<void> {
    if (!this.profiles.has(profileId)) {
      throw new ProfileNotFoundError('pyannote', profileId);
    }
    this.profiles.delete(profileId);
  }

  /**
   * 1:N识别（从多个声纹中识别说话人）
   */
  async identifySpeaker(
    audioData: Buffer,
    candidateProfileIds: string[]
  ): Promise<IdentificationResult> {
    try {
      // 保存音频
      const audioPath = await this.saveAudioTemp(audioData);

      // 提取测试音频的embeddings
      const testEmbeddings = await this.extractEmbeddings(audioPath);

      if (testEmbeddings.length === 0) {
        return { identified: false };
      }

      // 与每个候选档案比对
      const candidates: Array<{ profileId: string; confidence: number }> = [];

      for (const profileId of candidateProfileIds) {
        const profile = this.profiles.get(profileId);
        if (!profile || profile.embeddings.length === 0) continue;

        // 计算相似度（余弦相似度）
        const similarity = this.calculateSimilarity(
          testEmbeddings[0],
          profile.embeddings
        );

        candidates.push({
          profileId,
          confidence: similarity
        });
      }

      // 排序
      candidates.sort((a, b) => b.confidence - a.confidence);

      // 清理临时文件
      await fs.unlink(audioPath);

      // 判断阈值
      const threshold = 0.7;
      if (candidates.length > 0 && candidates[0].confidence >= threshold) {
        return {
          identified: true,
          profileId: candidates[0].profileId,
          confidence: candidates[0].confidence,
          candidates
        };
      }

      return {
        identified: false,
        candidates
      };
    } catch (error) {
      throw new ProviderError(
        'pyannote',
        'IDENTIFICATION_ERROR',
        'Failed to identify speaker',
        error
      );
    }
  }

  /**
   * 1:1验证（验证音频是否为某人）
   */
  async verifySpeaker(
    profileId: string,
    audioData: Buffer
  ): Promise<VerificationResult> {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new ProfileNotFoundError('pyannote', profileId);
    }

    try {
      // 保存音频
      const audioPath = await this.saveAudioTemp(audioData);

      // 提取embeddings
      const testEmbeddings = await this.extractEmbeddings(audioPath);

      if (testEmbeddings.length === 0) {
        return { verified: false, confidence: 0 };
      }

      // 计算相似度
      const similarity = this.calculateSimilarity(
        testEmbeddings[0],
        profile.embeddings
      );

      // 清理临时文件
      await fs.unlink(audioPath);

      const threshold = 0.75;
      return {
        verified: similarity >= threshold,
        confidence: similarity,
        threshold
      };
    } catch (error) {
      throw new ProviderError(
        'pyannote',
        'VERIFICATION_ERROR',
        'Failed to verify speaker',
        error
      );
    }
  }

  /**
   * 说话人分离（核心功能）⭐
   * 不需要预先注册声纹，直接识别音频中有多少个说话人
   */
  async diarization(audioData: Buffer): Promise<DiarizationResult> {
    try {
      // 保存音频到临时文件
      const audioPath = await this.saveAudioTemp(audioData);

      // 运行pyannote diarization
      const segments = await this.runDiarization(audioPath);

      // 清理临时文件
      await fs.unlink(audioPath);

      // 统计说话人数量
      const speakers = new Set(segments.map(s => s.speaker));

      return {
        segments,
        numSpeakers: speakers.size
      };
    } catch (error) {
      throw new ProviderError(
        'pyannote',
        'DIARIZATION_ERROR',
        'Failed to perform diarization',
        error
      );
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      // 检查Python是否可用
      const result = await this.runPythonCommand([
        '-c',
        'import pyannote.audio; print("OK")'
      ]);
      return result.includes('OK');
    } catch (error) {
      return false;
    }
  }

  // ==================== 私有方法 ====================

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
   * 保存音频到临时文件
   */
  private async saveAudioTemp(audioData: Buffer): Promise<string> {
    const filename = `audio_${uuidv4()}.wav`;
    const filepath = path.join(this.tempDir, filename);
    await fs.writeFile(filepath, audioData);
    return filepath;
  }

  /**
   * 提取声纹特征（embeddings）
   */
  private async extractEmbeddings(audioPath: string): Promise<number[][]> {
    const pythonScript = `
import sys
import json
import torch
from pyannote.audio import Model
from pyannote.audio.pipelines.utils import get_devices
import torchaudio

# 加载模型
model = Model.from_pretrained("${this.config.modelPath}")
device = torch.device("${this.config.device}")
model = model.to(device)

# 加载音频
waveform, sample_rate = torchaudio.load("${audioPath}")

# 如果音频太长，截取前30秒
max_duration = 30 * sample_rate
if waveform.shape[1] > max_duration:
    waveform = waveform[:, :max_duration]

# 提取embeddings
with torch.no_grad():
    embeddings = model({"waveform": waveform.to(device), "sample_rate": sample_rate})

# 转换为列表并输出JSON
result = embeddings.cpu().numpy().tolist()
print(json.dumps(result))
`;

    const result = await this.runPythonScript(pythonScript);
    return JSON.parse(result);
  }

  /**
   * 运行说话人分离
   */
  private async runDiarization(audioPath: string): Promise<DiarizationSegment[]> {
    const pythonScript = `
import sys
import json
from pyannote.audio import Pipeline

# 加载预训练的diarization pipeline
pipeline = Pipeline.from_pretrained(
    "${this.config.modelPath}",
    use_auth_token=None  # 如果使用HuggingFace，需要token
)

# 设置设备
import torch
device = torch.device("${this.config.device}")
pipeline = pipeline.to(device)

# 运行diarization
diarization = pipeline("${audioPath}", min_speakers=${this.config.minSpeakers}, max_speakers=${this.config.maxSpeakers})

# 转换为JSON格式
segments = []
for turn, _, speaker in diarization.itertracks(yield_label=True):
    segments.append({
        "speaker": str(speaker),
        "startTime": turn.start,
        "endTime": turn.end
    })

print(json.dumps(segments))
`;

    const result = await this.runPythonScript(pythonScript);
    const segments = JSON.parse(result);

    return segments.map((seg: any) => ({
      speaker: seg.speaker,
      startTime: seg.startTime,
      endTime: seg.endTime,
      confidence: 1.0 // pyannote不直接提供confidence
    }));
  }

  /**
   * 运行Python脚本
   */
  private runPythonScript(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const python = spawn(this.config.pythonPath!, ['-c', script]);

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python脚本执行失败:\n${stderr}`));
        } else {
          resolve(stdout.trim());
        }
      });

      python.on('error', (error) => {
        reject(new Error(`无法启动Python: ${error.message}`));
      });
    });
  }

  /**
   * 运行Python命令
   */
  private runPythonCommand(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const python = spawn(this.config.pythonPath!, args);

      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr));
        } else {
          resolve(stdout.trim());
        }
      });

      python.on('error', reject);
    });
  }

  /**
   * 计算余弦相似度
   */
  private calculateSimilarity(
    embedding1: number[],
    embeddings2: number[][]
  ): number {
    if (embeddings2.length === 0) return 0;

    // 计算与所有训练embeddings的平均相似度
    const similarities = embeddings2.map(emb2 => this.cosineSimilarity(embedding1, emb2));

    return similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
  }

  /**
   * 余弦相似度计算
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    if (norm1 === 0 || norm2 === 0) return 0;

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /**
   * 保存档案到文件（持久化）
   */
  async saveProfiles(filepath: string): Promise<void> {
    const data = Array.from(this.profiles.values());
    await fs.writeFile(filepath, JSON.stringify(data, null, 2));
  }

  /**
   * 从文件加载档案
   */
  async loadProfiles(filepath: string): Promise<void> {
    try {
      const data = await fs.readFile(filepath, 'utf-8');
      const profiles: StoredProfile[] = JSON.parse(data);

      this.profiles.clear();
      for (const profile of profiles) {
        this.profiles.set(profile.profileId, profile);
      }
    } catch (error) {
      console.warn('加载声纹档案失败:', error);
    }
  }
}

export default PyannoteVoiceprintProvider;
