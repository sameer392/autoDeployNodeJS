import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { io } from 'socket.io-client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
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

interface ContainerStat { name: string; role: string; cpu: number; memPct: number; memoryMb?: number; }
interface ProjectStatsPayload {
  containers: Record<string, ContainerStat>;
  totals: { cpu: number; memPct: number; memoryMb?: number };
  meta: { containers: Array<{ id: string; name: string; role: string }> };
}

interface SupabaseStatus {
  configured: boolean;
  url?: string;
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [projectStatsHistory, setProjectStatsHistory] = useState<Array<ProjectStatsPayload & { i: number }>>([]);
  const [statsView, setStatsView] = useState<'live' | 'minute' | 'hour' | 'day'>('live');
  const [historicalStats, setHistoricalStats] = useState<{
    data: Array<{ t: string; containers: Record<string, { cpu: number; memoryMb: number }>; totals: { cpu: number; memoryMb: number } }>;
    roles: string[];
  } | null>(null);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [logs, setLogs] = useState('');
  const [loading, setLoading] = useState(true);
  const [supabase, setSupabase] = useState<SupabaseStatus | null>(null);
  const [supabaseLoading, setSupabaseLoading] = useState(false);
  const [studioCreds, setStudioCreds] = useState<{ url: string; username: string; password: string } | null>(null);
  const [studioCredsLoading, setStudioCredsLoading] = useState(false);
  const [studioCredsError, setStudioCredsError] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {}).catch(() => {});
  };

  useEffect(() => {
    api.get('/projects/' + id).then((r) => { setProject(r.data); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    api.get('/projects/' + id + '/supabase').then((r) => setSupabase(r.data)).catch(() => setSupabase(null));
  }, [id]);

  useEffect(() => {
    if (!supabase?.configured || !id) {
      setStudioCreds(null);
      setStudioCredsLoading(false);
      setStudioCredsError(null);
      return;
    }
    setStudioCredsLoading(true);
    setStudioCredsError(null);
    api.get('/projects/' + id + '/supabase/studio-credentials')
      .then((r) => {
        setStudioCreds(r.data);
        setStudioCredsError(null);
      })
      .catch((e: any) => {
        setStudioCreds(null);
        setStudioCredsError(e?.response?.data?.message || 'Unable to load credentials');
      })
      .finally(() => setStudioCredsLoading(false));
  }, [supabase?.configured, id]);

  useEffect(() => {
    if (!project?.slug || statsView !== 'live') return;
    const base = import.meta.env.VITE_API_URL || '/api';
    const socketUrl = base.startsWith('http') ? new URL(base).origin : undefined;
    const socket = io(socketUrl ? `${socketUrl.replace(/\/$/, '')}/docker` : '/docker', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socket.emit('stats:subscribeProject', { projectSlug: project.slug });
    socket.on('projectStats', (payload: ProjectStatsPayload) => {
      setProjectStatsHistory((prev) => {
        const next = [...prev.slice(-59), { ...payload, i: prev.length }];
        return next;
      });
    });
    return () => {
      socket.emit('stats:unsubscribeProject');
      socket.close();
    };
  }, [project?.slug, statsView]);

  useEffect(() => {
    if (!id || statsView === 'live') {
      setHistoricalStats(null);
      return;
    }
    const fetchHistorical = () => {
      setHistoricalLoading(true);
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      api
        .get(
          `/projects/${id}/stats?interval=${statsView}&from=${from.toISOString()}&to=${to.toISOString()}`,
        )
        .then((r) => setHistoricalStats(r.data))
        .catch(() => setHistoricalStats(null))
        .finally(() => setHistoricalLoading(false));
    };
    fetchHistorical();
    const interval = setInterval(fetchHistorical, 60000); // refresh every 60s
    return () => clearInterval(interval);
  }, [id, statsView]);

  useEffect(() => {
    if (!id || !project) return;
    const token = localStorage.getItem('token');
    const base = import.meta.env.VITE_API_URL || '/api';
    fetch(`${base}/projects/${id}/logs`, { headers: { Authorization: 'Bearer ' + token } })
      .then((r) => {
        if (!r.ok) return r.text().then((t) => { throw new Error(t || r.statusText); });
        return r.text();
      })
      .then(setLogs)
      .catch((e) => setLogs('Failed to load logs: ' + (e?.message || 'Unknown error')));
  }, [id, project]);

  const control = async (action: string) => {
    try {
      await api.post('/projects/' + id + '/' + action);
      const { data } = await api.get('/projects/' + id);
      setProject(data);
    } catch (e) { console.error(e); }
  };

  if (loading || !project) return <p>Loading...</p>;

  const statusColor = project.status === 'running' ? 'var(--success)' : project.status === 'stopped' ? 'var(--error)' : 'var(--warning)';

  const palette = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#a4de6c', '#ff8042', '#ffbb28'];
  const isLive = statsView === 'live';
  const liveHasData = projectStatsHistory.length > 0;
  const histHasData = historicalStats && historicalStats.data.length > 0;

  let chartContent: React.ReactNode;
  if (!liveHasData && !histHasData) {
    chartContent = historicalLoading ? (
      <p className={styles.chartHint}>Loading past 7 days…</p>
    ) : isLive ? (
      <p className={styles.chartHint}>Waiting for live data…</p>
    ) : (
      <p className={styles.chartHint}>No historical data for the last 7 days.</p>
    );
  } else {
    let roles: string[];
    let cpuData: Array<Record<string, number | string>>;
    let memMbData: Array<Record<string, number | string>>;
    let xKey: string = 'i';
    if (isLive && liveHasData) {
      const last = projectStatsHistory[projectStatsHistory.length - 1];
      roles = [...last.meta.containers.map((c) => c.role), 'Total'];
      cpuData = projectStatsHistory.map((p, idx) => {
        const pt: Record<string, number | string> = { i: idx };
        for (const m of last.meta.containers) pt[m.role] = p.containers[m.id]?.cpu ?? 0;
        pt['Total'] = p.totals.cpu;
        return pt;
      });
      memMbData = projectStatsHistory.map((p, idx) => {
        const pt: Record<string, number | string> = { i: idx };
        for (const m of last.meta.containers) pt[m.role] = p.containers[m.id]?.memoryMb ?? 0;
        pt['Total'] = p.totals.memoryMb ?? 0;
        return pt;
      });
    } else if (histHasData && historicalStats) {
      roles = [...historicalStats.roles, 'Total'];
      xKey = 't';
      cpuData = historicalStats.data.map((d) => {
        const pt: Record<string, number | string> = { t: d.t };
        for (const role of historicalStats.roles) pt[role] = d.containers[role]?.cpu ?? 0;
        pt['Total'] = d.totals.cpu;
        return pt;
      });
      memMbData = historicalStats.data.map((d) => {
        const pt: Record<string, number | string> = { t: d.t };
        for (const role of historicalStats.roles) pt[role] = d.containers[role]?.memoryMb ?? 0;
        pt['Total'] = d.totals.memoryMb;
        return pt;
      });
    } else {
      const last = projectStatsHistory[projectStatsHistory.length - 1];
      roles = [...last.meta.containers.map((c) => c.role), 'Total'];
      cpuData = projectStatsHistory.map((p, idx) => {
        const pt: Record<string, number | string> = { i: idx };
        for (const m of last.meta.containers) pt[m.role] = p.containers[m.id]?.cpu ?? 0;
        pt['Total'] = p.totals.cpu;
        return pt;
      });
      memMbData = projectStatsHistory.map((p, idx) => {
        const pt: Record<string, number | string> = { i: idx };
        for (const m of last.meta.containers) pt[m.role] = p.containers[m.id]?.memoryMb ?? 0;
        pt['Total'] = p.totals.memoryMb ?? 0;
        return pt;
      });
    }
    chartContent = (
      <div className={styles.chartRow}>
        <div className={styles.chartBox}>
          <h4>CPU %</h4>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={cpuData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey={xKey} hide={xKey === 'i'} tick={{ fontSize: 10 }} />
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
            <LineChart data={memMbData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey={xKey} hide={xKey === 'i'} tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip contentStyle={{ background: 'var(--bg-secondary)' }} formatter={(v: number, name: string) => [v != null ? v.toFixed(2) + ' MB' : '-', name]} />
              <Legend />
              {roles.map((r, i) => (
                <Line key={r} type="monotone" dataKey={r} stroke={palette[i % palette.length]} strokeWidth={r === 'Total' ? 2.5 : 1.5} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

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
            {studioCredsLoading ? (
              <span className={styles.credLoading}>Loading…</span>
            ) : studioCredsError ? (
              <span className={styles.credError}>{studioCredsError}</span>
            ) : studioCreds ? (
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
            ) : null}
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
      <div className={styles.charts}>
        <h3>Resource Usage</h3>
        <div className={styles.statsBar}>
          <label>View:</label>
          <select value={statsView} onChange={(e) => setStatsView(e.target.value as 'live' | 'minute' | 'hour' | 'day')} className={styles.statsSelect}>
            <option value="live">Live</option>
            <option value="minute">Per Minute</option>
            <option value="hour">Per Hour</option>
            <option value="day">Per Day</option>
          </select>
          {statsView !== 'live' && (
            <button
              type="button"
              className={styles.refreshBtn}
              onClick={() => {
                if (!id) return;
                setHistoricalLoading(true);
                const to = new Date();
                const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
                api.get(`/projects/${id}/stats?interval=${statsView}&from=${from.toISOString()}&to=${to.toISOString()}`)
                  .then((r) => setHistoricalStats(r.data))
                  .catch(() => setHistoricalStats(null))
                  .finally(() => setHistoricalLoading(false));
              }}
              disabled={historicalLoading}
            >
              Refresh
            </button>
          )}
          {historicalLoading && <span className={styles.loading}>Loading…</span>}
        </div>
        {chartContent}
      </div>
      <div className={styles.logs}><h3>Logs</h3><pre className={styles.logContent}>{logs || 'No logs'}</pre></div>
    </div>
  );
}
