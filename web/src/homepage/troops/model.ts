

export const TROOP_LOGO_SOURCES = Object.entries(
  import.meta.glob('../../assets/oddily/*.{png,jpg,jpeg,webp,svg}', {
    eager: true,
    import: 'default',
  }),
).reduce<Record<string, string>>((acc, [path, src]) => {
  const fileName = path.split('/').pop();
  if (!fileName) {
    return acc;
  }
  const key = fileName.split('.')[0]?.toLowerCase();
  if (key) {
    acc[key] = src as string;
  }
  return acc;
}, {});

// TODO: Napojit na API / Supabase pro reálné pořadí Zelené ligy.

// Fotogalerie jde přes /api/gallery. API umí číst veřejné Cloudflare R2 manifesty
// a v přechodném režimu spadnout zpět na Google Drive.
export type TroopLeaderTerm = {
  name: string;
  term: string;
  note?: string;
};

export type TroopLeaderHistoryGroup = {
  title: string;
  leaders: TroopLeaderTerm[];
};

export type Troop = {
  number: string;
  name: string;
  year?: string;
  leader: string;
  leaderEmail?: string;
  leaderPhone?: string;
  // Historie náčelníků vychází z evidence odznaků náčelníků PTO Brno (viz LEADER_HISTORY_SOURCE).
  leaderHistory?: TroopLeaderTerm[];
  leaderHistoryGroups?: TroopLeaderHistoryGroup[];
  leaderHistoryNote?: string;
  href: string;
  website?: string;
  logoKey?: string;
};

export const LEADER_HISTORY_SOURCE =
  'Zdroj: evidence odznaků náčelníků PTO Brno, kterou vede Roman „Rogi“ Valenta (poslední aktualizace 6. 5. 2025).';

