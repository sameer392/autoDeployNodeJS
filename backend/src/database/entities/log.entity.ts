import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';
import { Admin } from './admin.entity';

export type LogType = 'build' | 'deploy' | 'container' | 'system' | 'auth';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

@Entity('logs')
export class Log {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'int', unsigned: true, name: 'project_id', nullable: true })
  projectId: number | null;

  @Column({ type: 'enum', enum: ['build', 'deploy', 'container', 'system', 'auth'] })
  type: LogType;

  @Column({ type: 'enum', enum: ['debug', 'info', 'warn', 'error'], default: 'info' })
  level: LogLevel;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'int', unsigned: true, name: 'admin_id', nullable: true })
  adminId: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => Project, (project) => project.logs, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;

  @ManyToOne(() => Admin, (admin) => admin.logs, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'admin_id' })
  admin: Admin | null;
}
