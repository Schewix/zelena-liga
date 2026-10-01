# Odesílání přístupových e-mailů

Funkce vybírá neodeslané `initial-password-issued` události z
`judge_onboarding_events` pro nakonfigurovaný závod a události vytvořené
v administraci (`metadata.source = admin-assignment`) napříč ročníky.
Při ručním vytvoření rozhodčího API zařadí přístupové údaje do této fronty;
heslo nevrací do prohlížeče. Existujícím účtům heslo nemění ani neposílá.
Zařazení do fronty není potvrzením doručení; odeslání provede pravidelný běh funkce.
Režim `dry_run=true`
nic neodesílá ani nezapisuje.

## Chyby a opakování

- Základní kontrola příjemce zachytí například dvě zavináče ještě před
  voláním Resendu; adresu automaticky neopravuje.
- Trvalé chyby Resendu (např. HTTP 422) uloží `delivery_status: failed`.
  Další běhy danou událost přeskočí, dokud ji správce po opravě příčiny
  znovu nezařadí.
- Síťové chyby, HTTP 408, dočasné konflikty 409, 429 a 5xx se opakují
  nejvýše pětkrát celkem, s prodlevami 5, 10, 20 a 40 minut. Skutečný
  čas opakování závisí na rozvrhu spouštění funkce.
- `metadata.last_delivery_error` obsahuje stav, kód, zprávu a čas chyby.
  Heslo a API klíč jsou ze zprávy odstraněné. Původní `metadata.password`
  zůstává k dispozici pro opakování a po úspěšném odeslání se odstraní.
- Pokud Resend zprávu přijal, ale první zápis potvrzení selže, funkce
  se pokusí uložit potvrzení ještě v chybové větvi. Pokud ani tento zápis
  neuspěje, vrací HTTP 500. Nejde o záruku právě jednoho doručení při
  výpadku databáze, nejasném výsledku síťového požadavku či souběžných bězích.
- Selhání zápisu stavu vrací HTTP 500, aby nezůstalo skryté za úspěšnou
  odpovědí funkce. Jednotlivé evidované chyby doručení jsou v souhrnu `failed`.

## Diagnostika

Export `logs-1790677769664.csv` obsahoval 4 113 požadavků `POST /emails`
s HTTP 422 mezi 15. a 29. zářím 2026. Neobsahuje těla požadavků ani odpovědí,
takže z něj nelze určit odmítnuté pole nebo příjemce. Pravidelnost a Deno
user agent odpovídají této plánované Edge Function; původ je potřeba potvrdit
podle detailu požadavku v Resendu či logu konkrétního běhu v Supabase.
Původní implementace chyby pouze přidala do odpovědi a nechala událost bez
změny, takže ji další běh znovu zkusil odeslat.

Pro přehled chyb bez vypsání uložených hesel:

```sql
select id, judge_id,
       metadata ->> 'delivery_status' as delivery_status,
       metadata ->> 'delivery_attempts' as delivery_attempts,
       metadata ->> 'next_retry_at' as next_retry_at,
       metadata -> 'last_delivery_error' as last_delivery_error
from judge_onboarding_events
where metadata ->> 'delivery_status' in ('failed', 'retry');
```

Následně dodaný detail jednoho požadavku potvrdil `validation_error`:
`Invalid to field`. Příjemce měl v adrese dvě zavináče. To vysvětluje
odmítnutí tohoto požadavku; CSV samo nepotvrzuje stejný obsah všech pokusů.
Ověřenou adresu oprav v příslušném záznamu `judges.email` i ve zdrojové
tabulce synchronizace. Odesílač upřednostňuje adresu z `judges` před
`metadata.email`, takže oprava samotných metadata nestačí.
Kódy viz https://resend.com/docs/api-reference/errors.

## Nasazení a obnovení konkrétní události

Změna nevyžaduje migraci databáze; stav je uložený v existujícím JSON metadata.
Je třeba nasadit Supabase funkci `send-onboarding-emails`; nasazení webu ji
samo neaktualizuje. Testy používají pouze simulovanou databázi a HTTP.

Po opravě příčiny (například adresy v `judges.email` nebo nastavení odesílatele)
lze resetovat stav **jedné ověřené neodeslané události**. Nahraď parametr
`$1` jejím UUID; odstranění stavu umožní skutečné odeslání při dalším běhu:

```sql
update judge_onboarding_events
set metadata = metadata
  - 'delivery_status'
  - 'delivery_attempts'
  - 'next_retry_at'
  - 'last_delivery_error'
where id = $1::uuid
  and metadata ->> 'type' = 'initial-password-issued'
  and metadata ->> 'sent' is distinct from 'true';
```

Před obnovením ověř, že jde stále o platné přístupové údaje. Režim
`force-reset` mění heslo rozhodčího; není určený k pouhému ověření chyb.

## Testy

Z adresáře `web`:

```sh
npm run test -- --run src/__tests__/onboardingEmailDelivery.test.ts
```
