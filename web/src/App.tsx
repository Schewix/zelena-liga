import './App.css';
import ChangePasswordScreen from './auth/ChangePasswordScreen';
import { useAuth } from './auth/context';
import LoginScreen from './auth/LoginScreen';
import AppFooter from './components/AppFooter';
import { StationApp } from './station/StationApp';
import { useStationRouting } from './station/useStationRouting';

function App() {
  const { status, refreshManifest, logout, refreshTokens } = useAuth();

  useStationRouting(status);

  if (status.state === 'loading') {
    return (
      <div className="auth-shell auth-overlay">
        <div className="auth-shell-content">
          <div className="auth-card">
            <h1>Načítám…</h1>
          </div>
        </div>
        <AppFooter variant="dark" />
      </div>
    );
  }

  if (status.state === 'error') {
    return (
      <div className="auth-shell auth-overlay">
        <div className="auth-shell-content">
          <div className="auth-card">
            <h1>Nelze načíst aplikaci</h1>
            <p className="auth-description">{status.message || 'Zkontroluj připojení nebo konfiguraci a zkus to znovu.'}</p>
            <button type="button" className="auth-primary" onClick={() => window.location.reload()}>
              Zkusit znovu
            </button>
          </div>
        </div>
        <AppFooter variant="dark" />
      </div>
    );
  }

  if (status.state === 'unauthenticated') {
    return <LoginScreen />;
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
    return (
      <StationApp
        auth={status}
        refreshManifest={refreshManifest}
        logout={logout}
        refreshTokens={refreshTokens}
      />
    );
  }

  return null;
}

export default App;
