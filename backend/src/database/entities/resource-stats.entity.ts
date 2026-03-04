import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Project } from './project.entity';

@Entity('resource_stats')
@Index(['projectId', 'recordedAt', 'role'])
@Index(['recordedAt'])
export class ResourceStats {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id: number;

  @Column({ type: 'int', unsigned: true, name: 'project_id' })
  projectId: number;

  @Column({ type: 'varchar', length: 64, name: 'container_id' })
  containerId: string;

  @Column({ type: 'varchar', length: 64 })
  role: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  cpu: number;

  @Column({ type: 'decimal', precision: 12, scale: 2, name: 'memory_mb', default: 0 })
  memoryMb: number;

  @Column({ type: 'datetime', name: 'recorded_at' })
  recordedAt: Date;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project: Project;
}
