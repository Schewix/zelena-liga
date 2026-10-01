// Sdílené SEO texty: používá klient (main.tsx) i serverové předrenderování (api/seo.ts).
export const SITE_URL = 'https://www.zelenaliga.cz';
export const DEFAULT_SEO = {
  title: 'Zelená liga | zelenaliga.cz',
  description: 'Zelená liga pro rozhodčí, veřejný přehled výsledků, soutěže, oddíly a fotogalerie.',
};

export const ROUTE_SEO: Record<string, { title: string; description: string }> = {
  '/': DEFAULT_SEO,
  '/aktualni-poradi': {
    title: 'Aktuální pořadí Zelené ligy',
    description: 'Průběžné pořadí oddílů v Zelené lize a bodování jednotlivých soutěží.',
  },
  '/aplikace': {
    title: 'Aplikace Zelené ligy',
    description: 'Veřejné aplikace a výsledkové přehledy soutěží Zelené ligy.',
  },
  '/aplikace/deskovky': {
    title: 'Deskové hry | Zelená liga',
    description: 'Aplikace pro turnaj deskových her v rámci Zelené ligy.',
  },
  '/aplikace/deskovky/pravidla': {
    title: 'Pravidla deskových her | Zelená liga',
    description: 'Pravidla a informace k soutěži deskových her v rámci Zelené ligy.',
  },
  '/aplikace/deskovky/standings': {
    title: 'Výsledky deskových her | Zelená liga',
    description: 'Aktuální výsledky a pořadí soutěže deskových her.',
  },
  '/aplikace/setonuv-zavod/vysledky': {
    title: 'Výsledky Setonova závodu | Zelená liga',
    description: 'Výsledky Setonova závodu pro výpočetku.',
  },
  '/clanky': {
    title: 'Články a novinky | Zelená liga',
    description: 'Aktuality, články a novinky ze soutěží Zelené ligy.',
  },
  '/fotogalerie': {
    title: 'Fotogalerie | Zelená liga',
    description: 'Fotogalerie ze soutěží a akcí Zelené ligy.',
  },
  '/plan-akci': {
    title: 'Plán akcí SPTO 2026/2027 | Zelená liga',
    description: 'Kalendář akcí Zelené ligy, sněmů a štábů SPTO ve školním roce 2026/2027.',
  },
  '/tipy': {
    title: 'Tipy od vedoucích | Zelená liga',
    description: 'Tipy na ubytování na mapě ČR a půjčování her a materiálu mezi oddíly.',
  },
  '/kontakty': {
    title: 'Kontakty | Zelená liga',
    description: 'Kontaktní informace pro organizátory Zelené ligy a SPTO Brno.',
  },
  '/sponzori': {
    title: 'Sponzoři | Zelená liga',
    description: 'Sponzoři a podpora činnosti SPTO a Zelené ligy.',
  },
  '/o-spto': {
    title: 'O SPTO Brno | Zelená liga',
    description: 'Informace o Sdružení pionýrských tábornických oddílů Brno.',
  },
  '/oddily': {
    title: 'Oddíly SPTO | Zelená liga',
    description: 'Přehled oddílů zapojených do Zelené ligy a SPTO Brno.',
  },
  '/souteze': {
    title: 'Soutěže | Zelená liga',
    description: 'Přehled soutěží Zelené ligy, pravidla a informace pro oddíly.',
  },
  '/souteze/brnenske-bloudeni': {
    title: 'Brněnské bloudění | Zelená liga',
    description: 'Městská orientační hra Brněnské bloudění v rámci Zelené ligy.',
  },
  '/souteze/deskove-hry': {
    title: 'Deskové hry | Zelená liga',
    description: 'Soutěž jednotlivců v deskových hrách v rámci Zelené ligy.',
  },
  '/souteze/draci-smycka': {
    title: 'Dračí smyčka | Zelená liga',
    description: 'Soutěž jednotlivců ve vázání uzlů v rámci Zelené ligy.',
  },
  '/souteze/karakoram': {
    title: 'Karakoram | Zelená liga',
    description: 'Soutěž týmů v překonávání lanových překážek v rámci Zelené ligy.',
  },
  '/souteze/kosmuv-prostor': {
    title: 'Kosmův prostor | Zelená liga',
    description: 'Doplňková soutěž oddílů Kosmův prostor v rámci Zelené ligy.',
  },
  '/souteze/lakros': {
    title: 'Lakros | Zelená liga',
    description: 'Turnaj v pionýrském lakrosu v rámci Zelené ligy.',
  },
  '/souteze/memorial-bedricha-stolicky': {
    title: 'Memoriál Bedřicha Stolíčky | Zelená liga',
    description: 'Atletická a silová soutěž Memoriál Bedřicha Stolíčky v rámci Zelené ligy.',
  },
  '/souteze/piotrio': {
    title: 'Pio Trio | Zelená liga',
    description: 'Soutěž tříčlenných hlídek Pio Trio v rámci Zelené ligy.',
  },
  '/souteze/ringobal': {
    title: 'Ringobal | Zelená liga',
    description: 'Sportovní turnaj v ringobalu pro oddíly Zelené ligy.',
  },
  '/souteze/setonuv-zavod': {
    title: 'Setonův závod | Zelená liga',
    description: 'Týmový tábornický závod hlídek na stanovištích v přírodě.',
  },
  '/souteze/vybijena': {
    title: 'Vybíjená | Zelená liga',
    description: 'Sportovní turnaj ve vybíjené v rámci Zelené ligy.',
  },
};
