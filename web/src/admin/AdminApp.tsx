import ChangePasswordScreen from '../auth/ChangePasswordScreen';
import { useAuth } from '../auth/context';
import LoginScreen from '../auth/LoginScreen';
import AppFooter from '../components/AppFooter';
import './AdminApp.css';
import { AdminDashboard } from './AdminDashboard';
import AdminLoginScreen from './AdminLoginScreen';

function AdminApp() {
  const { status, refreshManifest, logout } = useAuth();

  if (status.state === 'loading') {
    return (
      <div className="admin-shell admin-shell--center">
        <div className="admin-card admin-card--narrow">
          <h1>Načítám…</h1>
        </div>
        <AppFooter variant="minimal" />
      </div>
    );
  }

  if (status.state === 'error') {
    return (
      <div className="admin-shell admin-shell--center">
        <div className="admin-card admin-card--narrow">
          <h1>Nelze načíst aplikaci</h1>
          <p>{status.message || 'Zkontroluj připojení nebo konfiguraci a zkus to znovu.'}</p>
          <button
            type="button"
            className="admin-button admin-button--primary"
            onClick={() => window.location.reload()}
          >
            Zkusit znovu
          </button>
        </div>
        <AppFooter variant="minimal" />
      </div>
    );
  }

  if (status.state === 'unauthenticated') {
    return <AdminLoginScreen />;
  }

  if (status.state === 'password-change-required') {
    return (
      <ChangePasswordScreen
        email={status.email}
        judgeId={status.judgeId}
        pendingPin={status.pendingPin}
      />
    );
  }

  if (status.state === 'locked') {
    return <LoginScreen requirePinOnly />;
  }

  if (status.state === 'authenticated') {
    return <AdminDashboard auth={status} refreshManifest={refreshManifest} logout={logout} />;
  }

  return null;
}

export default AdminApp;
