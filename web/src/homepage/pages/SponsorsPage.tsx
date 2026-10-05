import brnoLogo from '../../assets/sponsors/brno.png';
import southMoravianRegionLogo from '../../assets/sponsors/jihomoravsky-kraj.jpg';
import { SiteShell } from '../layout/SiteShell';

export function SponsorsPage() {
  return (
    <SiteShell>
      <main className="homepage-main homepage-single" aria-labelledby="sponsors-heading">
        <h1 id="sponsors-heading">Sponzoři</h1>
        <p className="homepage-lead">Podpořte děti.</p>
        <div className="homepage-card sponsors-content">
          <p>Jen stěží bychom mohli fungovat bez podpory našich přátel, partnerů a sponzorů.</p>
          <p>
            Díky dotacím, grantům, sponzorským darům, podpoře materiální a zejména práci
            dobrovolníků zajišťujeme veškerou naši činnost, a že jí není málo. Pomoc směřuje
            vždy dětem, do jejich rozvoje a zábavy, do naší budoucnosti.
          </p>
          <p>Činnost je spolufinancována z dotací Jihomoravského kraje, Statutárního města Brna a MŠMT.</p>
          <div className="sponsors-logos" aria-label="Loga podporovatelů">
            <a
              className="sponsors-logo"
              href="https://www.jmk.cz"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src={southMoravianRegionLogo} alt="Jihomoravský kraj" width="1093" height="262" />
            </a>
            <a
              className="sponsors-logo"
              href="https://www.brno.cz"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src={brnoLogo} alt="Statutární město Brno" width="1526" height="687" />
            </a>
          </div>
          <p>
            Sami můžete rozhodnout, koho a jak podpoříte – ať už finančně, materiálně nebo
            přenesením svých dobrých zkušeností s Pionýrem dále mezi své známé. Více informací na
            emailu <a href="mailto:kancelar@jmpionyr.cz">kancelar@jmpionyr.cz</a>.
          </p>
          <p>A děkujeme všem, kteří nám pomáhají.</p>
          <p>
            V současné době máme uzavřené Memorandum o spolupráci s Jihomoravským krajem.
          </p>
          <p>
            <a href="/documents/memorandum-o-spolupraci.pdf" target="_blank" rel="noopener noreferrer">
              Memorandum o spolupráci (PDF)
            </a>
          </p>
        </div>
      </main>
    </SiteShell>
  );
}
