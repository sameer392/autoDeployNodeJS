import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { platform } from 'os';

export interface HostMetrics {
  cpuPct: number;
  memoryTotalMb: number;
  memoryUsedMb: number;
}

@Injectable()
export class HostMetricsService {
  async getHostMetrics(): Promise<HostMetrics | null> {
    if (platform() !== 'linux') return null;

    const mem = this.readMemory();
    const cpuPct = await this.readCpu();

    if (mem && cpuPct !== null) {
      return {
        cpuPct,
        memoryTotalMb: mem.totalMb,
        memoryUsedMb: mem.usedMb,
      };
    }
    if (mem) {
      return {
        cpuPct: 0,
        memoryTotalMb: mem.totalMb,
        memoryUsedMb: mem.usedMb,
      };
    }
    return null;
  }

  private readMemory(): { totalMb: number; usedMb: number } | null {
    try {
      const raw = readFileSync('/proc/meminfo', 'utf8');
      const lines = raw.split('\n');
      let memTotalKb = 0;
      let memAvailableKb = 0;
      for (const line of lines) {
        const m = line.match(/^MemTotal:\s+(\d+)/);
        if (m) memTotalKb = parseInt(m[1], 10);
        const a = line.match(/^MemAvailable:\s+(\d+)/);
        if (a) memAvailableKb = parseInt(a[1], 10);
      }
      if (memTotalKb > 0) {
        const usedKb = memTotalKb - memAvailableKb;
        return {
          totalMb: memTotalKb / 1024,
          usedMb: Math.max(0, usedKb) / 1024,
        };
      }
    } catch {
      // ignore
    }
    return null;
  }

  private async readCpu(): Promise<number | null> {
    try {
      const parseStat = (raw: string): number[] => {
        const line = raw.split('\n')[0];
        const m = line?.match(/^cpu\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);
        if (!m) return [];
        return m.slice(1).map((s) => parseInt(s, 10));
      };

      const raw1 = readFileSync('/proc/stat', 'utf8');
      const ticks1 = parseStat(raw1);
      if (ticks1.length < 8) return null;

      await new Promise((r) => setTimeout(r, 300));

      const raw2 = readFileSync('/proc/stat', 'utf8');
      const ticks2 = parseStat(raw2);
      if (ticks2.length < 8) return null;

      const user = ticks2[0] - ticks1[0];
      const nice = ticks2[1] - ticks1[1];
      const system = ticks2[2] - ticks1[2];
      const idle = ticks2[3] - ticks1[3];
      const iowait = ticks2[4] - ticks1[4];
      const irq = ticks2[5] - ticks1[5];
      const softirq = ticks2[6] - ticks1[6];
      const steal = ticks2[7] - ticks1[7];

      const total = user + nice + system + idle + iowait + irq + softirq + steal;
      const used = user + nice + system + irq + softirq + steal;
      if (total <= 0) return 0;
      return (used / total) * 100;
    } catch {
      return null;
    }
  }
}
