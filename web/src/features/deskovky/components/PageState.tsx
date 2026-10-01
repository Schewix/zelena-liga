import AppFooter from '../../../components/AppFooter';

export function LoadingState() {
  return (
    <div className="admin-shell admin-shell--center">
      <div className="admin-card admin-card--narrow">
        <h1>Načítám…</h1>
      </div>
      <AppFooter variant="minimal" />
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="admin-shell admin-shell--center">
      <div className="admin-card admin-card--narrow">
        <h1>Nelze načíst aplikaci</h1>
        <p>{message || 'Zkontroluj připojení a zkus to znovu.'}</p>
      </div>
      <AppFooter variant="minimal" />
    </div>
  );
}
