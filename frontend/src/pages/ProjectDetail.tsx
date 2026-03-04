import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { io } from 'socket.io-client';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Play, Square, RotateCw, Trash2, ArrowLeft, Database, Copy } from 'lucide-react';
import styles from './ProjectDetail.module.css';

interface Project {
  id: number;
  name: string;
  slug: string;
  status: string;
  containerId: string | null;
  memoryLimitMb: number;
  cpuLimit: number;
  errorMessage?: string;
  domains?: { domain: string }[];
}

interface Stats { cpu: number; memPct: number; }

interface SupabaseStatus {
  configured: boolean;
  url?: string;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [stats, setStats] = useState<Stats[]>([]);
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [supabase, setSupabase] = useState<SupabaseStatus | null>(null);
  const [supabaseLoading, setSupabaseLoading] = useState(false);

  useEffect(() => {
    api.get('/projects/' + id).then((r) => { setProject(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    api.get('/projects/' + id + '/supabase').then((r) => setSupabase(r.data)).catch(() => setSupabase(null));
  }, [id]);

  useEffect(() => {
    if (supabase?.configured && id) {
      api.get('/projects/' + id + '/supabase/studio-credentials')
        .then((r) => setStudioCreds(r.data))
        .catch(() => setStudioCreds(null));
    } else {
      setStudioCreds(null);
    }
  }, [supabase?.configured, id]);

  useEffect(() => {
    if (!project?.containerId || project.status !== 'running') return;
    const socket = io('/docker', { path: '/socket.io' });
    socket.emit('stats:subscribe', { containerId: project.containerId });
    socket.on('stats', (s: Stats) => { setStats((prev) => [...prev.slice(-59), s]); });
    return () => { socket.emit('stats:unsubscribe', { containerId: project.containerId }); socket.close(); };
  }, [project?.containerId, project?.status]);

  useEffect(() => {
    if (!project?.containerId) return;
    const token = localStorage.getItem('token');
    fetch('/api/projects/' + id + '/logs', { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => r.text()).then(setLogs).catch(() => setLogs('Failed to load logs'));
  }, [id, project?.containerId]);

  const control = async (action: string) => {
    try {
      await api.post('/projects/' + id + '/' + action);
      const { data } = await api.get('/projects/' + id);
      setProject(data);
    } catch (e) { console.error(e); }
  };

  if (loading || !project) return <p>Loading...</p>;

  const statusColor = project.status === 'running' ? 'var(--success)' : project.status === 'stopped' ? 'var(--error)' : 'var(--warning)';

  return (
    <div className={styles.page}>
      <button onClick={() => navigate('/')} className={styles.back}><ArrowLeft size={18} /> Back</button>
      <div className={styles.header}>
        <h1>{project.name}</h1>
        <span className={styles.status} style={{ color: statusColor }}>{project.status}</span>
      </div>
      {project.errorMessage && <div className={styles.error}>{project.errorMessage}</div>}
      <div className={styles.controls}>
        <button onClick={() => control('start')} disabled={project.status === 'running'}><Play size={16} /> Start</button>
        <button onClick={() => control('stop')} disabled={project.status !== 'running'}><Square size={16} /> Stop</button>
        <button onClick={() => control('restart')} disabled={project.status !== 'running'}><RotateCw size={16} /> Restart</button>
        <button onClick={async () => { if (confirm('Delete?')) { await api.delete('/projects/' + id); navigate('/'); } }} className={styles.danger}><Trash2 size={16} /> Delete</button>
      </div>
      {project.domains?.length ? (
        <div className={styles.domains}>{project.domains.map((d) => <a key={d.domain} href={'https://' + d.domain} target="_blank" rel="noreferrer">{d.domain}</a>)}</div>
      ) : null}
      <div className={styles.supabase}>
        {supabase?.configured ? (
          <div className={styles.studioCreds}>
            <h4>Supabase Studio – copy and use to sign in</h4>
            {studioCreds ? (
              <>
                <div className={styles.credRow}>
                  <label>URL</label>
                  <div className={styles.credInput}>
                    <input type="text" readOnly value={studioCreds.url} />
                    <button type="button" onClick={() => copyToClipboard(studioCreds!.url)} title="Copy"><Copy size={14} /></button>
                  </div>
                </div>
                <div className={styles.credRow}>
                  <label>Username</label>
                  <div className={styles.credInput}>
                    <input type="text" readOnly value={studioCreds.username} />
                    <button type="button" onClick={() => copyToClipboard(studioCreds!.username)} title="Copy"><Copy size={14} /></button>
                  </div>
                </div>
                <div className={styles.credRow}>
                  <label>Password</label>
                  <div className={styles.credInput}>
                    <input type="password" readOnly value={studioCreds.password} />
                    <button type="button" onClick={() => copyToClipboard(studioCreds!.password)} title="Copy"><Copy size={14} /></button>
                  </div>
                </div>
                <a href={studioCreds.url} target="_blank" rel="noreferrer" className={styles.studioLink}>Open Studio →</a>
              </>
            ) : (
              <span className={styles.credLoading}>Loading…</span>
            )}
          </div>
        ) : (
          <button onClick={async () => {
            setSupabaseLoading(true);
            try {
              const { data } = await api.post('/projects/' + id + '/supabase/setup');
              setSupabase({ configured: true, url: data.url });
              setProject((p) => p ? { ...p } : null);
              const { data: p } = await api.get('/projects/' + id);
              setProject(p);
            } catch (e: any) {
              alert(e?.response?.data?.message || 'Supabase setup failed');
            } finally { setSupabaseLoading(false); }
          }} disabled={supabaseLoading || !project.domains?.length}><Database size={16} /> Setup Supabase</button>
        )}
      </div>
      {stats.length > 0 && (
        <div className={styles.charts}>
          <h3>Resource Usage</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={stats.map((s, i) => ({ i, cpu: s.cpu, mem: s.memPct }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="i" hide />
              <YAxis />
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)' }} />
              <Area type="monotone" dataKey="cpu" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.2} />
              <Area type="monotone" dataKey="mem" stroke="var(--success)" fill="var(--success)" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className={styles.logs}><h3>Logs</h3><pre className={styles.logContent}>{logs || 'No logs'}</pre></div>
    </div>
  );
}
