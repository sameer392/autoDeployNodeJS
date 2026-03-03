import axios from 'axios';
const baseURL = import.meta.env.VITE_API_URL || '/api';
export const api = axios.create({ baseURL, headers: { 'Content-Type': 'application/json' } });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem('token');
  if (t) c.headers.Authorization = 'Bearer ' + t;
  return c;
});
api.interceptors.response.use((r) => r, (e) => {
  if (e.response?.status === 401) {
    localStorage.removeItem('token');
    window.location.href = '/login';
  }
  return Promise.reject(e);
});
