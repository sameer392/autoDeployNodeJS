import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execAsync = promisify(exec);

export interface SharedSupabaseStatus {
  running: boolean;
  studioUrl?: string;
  apiDomain?: string;
}

@Injectable()
export class SupabaseSharedService {
  private readonly logger = new Logger(SupabaseSharedService.name);

  async getStatus(): Promise<SharedSupabaseStatus> {
    const hostingRoot =
      process.env.HOSTING_PANEL_ROOT ||
      path.resolve(process.cwd(), process.cwd().endsWith('backend') ? '..' : '.');
    const sharedDir = path.join(hostingRoot, 'infra', 'supabase', 'shared');
    try {
      const { stdout } = await execAsync(
        "docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^supabase-shared-db$' && echo yes || echo no",
        { shell: '/bin/bash' },
      );
      const running = stdout.trim() === 'yes';
      let studioUrl: string | undefined;
      let apiDomain: string | undefined;
      if (running) {
        try {
          const envContent = await fs.readFile(path.join(sharedDir, '.env'), 'utf-8');
          const m = envContent.match(/SUPABASE_SHARED_API_DOMAIN=(.+)/m);
          const rawApi = m?.[1]?.trim();
          if (rawApi) apiDomain = rawApi.startsWith('http') ? rawApi : `https://${rawApi}`;
          const baseMatch = envContent.match(/SUPABASE_SHARED_BASE_DOMAIN=(.+)/m);
          const base = baseMatch?.[1]?.trim();
          if (base) {
            studioUrl = `https://supabase.${base}`;
          } else if (apiDomain?.includes('api.supabase.')) {
            studioUrl = apiDomain.replace(/^https?:\/\/api\./, 'https://');
          }
        } catch {
          // ignore
        }
      }
      return { running, studioUrl, apiDomain };
    } catch {
      return { running: false };
    }
  }

  async setup(domain: string): Promise<{ studioUrl: string; apiDomain: string; message: string }> {
    if (!domain?.trim()) {
      throw new BadRequestException('Base domain is required (e.g. pdfsaas.com)');
    }
    const baseDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const hostingRoot =
      process.env.HOSTING_PANEL_ROOT ||
      path.resolve(process.cwd(), process.cwd().endsWith('backend') ? '..' : '.');
    const scriptPath = path.join(hostingRoot, 'infra', 'supabase', 'setup-shared-supabase.sh');
    const exists = await fs.access(scriptPath).then(() => true).catch(() => false);
    if (!exists) {
      throw new BadRequestException(
        'Setup script not found. Ensure infra/supabase/setup-shared-supabase.sh exists.',
      );
    }
    const status = await this.getStatus();
    if (status.running) {
      return {
        studioUrl: status.studioUrl || `https://supabase.${baseDomain}`,
        apiDomain: status.apiDomain || `https://api.supabase.${baseDomain}`,
        message: 'Shared Supabase is already running.',
      };
    }
    this.logger.log(`Setting up shared Supabase for domain ${baseDomain}`);
    try {
      const { stdout, stderr } = await execAsync(`"${scriptPath}" "${baseDomain}"`, {
        timeout: 600000,
        maxBuffer: 50 * 1024 * 1024,
        env: { ...process.env, PATH: process.env.PATH || '/usr/bin:/bin' },
      });
      this.logger.debug(`Supabase shared stdout: ${stdout}`);
      if (stderr) this.logger.warn(`Supabase shared stderr: ${stderr}`);
    } catch (err: unknown) {
      const e = err as { stderr?: string; stdout?: string; message?: string };
      const detail = [e?.stderr, e?.stdout].filter(Boolean).join('\n').trim().slice(-3000);
      this.logger.error(`Shared Supabase setup failed: ${e?.message}\n${detail}`);
      throw new BadRequestException(
        detail
          ? `Setup failed: ${e?.message || 'Unknown'}\n\nLast output:\n${detail}`
          : `Setup failed: ${e?.message}. Run manually: ${scriptPath} ${baseDomain}`,
      );
    }
    return {
      studioUrl: `https://supabase.${baseDomain}`,
      apiDomain: `https://api.supabase.${baseDomain}`,
      message: 'Shared Supabase stack is ready. Add projects from the project page.',
    };
  }
}
