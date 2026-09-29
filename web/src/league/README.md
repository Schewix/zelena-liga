# Výpočet bodů Zelené ligy

Sekce `/redakce#body-zl` je dostupná po přihlášení do redakce. Výpočet běží
v prohlížeči; nepoužívá databázi konkrétního závodu a soubory se na server
neodesílají. Administrace Setonova závodu odkazuje na tuto sekci.

## Postup

1. Nahraj původní XLSX nebo CSV (UTF-8; čárka, středník či tabulátor).
2. U každého výsledkového listu zkontroluj řádek záhlaví, poslední řádek
   výsledků a sloupce: soutěžící/hlídka, oddíl, výsledek; volitelně kategorii,
   pohlaví a stav/pořadí. Nevýsledkové listy vypni. Zůstávají ve výstupu.
3. Nastav koeficient, počet nejlepších výsledků (výchozí 4; 0 = všechny)
   a body za účast (výchozí 10). Koeficient je povinné kladné číslo,
   výchozí hodnota je 1.
4. Připrav a stáhni návrhy. V Excelu zkopíruj preferovanou variantu do
   sloupce **Vybrané body ZL** nebo jeho hodnoty uprav ručně. Výchozí varianta
   je bez cut-off. Zachovej záhlaví a identifikační údaje; při řazení zahrň
   i skrytý sloupec ID. Oddíl/rozdělení lze upravit pro sjednocení názvů.
5. Nahraj upravený návrh, zkontroluj součet oddílů a stáhni výsledky.

Nastavení není trvale ukládáno. Přepnutí na jinou sekci redakce zachovává
rozpracovanou úlohu. Po obnovení stránky nahraj stejný původní soubor a
nastav stejné parametry. ID se odvozuje od SHA-256 původního souboru,
nastavení, listu a čísla řádku. Duplicitní jména nevadí. Návrhy pro jiný
soubor či jiný koeficient se odmítnou.

## Pásma a pravidla

- Body: 16, 12, 9, 6, 4, 2, 1. Shodné výsledky dostávají stejný návrh.
- Zachovány čtyři metody ze Setonova adminu: rovnoměrné intervaly výsledků,
  automatický cut-off, gauss s omezenými kandidáty a gauss s otevřenými
  kandidáty. Cut-off hodnotí mezery ve druhé polovině výsledků, zohledňuje
  velikost zbývající skupiny a dává výsledkům pod hranicí 1 bod.
- Pevný minimální odstup 9 bodů ze Setonova výpočtu byl odstraněn: výrazná
  mezera musí překročit dvojnásobek mediánu kladných mezer v posuzované
  části. Metoda tak funguje i při jiné jednotce výsledku, např. v minutách.
- Nižší výsledek může být lepší. Časové výsledky podporují `m:ss`, `h:mm:ss`
  s desetinnou částí sekund i dobu uloženou jako čas Excelu. Číselné sekundy
  patří do formátu **Číslo**, nikoliv **Čas**. Časy se pro výpočet převádějí
  na sekundy; původní buňky se nemění.
- Kategorie a pohlaví určují skupinu napříč listy. Bez kategorie se použije
  zadaný název skupiny, výchozí je název listu. Směry hodnocení uvnitř stejné
  skupiny se nesmějí lišit. Malé kategorie se neslučují automaticky;
  sloučení nastav uživatel společným názvem skupiny či sloupcem Kategorie.
- DSQ/DNS = 0 bodů a žádná započtená účast. DNF = 1 bod, účast se započítá.
  Prázdný či nečíselný výsledek bez takového stavu je chyba, nikoliv nula.
- Smíšené hlídky se zadávají explicitně: `Oddíl A=2; Oddíl B=1` přidělí
  dvě třetiny bodů prvnímu oddílu a třetinu druhému. Samotné názvy oddělené
  středníkem znamenají stejné podíly. Názvy se sjednocují podle velikosti
  písmen a diakritiky; odlišné názvy téhož oddílu oprav v návrhu.
- Každý soutěžní řádek přispívá do oddílu jednou. Nejlepší příspěvky se
  vybírají přes všechny kategorie. Výsledek oddílu = jejich součet ×
  koeficient + body za účast; účast se přičte jednou za oddíl. Výpočty se
  průběžně nezaokrouhlují, výstup zobrazí dvě desetinná místa.

## Výstup a rozsah podpory

Výstup načítá původní sešit přes ExcelJS a doplňuje sloupce za poslední
původní sloupec vybraných listů. Nepřepisuje původní hodnoty, vzorce,
pořadí řádků ani existující souhrny. Přidává listy **ZL – oddíly** a
**ZL – příspěvky**; při kolizi názvů přidá číselný přívlastek. CSV je
exportováno jako XLSX, původní buňky zůstávají textové.

Podporovány jsou běžné výsledkové tabulky XLSX. Nejde o bezeztrátový editor
všech rozšíření Excelu: makra/XLSM a starý XLS nejsou podporovány a pokročilé
objekty mimo datový model ExcelJS nemusejí přežít opětovný zápis. Vzorce
sloužící jako vstup pro výpočet musí mít uložený výsledek; aplikace sama
vzorce nepřepočítává. Čísla kategorií, rozsahy a sloupce potvrzuje uživatel,
nejde o odhadování struktury libovolného vizuálně formátovaného dokumentu.

## Ověření

Z adresáře `web`:

```sh
npm run test -- --run src/__tests__/leagueWorkbooks.test.ts
npx tsc --noEmit -p tsconfig.json
npm run build
```

Testy pokrývají intervaly a shody, změnu jednotek, časové výsledky, více
listů, přerovnání řádků, chybějící/duplicitní/cizí/nesouhlasící ID,
neplatné body, podíly smíšených hlídek, součet nejlepších výsledků,
koeficient, účast a zachování původních buněk, stylů, vzorců a listů.
