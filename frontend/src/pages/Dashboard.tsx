import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Plus, Server } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
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

interface ServerStatsPayload {
  byProject: Record<string, { name: string; cpu: number; memoryMb: number }>;
  otherDocker: { cpu: number; memoryMb: number };
  others: { cpu: number; memoryMb: number };
  total: { cpu: number; memoryMb: number };
}

const MAX_POINTS = 60;
const POLL_MS = 5000;

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [serverStatsHistory, setServerStatsHistory] = useState<
    Array<ServerStatsPayload & { i: number }>
  >([]);
  const indexRef = useRef(0);

  useEffect(() => {
    api.get('/projects').then((r) => {
      setProjects(r.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    const fetchStats = () => {
      api.get<ServerStatsPayload>('/server/stats')
        .then((r) => {
          setServerStatsHistory((prev) => {
            const next = [...prev.slice(-(MAX_POINTS - 1)), { ...r.data, i: indexRef.current++ }];
            return next;
          });
        })
        .catch(() => {});
    };
    fetchStats();
    const interval = setInterval(fetchStats, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  const statusColor = (s: string) => {
    if (s === 'running') return 'var(--success)';
    if (s === 'stopped' || s === 'error') return 'var(--error)';
    return 'var(--warning)';
  };

  const palette = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#a4de6c', '#ff8042', '#ffbb28'];
  const last = serverStatsHistory[serverStatsHistory.length - 1];
  const roles: string[] = last
    ? [...Object.keys(last.byProject).map((slug) => last.byProject[slug].name), 'Docker Usages', 'OS + System Usages', 'Total']
    : [];
  const cpuData = serverStatsHistory.map((p, idx) => {
    const pt: Record<string, number | string> = { i: idx };
    if (p) {
      for (const slug of Object.keys(p.byProject)) pt[p.byProject[slug].name] = p.byProject[slug].cpu;
      pt['Docker Usages'] = p.otherDocker.cpu;
      pt['OS + System Usages'] = p.others.cpu;
      pt['Total'] = p.total.cpu;
    }
    return pt;
  });
  const memData = serverStatsHistory.map((p, idx) => {
    const pt: Record<string, number | string> = { i: idx };
    if (p) {
      for (const slug of Object.keys(p.byProject)) pt[p.byProject[slug].name] = p.byProject[slug].memoryMb;
      pt['Docker Usages'] = p.otherDocker.memoryMb;
      pt['OS + System Usages'] = p.others.memoryMb;
      pt['Total'] = p.total.memoryMb;
    }
    return pt;
  });
  const hasChartData = serverStatsHistory.length > 0;

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <h1>Projects</h1>
        <Link to="/projects/new" className={styles.btn}>
          <Plus size={18} /> New Project
        </Link>
      </div>
      {hasChartData && (
        <div className={styles.serverCharts}>
          <h3>Server Resource Usage</h3>
          <div className={styles.chartRow}>
            <div className={styles.chartBox}>
              <h4>CPU %</h4>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={cpuData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="i" hide tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip contentStyle={{ background: 'var(--bg-secondary)' }} />
                  <Legend />
                  {roles.map((r, i) => (
                    <Line key={r} type="monotone" dataKey={r} stroke={palette[i % palette.length]} strokeWidth={r === 'Total' ? 2.5 : 1.5} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className={styles.chartBox}>
              <h4>Memory (MB)</h4>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={memData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="i" hide tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip contentStyle={{ background: 'var(--bg-secondary)' }} formatter={(v: number, name: string) => [v != null ? v.toFixed(1) + ' MB' : '-', name]} />
                  <Legend />
                  {roles.map((r, i) => (
                    <Line key={r} type="monotone" dataKey={r} stroke={palette[i % palette.length]} strokeWidth={r === 'Total' ? 2.5 : 1.5} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className={styles.chartHint}>Live view, updates every {POLL_MS / 1000}s</p>
        </div>
      )}
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
