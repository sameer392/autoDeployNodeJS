import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Plus, Server } from 'lucide-react';
import styles from './Dashboard.module.css';

interface Project {
  id: number;
  name: string;
  slug: string;
  status: string;
  memoryLimitMb: number;
  cpuLimit: number;
  domains?: { domain: string }[];
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/projects').then((r) => {
      setProjects(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const statusColor = (s: string) => {
    if (s === 'running') return 'var(--success)';
    if (s === 'stopped' || s === 'error') return 'var(--error)';
    return 'var(--warning)';
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <h1>Projects</h1>
        <Link to="/projects/new" className={styles.btn}>
          <Plus size={18} /> New Project
        </Link>
      </div>
      {loading ? (
        <p>Loading...</p>
      ) : projects.length === 0 ? (
        <div className={styles.empty}>
          <Server size={48} />
          <p>No projects yet</p>
          <Link to="/projects/new" className={styles.btn}>Create your first project</Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {projects.map((p) => (
            <div key={p.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <h3>{p.name}</h3>
                <span className={styles.status} style={{ color: statusColor(p.status) }}>{p.status}</span>
              </div>
              <div className={styles.meta}>{p.memoryLimitMb}MB / {p.cpuLimit} CPU</div>
              {p.domains?.length ? <div className={styles.domains}>{p.domains[0]?.domain}</div> : null}
              <div className={styles.actions}>
                <Link to={"/projects/" + p.id} className={styles.link}>View</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
