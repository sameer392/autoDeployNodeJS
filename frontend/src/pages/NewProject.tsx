import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import styles from './NewProject.module.css';

export default function NewProject() {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }
    if (!file) {
      setError('Please upload a ZIP file');
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', name);
      if (domain.trim()) formData.append('domains', domain.trim());
      const { data } = await api.post('/projects/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      navigate('/projects/' + data.id);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      setError(ax.response?.data?.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1>New Project</h1>
      <form onSubmit={handleSubmit} className={styles.form}>
        {error && <div className={styles.error}>{error}</div>}
        <label>
          Project name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-website"
            pattern="[a-z0-9][a-z0-9-_]{2,62}"
          />
        </label>
        <label>
          ZIP file (with Dockerfile)
          <input
            type="file"
            accept=".zip"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <label>
          Domain (optional)
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="app.example.com"
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Creating...' : 'Create'}
        </button>
      </form>
    </div>
  );
}
