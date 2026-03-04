import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerConfig } from '../../common/multer.config';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { Admin } from '../../database/entities/admin.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { DockerService } from '../docker/docker.service';

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly dockerService: DockerService,
  ) {}

  @Post()
  create(@CurrentAdmin() admin: Admin, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(admin, dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async uploadAndCreate(
    @CurrentAdmin() admin: Admin,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('domains') domainsStr?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!name?.trim()) throw new BadRequestException('Project name is required');
    const domains = domainsStr?.trim()
      ? domainsStr.split(',').map((d) => d.trim()).filter(Boolean)
      : [];
    const dto: CreateProjectDto = { name: name.trim(), domains };
    return this.projectsService.createFromUpload(admin, file, dto);
  }

  @Get()
  findAll(@CurrentAdmin() admin: Admin) {
    return this.projectsService.findAll(admin);
  }

  @Get(':id')
  findOne(@CurrentAdmin() admin: Admin, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.findOne(admin, id);
  }

  @Get(':id/stats')
  getResourceStats(
    @CurrentAdmin() admin: Admin,
    @Param('id', ParseIntPipe) id: number,
    @Query('interval') interval?: 'minute' | 'hour' | 'day',
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.projectsService.getResourceStats(
      admin,
      id,
      interval ?? 'hour',
      from,
      to,
    );
  }

  @Get(':id/logs')
  async getLogsStream(
    @CurrentAdmin() admin: Admin,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    try {
      const project = await this.projectsService.findOne(admin, id);
      let containerId = project.containerId;
      if (!containerId) {
        containerId = await this.dockerService.findContainerByName(project.slug);
        if (!containerId) {
          return res.status(400).json({ message: 'Container not running' });
        }
      }
      const exists = await this.dockerService.containerExists(containerId);
      if (!exists) {
        return res.status(400).json({ message: 'Container not found or not running' });
      }
      const logStream = await this.dockerService.getContainerLogs(
        containerId,
        { tail: 500, follow: false },
      );
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      logStream.on('error', () => {
        try { res.end(); } catch { /* already closed */ }
      });
      logStream.pipe(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch logs';
      res.status(500).setHeader('Content-Type', 'text/plain').send('Error: ' + msg);
    }
  }

  @Patch(':id')
  update(
    @CurrentAdmin() admin: Admin,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(admin, id, dto);
  }

  @Post(':id/start')
  start(@CurrentAdmin() admin: Admin, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.start(admin, id);
  }

  @Post(':id/stop')
  stop(@CurrentAdmin() admin: Admin, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.stop(admin, id);
  }

  @Post(':id/restart')
  restart(@CurrentAdmin() admin: Admin, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.restart(admin, id);
  }

  @Delete(':id')
  remove(@CurrentAdmin() admin: Admin, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.remove(admin, id);
  }

  @Get(':id/env')
  getEnvVars(@CurrentAdmin() admin: Admin, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.getEnvVars(admin, id);
  }

  @Get(':id/supabase')
  getSupabaseStatus(@CurrentAdmin() admin: Admin, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.getSupabaseStatus(admin, id);
  }

  @Get(':id/supabase/studio-url')
  getSupabaseStudioUrl(@CurrentAdmin() admin: Admin, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.getSupabaseStudioUrl(admin, id);
  }

  @Get(':id/supabase/studio-credentials')
  getSupabaseStudioCredentials(@CurrentAdmin() admin: Admin, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.getSupabaseStudioCredentials(admin, id);
  }

  @Post(':id/supabase/setup')
  setupSupabase(@CurrentAdmin() admin: Admin, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.setupSupabase(admin, id);
  }

  @Post(':id/supabase/recreate')
  recreateSupabaseContainer(@CurrentAdmin() admin: Admin, @Param('id', ParseIntPipe) id: number) {
    return this.projectsService.recreateSupabaseContainer(admin, id);
  }
}
