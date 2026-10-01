

export interface Competition {
  slug: string;
  name: string;
  description?: string;
  href: string;
  ruleMatchers: string[];
}

export const COMPETITIONS: Competition[] = [
  {
    slug: 'setonuv-zavod',
    name: 'Setonův závod',
    description: 'Týmový tábornický závod hlídek na stanovištích v přírodě.',
    href: '/souteze/setonuv-zavod',
    ruleMatchers: ['pravidla-souteze', 'pravidla-stanovist', 'zelena-liga', 'stavba-stanu'],
  },
  {
    slug: 'zapsem',
    name: 'ZaPsem',
    description: 'Šifrovací hra pro týmy – hlídky luští šifry na trase podle vlastního tempa.',
    href: '/souteze/zapsem',
    ruleMatchers: ['zapsem'],
  },
  {
    slug: 'draci-smycka',
    name: 'Dračí smyčka',
    description: 'Soutěž jednotlivců ve vázání uzlů.',
    href: '/souteze/draci-smycka',
    ruleMatchers: ['draci-smycka'],
  },
  {
    slug: 'kosmuv-prostor',
    name: 'Kosmův prostor',
    description: 'Doplňková soutěž, kde děti a vedoucí hodnotí web, kroniku a fashion oddílů.',
    href: '/souteze/kosmuv-prostor',
    ruleMatchers: ['kosmuv-prostor'],
  },
  {
    slug: 'ringobal',
    name: 'Ringobal',
    description: 'Sportovní turnaj v ringobalu pro oddíly.',
    href: '/souteze/ringobal',
    ruleMatchers: ['ringobal'],
  },
  {
    slug: 'deskove-hry',
    name: 'Deskové hry',
    description: 'Soutěž jednotlivců v deskových hrách.',
    href: '/souteze/deskove-hry',
    ruleMatchers: ['deskove-hry'],
  },
  {
    slug: 'brnenske-bloudeni',
    name: 'Brněnské bloudění',
    description: 'Městská orientační hra v Brně pro týmy.',
    href: '/souteze/brnenske-bloudeni',
    ruleMatchers: ['bloudeni'],
  },
  {
    slug: 'piotrio',
    name: 'Pio Trio',
    description: 'Soutěž tříčlenných hlídek ve třech netradičních dovednostech.',
    href: '/souteze/piotrio',
    ruleMatchers: ['piotrio'],
  },
  {
    slug: 'karakoram',
    name: 'Karakoram',
    description: 'Soutěž šestičlených týmů v překonávání lanových překážek.',
    href: '/souteze/karakoram',
    ruleMatchers: ['karakoram'],
  },
  {
    slug: 'lakros',
    name: 'Lakros',
    description: 'Turnaj v pionýrském lakrosu podle soutěžních pravidel.',
    href: '/souteze/lakros',
    ruleMatchers: ['lakros'],
  },
  {
    slug: 'vybijena',
    name: 'Vybíjená',
    description: 'Sportovní turnaj ve vybíjené.',
    href: '/souteze/vybijena',
    ruleMatchers: ['vybijena'],
  },
  {
    slug: 'memorial-bedricha-stolicky',
    name: 'Memoriál Bedřicha Stolíčky',
    description: 'Soutěž pro jednotlivce v atletických, silových a mrštnostních disciplínách.',
    href: '/souteze/memorial-bedricha-stolicky',
    ruleMatchers: ['mbs'],
  },
];
