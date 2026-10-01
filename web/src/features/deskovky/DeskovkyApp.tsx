import '../../admin/AdminApp.css';
import ChangePasswordScreen from '../../auth/ChangePasswordScreen';
import { useAuth } from '../../auth/context';
import LoginScreen from '../../auth/LoginScreen';
import { ErrorState,LoadingState } from './components/PageState';
import './DeskovkyApp.css';
import { DeskovkyDashboard } from './DeskovkyDashboard';

function DeskovkyApp() {
  const { status, logout } = useAuth();

  if (status.state === 'loading') {
    return <LoadingState />;
  }

  if (status.state === 'error') {
    return <ErrorState message={status.message || 'Zkontroluj připojení a zkus to znovu.'} />;
  }

  if (status.state === 'unauthenticated') {
    return <LoginScreen variant="deskovky" />;
  }

  if (status.state === 'password-change-required') {
    return (
      <ChangePasswordScreen
        email={status.email}
        judgeId={status.judgeId}
        pendingPin={status.pendingPin}
        variant="deskovky"
      />
    );
  }

  if (status.state === 'locked') {
    return <LoginScreen requirePinOnly variant="deskovky" />;
  }

  if (status.state === 'authenticated') {
    return <DeskovkyDashboard auth={status} logout={logout} />;
  }

  return null;
}

export default DeskovkyApp;