export const TROOPS: Troop[] = [
  {
    number: '2',
    name: 'Poutníci',
    year: '1987',
    leader: 'Jan Dalecký (Honza)',
    leaderEmail: 'poutnicipto@seznam.cz',
    leaderPhone: '+420 735 039 145',
    href: '/oddily/2-poutnici',
    website: 'https://poutnici.org/',
    leaderHistory: [
      { name: 'Jan Dalecký (Honza)', term: '2023 – dosud' },
      { name: 'Anna Dalecká (Anča)', term: '2018–2022' },
      { name: 'Michal Smažil', term: '2014–2017' },
      { name: 'Jiří Balej', term: '2007–2013' },
      { name: 'Eva Matoušková', term: '2002–2007' },
      { name: 'Ondřej Komínek', term: '2001–2002' },
      { name: 'Jana Matoušková', term: '1994–2001' },
      { name: 'Aleš Šiller', term: '1990–1994' },
    ],
  },
  {
    number: '6',
    name: 'Nibowaka',
    year: '1982',
    leader: 'Tomáš Hála',
    leaderEmail: 'oddil@nibowaka.cz',
    leaderPhone: '+420 603 220 946',
    href: '/oddily/6-nibowaka',
    website: 'https://www.nibowaka.cz/',
    leaderHistory: [
      { name: 'Tomáš Hála (Tom)', term: '2020 – dosud' },
      { name: 'Michaela Geržičáková (Míša)', term: '2017–2020' },
      { name: 'Simona Langerová (Síma)', term: '2012–2017' },
      { name: 'Simona Virglerová (Sym)', term: '2010–2011' },
      { name: 'Pavel Řezníček (Řýzek)', term: '2007–2009' },
      { name: 'Tomáš Hála (Tom)', term: '1990–2006' },
    ],
  },
  {
    number: '10',
    name: 'Severka',
    year: '1984',
    leader: 'Ondřej Uldrijan',
    leaderEmail: 'ondra.u@severka.cz',
    leaderPhone: '+420 732 449 319',
    href: '/oddily/10-severka',
    website: 'https://www.severka.cz/',
    leaderHistory: [
      { name: 'Ondřej Uldrijan', term: '2022 – dosud' },
      { name: 'Jiří Vlček (Jiříček)', term: '2016–2022' },
      { name: 'Vítězslav Ondráček (Víťa)', term: '2011–2016' },
      { name: 'Petr Klouda (Ďoubalík)', term: '2009–2011' },
      { name: 'Hana Procházková', term: '1990–2009' },
    ],
  },
  {
    number: '11',
    name: 'Iktomi',
    year: '2013',
    leader: 'Linda Ráheľová (Ovce)',
    leaderEmail: 'ovce@vlcibrno.cz',
    leaderPhone: '+420 777 946 032',
    href: '/oddily/11-iktomi',
    website: 'https://www.vlcibrno.cz/',
    leaderHistory: [
      { name: 'Linda Ráheľová (Ovce)', term: '2024 – dosud' },
      { name: 'Dominik Hanzelín', term: '2023–2024' },
      { name: 'Milan Vlahovič (VI)', term: '2013–2022' },
      { name: 'Marie Sobková (Madla)', term: '1997–2002', note: 'jako 11. PTO 3. oddíl TSP Vlci' },
      { name: 'Jana Hradečná', term: '1992–1996', note: 'jako 11. PTO 3. oddíl TSP Vlci' },
      { name: 'Vladimír Paneš', term: '1990–1992', note: 'jako 11. PTO 3. oddíl TSP Vlci' },
    ],
  },
  {
    number: '15',
    name: 'Vatra',
    year: '1975',
    leader: 'Adam Urbášek',
    leaderEmail: 'vatra@pionyr.cz',
    leaderPhone: '+420 731 092 212',
    href: '/oddily/15-vatra',
    website: 'https://www.vatra.pionyr.cz/',
    leaderHistory: [
      { name: 'Luděk Maar', term: '1995–1996' },
      { name: 'Zdeněk Kucin', term: '1990–1992' },
    ],
    leaderHistoryNote: 'V evidenci SPTO záznamy o náčelnících 15. PTO Vatra z většiny let chybí.',
  },
  {
    number: '21',
    name: 'Hády',
    year: '1983',
    leader: 'Alena Nekvapilová (Áluš)',
    leaderEmail: 'alanekvapilova@seznam.cz',
    href: '/oddily/21-hady',
    website: 'https://www.pshady.cz/',
    leaderHistory: [
      { name: 'Alena Nekvapilová (Áluš)', term: '2023 – dosud' },
      { name: 'Hana Peštuková (Hanči)', term: '2015–2022' },
      { name: 'Barbora Peštuková', term: '2012–2015' },
      { name: 'Karolína Sochorová (Karolka)', term: '2010–2012' },
      { name: 'Jiří Kratochvíl (Coudy)', term: '2007–2010' },
      { name: 'Lenka Bártová', term: '2005–2007' },
      { name: 'Zdeněk Humpolík (Rumcajs)', term: '1991–2005', note: 'jako 21. PTO Cassiopea' },
      { name: 'Radek Boháček', term: '1990–1991', note: 'jako 21. PTO Cassiopea' },
    ],
  },
  {
    number: '',
    name: 'ZS PCV',
    year: '1972',
    leader: 'Matouš Procházka',
    leaderEmail: 'matous@zeeska.cz',
    leaderPhone: '+420 776 738 804',
    href: '/oddily/zs-pcv',
    website: 'https://www.zeeska.cz/',
    logoKey: 'zspcv',
    leaderHistoryNote:
      'ZS PCV sdružuje čtyři oddíly, každý s vlastním náčelníkem. Matouš Procházka je vedoucím celé skupiny. ' +
      'Náčelníci označení „nyní“ jsou převzatí z webu ZS PCV, evidence SPTO je zatím nemá zapsané.',
    leaderHistoryGroups: [
      {
        title: '24. PTO Života v přírodě',
        leaders: [
          { name: 'Markéta Rokytová (Makyša)', term: '2021 – dosud' },
          { name: 'Zuzana Urbanová', term: '2019–2021' },
          { name: 'Jan Švábenský (Johny)', term: '2014–2019' },
          { name: 'Tomáš Cimr', term: '2010–2014' },
          { name: 'Dušan Sup (Šudan)', term: '2008–2010' },
          { name: 'Ivana Špiříková', term: '2007–2008' },
          { name: 'Jakub Černý', term: '2002–2007' },
          { name: 'Zuzana Vrbková', term: '2001–2002' },
          { name: 'Kristýna Trojanová', term: '1996–2001' },
          { name: 'Zdeněk Foret', term: '1995–1996' },
          { name: 'Jitka Suská (Sůvička)', term: '1990–1991' },
        ],
      },
      {
        title: '25. PTO Ochrany přírody',
        leaders: [
          { name: 'Matěj Kříž', term: 'nyní' },
          { name: 'Aleš Ondráček', term: 'od 2023' },
          { name: 'Vojtěch Hynšt', term: '2020–2023' },
          { name: 'Matouš Procházka', term: '2014–2020' },
          { name: 'Lucie Štefanová (Štefka)', term: '2012–2014' },
          { name: 'Tomáš Venclíček', term: '2009–2012' },
          { name: 'Aleš Ondráček', term: '2006–2009' },
          { name: 'Jan Rudý', term: '2002–2005' },
          { name: 'Martin Viščor', term: '2001–2002' },
          { name: 'Olga Navrátilová', term: '1999–2001' },
          { name: 'Hana Vykoukalová', term: '1992–1999' },
          { name: 'Pavel Tříska (Kobo)', term: '1990–1992' },
        ],
      },
      {
        title: '26. PTO Kulturní historie',
        leaders: [
          { name: 'Eliška Stratilová', term: 'nyní' },
          { name: 'Tobias Filouš', term: 'od 2021' },
          { name: 'Barbora Klimentová', term: '2016–2020' },
          { name: 'Šimon Andresek', term: '2015–2016' },
          { name: 'Martin Vašek (Matematik)', term: '2013–2015' },
          { name: 'Jiří Mičánek (Drak)', term: '2009–2013' },
          { name: 'Martin Hlavoň', term: '2007–2009' },
          { name: 'Jan Kačer', term: '1999–2007' },
          { name: 'Hana Malá (Komárková)', term: '1995–1999' },
          { name: 'Petr Božek', term: '1992–1995' },
          { name: 'Hana Malá (Komárková)', term: '1991–1992' },
          { name: 'Vítek Urban (Qvído)', term: '1990–1991' },
        ],
      },
      {
        title: '27. PTO Lesní moudrosti',
        leaders: [
          { name: 'Jan Pospíšil (Hřebík)', term: 'nyní' },
          { name: 'Kateřina Mittnerová (Káťa)', term: 'od 2023' },
          { name: 'František Urban', term: '2017–2023' },
          { name: 'Jan Mittner (Míťas)', term: '2014–2017' },
          { name: 'Roman Hruška (Kivi)', term: '2011–2014' },
          { name: 'Jakub Zámoravec', term: '2009–2011' },
          { name: 'Anna Novotná (Anička)', term: '2007–2009' },
          { name: 'Michal Janík (Mižu)', term: '2001–2007' },
          { name: 'Martin Kubín', term: '1998–2001' },
          { name: 'Jaroslav Suský (Vlk)', term: '1991–1998' },
          { name: 'Vlasta Tišnovská', term: '1990–1991' },
        ],
      },
    ],
  },
  {
    number: '32',
    name: 'Severka',
    year: '1985',
    leader: 'Ondřej Ševčík (Ševa)',
    leaderEmail: 'osevcik@severka.org',
    leaderPhone: '+420 731 019 469',
    href: '/oddily/32-severka',
    website: 'https://severka.org/',
    leaderHistory: [
      { name: 'Ondřej Ševčík (Ševa)', term: '2023 – dosud' },
      { name: 'Eliška Masaříková (Elis)', term: '2013–2023' },
      { name: 'Zuzana Del Favero (Cucka)', term: '1994–2013' },
      { name: 'Hana Nováková', term: '1992–1994' },
      { name: 'Přemysl Jeřábek', term: '1990–1992' },
    ],
  },
  {
    number: '34',
    name: 'Tulák',
    year: '1981',
    leader: 'Václav Palík (Vašek)',
    leaderEmail: 'vasek@tulak.org',
    leaderPhone: '+420 608 552 185',
    href: '/oddily/34-tulak',
    website: 'https://www.tulak.org/',
    leaderHistory: [
      { name: 'Václav Palík (Vašek)', term: '2025 – dosud' },
      { name: 'Šimon Chalabala', term: '2023–2025' },
      { name: 'František Reitter (Fanda)', term: '2017–2023' },
      { name: 'Martin Šmíd (Mini)', term: '2014–2017' },
      { name: 'Barbora Hejlová (Bára)', term: '2010–2013' },
      { name: 'Petr Hloušek (Tukan)', term: '2007–2010' },
      { name: 'Veronika Babková', term: '2004–2007' },
      { name: 'Luboš Horký (Lubošek)', term: '2001–2004' },
      { name: 'Petr Hloušek (Tukan)', term: '2000–2001' },
      { name: 'Tomáš Kopeček (Kopec)', term: '1995–2000' },
      { name: 'Jiří Šrámek', term: '1990–1992' },
    ],
  },
  {
    number: '41',
    name: 'Dráčata',
    year: '1992',
    leader: 'Ing. Jaroslav Pipota',
    leaderEmail: 'dracata@volny.cz',
    leaderPhone: '+420 605 853 006',
    href: '/oddily/41-dracata',
    website: 'https://dracata-brno.cz/',
    leaderHistory: [{ name: 'Jaroslav Pipota', term: '1990 – dosud' }],
  },
  {
    number: '48',
    name: 'Stezka',
    year: '1983',
    leader: 'Tomáš Vondrák (Zuby)',
    leaderEmail: 'zuby@stezka.org',
    leaderPhone: '+420 723 162 365',
    href: '/oddily/48-stezka',
    website: 'https://stezka.org/',
    leaderHistory: [
      { name: 'Tomáš Vondrák (Zuby)', term: '2024 – dosud' },
      { name: 'Ivana Krumlová (Vlk)', term: '2021–2024' },
      { name: 'Stanislav Pikula (Krysa)', term: '2012–2021' },
      { name: 'Alexandra Kaplanová (Saša)', term: '2004–2011' },
      { name: 'Petr Bureš', term: '1990–2004' },
    ],
  },
  {
    number: '63',
    name: 'Phoenix',
    year: '1992',
    leader: 'Roman Valenta (Rogi)',
    leaderEmail: 'rogis@seznam.cz',
    leaderPhone: '+420 720 114 501',
    href: '/oddily/63-phoenix',
    website: 'https://63ptophoenix.cz/',
    leaderHistory: [{ name: 'Roman Valenta (Rogi)', term: '1997 – dosud' }],
  },
  {
    number: '64',
    name: 'Lorien',
    year: '1996',
    leader: 'René Hrabovský (Renda)',
    leaderEmail: 'oddil@pto-lorien.cz',
    leaderPhone: '+420 604 208 908',
    href: '/oddily/64-lorien',
    website: 'https://www.pto-lorien.cz/home/',
    leaderHistory: [
      { name: 'René Hrabovský (Renda)', term: '2000 – dosud' },
      { name: 'Lenka Ostřížková', term: '1997–1999' },
    ],
  },
  {
    number: '66',
    name: 'Brabrouci Modřice',
    year: '1998',
    leader: 'Veronika Obdržálková (Špion)',
    leaderEmail: 'spion@brabrouci.cz',
    href: '/oddily/66-brabrouci-modrice',
    website: 'https://brabrouci.cz/',
    leaderHistory: [
      { name: 'Veronika Obdržálková (Špion)', term: '2023 – dosud' },
      { name: 'Tomáš Hejtmánek (Kečup)', term: '2015–2023' },
      { name: 'Pavla Pokorná (Paša)', term: '2013–2015' },
      { name: 'Barbora Pokorná (Babča)', term: '2010–2013' },
      { name: 'Jana Pokorná (Muflonka)', term: '2000–2009' },
    ],
  },
  {
    number: '99',
    name: 'Kamzíci',
    leader: 'Radek Slavík (Bambus)',
    href: '/oddily/99-kamzici',
    website: 'https://www.facebook.com/Kamzici/?locale=cs_CZ',
    leaderHistory: [
      { name: 'Radek Slavík (Bambus)', term: '2013 – dosud' },
      { name: 'Erik Kališ', term: '2010–2013' },
    ],
  },
  {
    number: '111',
    name: 'Vinohrady',
    year: '1990',
    leader: 'Radek Zeman',
    leaderEmail: 'r-zeman@volny.cz',
    leaderPhone: '+420 605 052 711',
    href: '/oddily/111-vinohrady',
    website: 'https://www.psvinohrady.cz/',
    leaderHistory: [
      { name: 'Radek Zeman', term: '2022 – dosud' },
      { name: 'Jakub Coufal (Coufi)', term: '2016–2022' },
      { name: 'Zuzana Kiliánová (Zubejda)', term: '2013–2016' },
      { name: 'Jitka Matějková (Běta)', term: '2011–2013' },
      { name: 'Kateřina Konečná (Kača)', term: '2006–2011' },
    ],
  },
  {
    number: '172',
    name: 'Pegas',
    year: '1993',
    leader: 'Michal Kubeš (Pat)',
    href: '/oddily/172-pegas',
    leaderHistory: [
      { name: 'Michal Kubeš (Pat)', term: '2015 – dosud' },
      { name: 'Gabriela Štefanová (Gába)', term: '2012–2014' },
      { name: 'Michal Kubeš (Pat)', term: '2005–2012' },
      { name: 'Michal Spurný (Kula)', term: '1996–2005' },
      { name: 'Michal Šikuta', term: '1995–1996' },
    ],
  },
  {
    number: '176',
    name: 'Vlčata',
    year: '1971',
    leader: 'Jakub Nejezchleba (Boris)',
    leaderEmail: 'boris@vlcata.cz',
    leaderPhone: '+420 739 152 006',
    href: '/oddily/176-vlcata',
    website: 'https://www.vlcata.cz/',
    leaderHistory: [
      { name: 'Jakub Nejezchleba (Boris)', term: '2024 – dosud' },
      { name: 'Adam Vyklický (Áda)', term: '2015–2024' },
      { name: 'Jan Ondroušek (Žokej)', term: '2006–2015' },
      { name: 'Milan Appel (Mikin)', term: '1990–2006' },
    ],
  },
  {
    number: 'x',
    name: 'Žabky',
    year: '1993',
    leader: 'Pavlína Héčová (Spajdik)',
    leaderEmail: 'pionyr.jedovnice@seznam.cz',
    leaderPhone: '+420 736 269 919',
    href: '/oddily/x-zabky',
    website: 'https://pionyr.jedovnice.cz/',
    logoKey: 'zabky',
    leaderHistory: [
      { name: 'Pavlína Héčová (Spajdik)', term: '2015 – dosud' },
      { name: 'Kristýna Knechtová', term: '2015' },
      { name: 'Eva Kovaříková', term: '2010–2015' },
    ],
  },
];

export function formatTroopName(troop: Troop) {
  if (!troop.number || !/^\d+$/.test(troop.number)) {
    return troop.name;
  }
  return `${troop.number}. PTO ${troop.name}`;
}

export function formatTroopDescription(troop: Troop) {
  const detailParts = [];
  if (troop.year) {
    detailParts.push(`založeno ${troop.year}`);
  }
  if (troop.leader) {
    detailParts.push(`náčelník ${troop.leader}`);
  }
  return detailParts.join(' · ');
}

export function resolveTroopLogo(troop: Troop) {
  const keyFromNumber = troop.number && /^\d+$/.test(troop.number) ? troop.number : null;
  const key = (troop.logoKey ?? keyFromNumber ?? '').toLowerCase();
  if (!key) {
    return null;
  }
  return TROOP_LOGO_SOURCES[key] ?? null;
}
