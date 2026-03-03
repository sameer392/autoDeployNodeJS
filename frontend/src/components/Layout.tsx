import { Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, Box } from 'lucide-react';
import styles from './Layout.module.css';
export default function Layout() {
  const { admin, logout } = useAuth();
  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.brand}><Box size={24} /><span>Hosting Panel</span></div>
        <div className={styles.user}>
          <span>{admin?.email}</span>
          <button onClick={logout} className={styles.logout} title="Logout"><LogOut size={18} /></button>
        </div>
      </header>
      <main className={styles.main}><Outlet /></main>
    </div>
  );
}
