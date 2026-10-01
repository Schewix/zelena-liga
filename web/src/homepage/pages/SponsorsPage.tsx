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
          <p>
            Za naší činností stojí pomoc přátel, partnerů a sponzorů. Dotace, granty, finanční
            i materiální dary a především čas dobrovolníků nám umožňují připravovat aktivity
            pro děti. Každá taková podpora přispívá k jejich rozvoji, zážitkům a budoucnosti.
          </p>
          <p>
            Na financování činnosti se prostřednictvím dotací podílejí Jihomoravský kraj,
            statutární město Brno a Ministerstvo školství, mládeže a tělovýchovy (MŠMT).
          </p>
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
            Způsob pomoci si můžete vybrat sami: finanční příspěvek, materiální dar nebo
            doporučení Pionýra na základě vlastních dobrých zkušeností. Podrobnosti vám rádi
            sdělíme na <a href="mailto:kancelar@jmpionyr.cz">kancelar@jmpionyr.cz</a>.
          </p>
          <p>Všem našim podporovatelům patří velké poděkování.</p>
        </div>
      </main>
    </SiteShell>
  );
}
