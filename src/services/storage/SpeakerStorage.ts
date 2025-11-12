/**
 * 说话人存储服务
 * 管理说话人声纹数据的读取和写入
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface Speaker {
  id: string;
  name: string;
  email?: string;
  voiceprintData?: {
    features: number[];
    featureDim?: number;
    extractedAt?: string;
    model?: string;
    modelType?: string;
  };
  createdAt?: string;
  updatedAt?: string;
  samples?: Array<{
    id: string;
    duration?: number;
    createdAt: string;
  }>;
}

class SpeakerStorage {
  private speakersFilePath: string;
  private speakers: Speaker[] = [];
  private initialized = false;

  constructor() {
    this.speakersFilePath = path.join(process.cwd(), 'data', 'speakers.json');
  }

  private async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const data = await fs.readFile(this.speakersFilePath, 'utf-8');
      this.speakers = JSON.parse(data);
      console.log(`[SpeakerStorage] 加载了 ${this.speakers.length} 个说话人记录`);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.log('[SpeakerStorage] speakers.json 不存在，初始化为空数组');
        this.speakers = [];
        await this.save();
      } else {
        console.error('[SpeakerStorage] 加载失败:', error);
        this.speakers = [];
      }
    }

    this.initialized = true;
  }

  // 获取所有说话人
  async findAll(): Promise<Speaker[]> {
    await this.init();
    return [...this.speakers];
  }

  async findById(id: string): Promise<Speaker | undefined> {
    await this.init();
    return this.speakers.find(s => s.id === id);
  }

  async create(speakerData: any, audioDuration?: number): Promise<Speaker> {
    await this.init();

    // Generate unique ID
    const id = `spk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    const newSpeaker: Speaker = {
      id,
      name: speakerData.name,
      email: speakerData.email,
      voiceprintData: speakerData.voiceprintData,
      createdAt: now,
      updatedAt: now,
      samples: audioDuration ? [{
        id: `sample_${Date.now()}`,
        duration: audioDuration,
        createdAt: now
      }] : []
    };

    this.speakers.push(newSpeaker);
    await this.save();

    console.log(`[SpeakerStorage] 创建说话人: ${newSpeaker.name} (ID: ${id})`);
    return newSpeaker;
  }

  async update(id: string, updates: Partial<Omit<Speaker, 'id' | 'createdAt'>>): Promise<Speaker | null> {
    await this.init();

    const index = this.speakers.findIndex(s => s.id === id);
    if (index === -1) return null;

    this.speakers[index] = {
      ...this.speakers[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.save();
    return this.speakers[index];
  }

  async delete(id: string): Promise<boolean> {
    await this.init();

    const initialLength = this.speakers.length;
    this.speakers = this.speakers.filter(s => s.id !== id);

    if (this.speakers.length < initialLength) {
      await this.save();
      console.log(`[SpeakerStorage] 删除说话人: ${id}`);
      return true;
    }

    return false;
  }

  private async save(): Promise<void> {
    try {
      await fs.writeFile(
        this.speakersFilePath,
        JSON.stringify(this.speakers, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('[SpeakerStorage] 保存失败:', error);
      throw error;
    }
  }
}

export const speakerStorage = new SpeakerStorage();
