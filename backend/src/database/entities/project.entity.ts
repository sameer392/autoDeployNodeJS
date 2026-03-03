import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Admin } from './admin.entity';
import { Domain } from './domain.entity';
import { ProjectEnvVar } from './project-env-var.entity';
import { Log } from './log.entity';

export type SourceType = 'zip' | 'git';
export type ProjectStatus =
  | 'pending'
  | 'building'
  | 'running'
  | 'stopped'
  | 'error'
  | 'deleted';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn({ type: 'int', unsigned: true })
  id: number;

  @Column({ type: 'int', unsigned: true, name: 'admin_id' })
  adminId: number;

  @Column({ type: 'varchar', length: 63 })
  name: string;

  @Column({ type: 'varchar', length: 63, unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ['zip', 'git'], name: 'source_type', default: 'zip' })
  sourceType: SourceType;

  @Column({ type: 'varchar', length: 512, name: 'source_url', nullable: true })
  sourceUrl: string | null;

  @Column({ type: 'varchar', length: 255, name: 'dockerfile_path', default: 'Dockerfile' })
  dockerfilePath: string;

  @Column({ type: 'varchar', length: 512, name: 'build_context', default: '.' })
  buildContext: string;

  @Column({ type: 'varchar', length: 255, name: 'image_name', nullable: true })
  imageName: string | null;

  @Column({ type: 'varchar', length: 63, name: 'image_tag', default: 'latest' })
  imageTag: string;

  @Column({ type: 'varchar', length: 64, name: 'container_id', nullable: true })
  containerId: string | null;

  @Column({ type: 'int', unsigned: true, name: 'internal_port' })
  internalPort: number;

  @Column({ type: 'int', unsigned: true, name: 'memory_limit_mb', default: 512 })
  memoryLimitMb: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, name: 'cpu_limit', default: 1.0 })
  cpuLimit: number;

  @Column({
    type: 'enum',
    enum: ['pending', 'building', 'running', 'stopped', 'error', 'deleted'],
    default: 'pending',
  })
  status: ProjectStatus;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Admin, (admin) => admin.projects, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'admin_id' })
  admin: Admin;

  @OneToMany(() => Domain, (domain) => domain.project)
  domains: Domain[];

  @OneToMany(() => ProjectEnvVar, (envVar) => envVar.project)
  envVars: ProjectEnvVar[];

  @OneToMany(() => Log, (log) => log.project)
  logs: Log[];
}
