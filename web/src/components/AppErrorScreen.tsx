import logo from '../assets/znak_SPTO_transparent.png';

type AppErrorScreenProps = {
  title?: string;
  description?: string;
  detail?: string | null;
};

// Poslední záchranná síť: vykresluje se i bez zbytku aplikace, takže nespoléhá na nic z homepage.
export default function AppErrorScreen({
  title = 'Něco se pokazilo',
  description = 'Aplikace narazila na chybu. Zkus stránku načíst znovu – když to nepomůže, dej nám vědět.',
  detail = null,
}: AppErrorScreenProps) {
  return (
    <div className="app-error-boundary" role="alert">
      <div className="app-error-boundary__card">
        <img className="app-error-boundary__logo" src={logo} alt="" width="72" height="72" />
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="app-error-boundary__actions">
          <button type="button" onClick={() => window.location.reload()}>
            Načíst znovu
          </button>
          <a className="app-error-boundary__link" href="/">
            Zpět na hlavní stránku
          </a>
        </div>
        {detail ? (
          <details className="app-error-boundary__detail">
            <summary>Technické detaily</summary>
            <code>{detail}</code>
          </details>
        ) : null}
      </div>
    </div>
  );
}
