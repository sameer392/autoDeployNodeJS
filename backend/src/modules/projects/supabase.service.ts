import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

import { Project } from '../../database/entities/project.entity';
import { ProjectEnvVar } from '../../database/entities/project-env-var.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DockerService } from '../docker/docker.service';
import { TRAEFIK_NETWORK } from '../../common/constants';

const execAsync = promisify(exec);

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectEnvVar)
    private readonly envVarRepo: Repository<ProjectEnvVar>,
    private readonly dockerService: DockerService,
  ) {}

  /**
   * Get Supabase Studio URL (plain, no credentials in URL).
   */
  async getStudioUrl(project: Project): Promise<string | null> {
    const ev = await this.envVarRepo.findOne({
      where: { projectId: project.id, key: 'VITE_SUPABASE_URL' },
    });
    return ev?.value || null;
  }

  /**
   * Get Studio login credentials for manual copy/paste (URL, username, password).
   */
  async getStudioCredentials(project: Project): Promise<{ url: string; username: string; password: string } | null> {
    const url = await this.getStudioUrl(project);
    if (!url) return null;
    const hostingRoot =
      process.env.HOSTING_PANEL_ROOT ||
      path.resolve(process.cwd(), process.cwd().endsWith('backend') ? '..' : '.');
    const projectDir = path.join(hostingRoot, 'infra', 'supabase', 'projects', project.slug);
    try {
      const envContent = await fs.readFile(path.join(projectDir, '.env'), 'utf-8');
      const userMatch = envContent.match(/DASHBOARD_USERNAME=(.+)/m);
      const passMatch = envContent.match(/DASHBOARD_PASSWORD=(.+)/m);
      return {
        url,
        username: userMatch?.[1]?.trim() || 'supabase',
        password: passMatch?.[1]?.trim() || '',
      };
    } catch {
      return { url, username: 'supabase', password: '' };
    }
  }

  /** Check if project has Supabase env vars (already set up) */
  async hasSupabase(projectId: number): Promise<boolean> {
    const ev = await this.envVarRepo.findOne({
      where: { projectId, key: 'VITE_SUPABASE_URL' },
    });
    return !!ev?.value;
  }

  /** Get primary domain for project (for api subdomain) */
  private getPrimaryDomain(domains: { domain: string; isPrimary?: boolean }[]): string | null {
    if (!domains?.length) return null;
    const primary = domains.find((d) => d.isPrimary);
    return (primary || domains[0]).domain;
  }

  /**
   * Provision Supabase for a project and add env vars.
   * Requires at least one domain.
   */
  async setupSupabase(project: Project): Promise<{ url: string; message: string }> {
    const domain = this.getPrimaryDomain(project.domains || []);
    if (!domain) {
      throw new BadRequestException(
        'Project must have at least one domain to set up Supabase (used for api subdomain)',
      );
    }

    const hasIt = await this.hasSupabase(project.id);
    if (hasIt) {
      const ev = await this.envVarRepo.findOne({
        where: { projectId: project.id, key: 'VITE_SUPABASE_URL' },
      });
      return {
        url: ev?.value || '',
        message: 'Supabase already configured for this project',
      };
    }

    const hostingRoot =
      process.env.HOSTING_PANEL_ROOT ||
      path.resolve(process.cwd(), process.cwd().endsWith('backend') ? '..' : '.');
    const scriptPath = path.join(hostingRoot, 'infra', 'supabase', 'create-project.sh');
    const exists = await fs.access(scriptPath).then(() => true).catch(() => false);
    if (!exists) {
      throw new BadRequestException(
        'Supabase setup script not found. Ensure infra/supabase/create-project.sh exists.',
      );
    }

    const supabaseSlug = project.slug;
    this.logger.log(`Provisioning Supabase for ${project.slug}, domain ${domain}`);

    try {
      const { stdout, stderr } = await execAsync(
        `"${scriptPath}" "${supabaseSlug}" "${domain}"`,
        {
          timeout: 600000, // 10 min
          maxBuffer: 50 * 1024 * 1024, // 50MB – docker compose outputs a lot
          env: { ...process.env, PATH: process.env.PATH || '/usr/bin:/bin' },
        },
      );
      this.logger.debug(`Supabase stdout: ${stdout}`);
      if (stderr) this.logger.warn(`Supabase stderr: ${stderr}`);
    } catch (err: any) {
      const stderr = err?.stderr || '';
      const stdout = err?.stdout || '';
      const detail = [stderr, stdout].filter(Boolean).join('\n').trim().slice(-3000); // last 3k chars
      this.logger.error(`Supabase provisioning failed: ${err?.message}\n${detail}`);
      const msg = detail
        ? `Supabase setup failed: ${err?.message || 'Unknown error'}\n\nLast output:\n${detail}`
        : `Supabase setup failed: ${err?.message || 'Unknown error'}. Run manually for details: ${scriptPath} "${supabaseSlug}" "${domain}"`;
      throw new BadRequestException(msg);
    }

    const apiUrl = `https://api.${domain}`;
    const supabaseDir = path.dirname(scriptPath);
    const projectDir = path.join(supabaseDir, 'projects', supabaseSlug);
    let anonKey = '';

    try {
      const envContent = await fs.readFile(path.join(projectDir, '.env'), 'utf-8');
      const match = envContent.match(/ANON_KEY=(.+)/m);
      if (match) anonKey = match[1].trim();
    } catch {
      this.logger.warn('Could not read ANON_KEY from Supabase .env');
    }

    if (!anonKey) {
      throw new BadRequestException(
        'Supabase was created but could not read ANON_KEY. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY manually in project env vars.',
      );
    }

    await this.envVarRepo.upsert(
      [
        { projectId: project.id, key: 'VITE_SUPABASE_URL', value: apiUrl, isSecret: false },
        { projectId: project.id, key: 'VITE_SUPABASE_ANON_KEY', value: anonKey, isSecret: true },
      ],
      { conflictPaths: ['projectId', 'key'], skipUpdateIfNoValuesChanged: false },
    );

    const buildDir = process.env.BUILD_DIR || '/app/builds';
    const projectRoot = path.join(buildDir, project.slug, project.buildContext || '.');
    const migrationsDir = path.join(projectRoot, 'supabase', 'migrations');
    try {
      const entries = await fs.readdir(migrationsDir);
      const sqlFiles = entries.filter((f) => f.endsWith('.sql')).sort();
      const dbContainer = `supabase-${supabaseSlug}-db`;
      for (const f of sqlFiles) {
        const p = path.join(migrationsDir, f);
        await execAsync(`docker exec -i ${dbContainer} psql -U postgres < "${p}"`, {
          timeout: 60000,
          shell: '/bin/bash',
        });
        this.logger.log(`Ran migration ${f} for ${project.slug}`);
      }
    } catch (e: any) {
      if (e?.code !== 'ENOENT') this.logger.warn(`Migrations skipped for ${project.slug}: ${e?.message}`);
    }

    const shouldRecreate = project.containerId && project.imageName;
    if (shouldRecreate) {
      try {
        const fresh = await this.projectRepo.findOne({
          where: { id: project.id },
          relations: ['domains', 'envVars'],
        });
        if (fresh) await this.recreateContainerWithEnv(fresh);
      } catch (e: any) {
        this.logger.warn(`Recreate after Supabase setup failed: ${e?.message}`);
      }
    }

    return {
      url: apiUrl,
      message: shouldRecreate
        ? 'Supabase provisioned and app container restarted with new env vars.'
        : 'Supabase provisioned. Build or start the app to apply env vars.',
    };
  }

  /**
   * Stop and remove Supabase stack for a project (call before project deletion).
   */
  async stopSupabase(slug: string): Promise<void> {
    const hostingRoot =
      process.env.HOSTING_PANEL_ROOT ||
      path.resolve(process.cwd(), process.cwd().endsWith('backend') ? '..' : '.');
    const scriptPath = path.join(hostingRoot, 'infra', 'supabase', 'stop-project.sh');
    const exists = await fs.access(scriptPath).then(() => true).catch(() => false);
    if (!exists) return;
    try {
      await execAsync(`"${scriptPath}" "${slug}"`, {
        timeout: 60000,
        env: { ...process.env, PATH: process.env.PATH || '/usr/bin:/bin' },
      });
      this.logger.log(`Stopped Supabase for ${slug}`);
    } catch (e: any) {
      this.logger.warn(`Supabase stop failed for ${slug}: ${e?.message}`);
    }
  }

  /**
   * Recreate the app container with current env vars (so Supabase vars take effect).
   */
  async recreateContainerWithEnv(project: Project): Promise<void> {
    if (!project.containerId || !project.imageName) {
      return;
    }
    const envVars = await this.envVarRepo.find({ where: { projectId: project.id } });
    const env: Record<string, string> = { PERSISTENT_DATA_DIR: '/data' };
    for (const ev of envVars) {
      env[ev.key] = ev.value;
    }
    const domains = (project.domains || []).map((d) => d.domain).filter(Boolean);

    await this.dockerService.removeContainer(project.containerId);
    const containerId = await this.dockerService.createContainer({
      image: `${project.imageName}:${project.imageTag || 'latest'}`,
      name: project.slug,
      internalPort: project.internalPort,
      memoryLimitMb: project.memoryLimitMb,
      cpuLimit: Number(project.cpuLimit),
      env: Object.keys(env).length ? env : undefined,
      domains: domains.length ? domains : undefined,
      traefikNetwork: TRAEFIK_NETWORK,
      dataVolumeName: `hosting-data-${project.slug}`,
    });
    await this.dockerService.startContainer(containerId);

    await this.projectRepo.update(project.id, { containerId, status: 'running' });
  }
}
