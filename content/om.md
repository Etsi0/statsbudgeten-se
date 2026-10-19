# Om Statsbudgeten

## Vad är det här?

Statsbudgeten.se visar Sveriges statsbudget som en karta. Varje ruta är ett utgiftsområde eller en inkomsttyp och storleken motsvarar beloppet. Klicka dig ner till enskilda anslag och inkomsttitlar, byt budgetår, följ hur en post har utvecklats över tid och räkna om beloppen till fasta priser med reglaget för inflation.

Alla belopp kommer oförändrade från de officiella källorna nedan. Sajten är fristående och har ingen koppling till Regeringskansliet eller SCB.

## Hur sajten är byggd

Sajten är byggd med [Bun](https://bun.sh), React och TypeScript. Regeringens Excelfiler och SCB:s inflationsserie läses in av egen kod och omvandlas till JSON som sajten visar. Kartan och diagrammen ritas utan externa diagrambibliotek. Koden är öppen och finns på [GitHub](https://github.com/kodalbert/statsbudgeten-se).

**Om AI.** Sajten har utvecklats tillsammans med Claude, en AI-assistent från Anthropic. AI:n har skrivit merparten av koden utifrån en design och instruktioner från mig, och jag har granskat och styrt arbetet. Ingen AI är inblandad i själva siffrorna: data hämtas från källorna och bearbetas av vanlig, deterministisk kod som kontrollerar att alla summor stämmer.

## Vem står bakom

Statsbudgeten.se görs av Albert. Du hittar mig på [proddalbert.se](https://proddalbert.se) och som @ProddAlbert i sociala medier, och du når mig på [albert@proddalbert.se](mailto:albert@proddalbert.se). Hör gärna av dig med fel, idéer eller frågor.

## Källor

- Statens budget: [Statens budget som Excel](https://www.regeringen.se/sveriges-regering/finansdepartementet/statens-budget/statens-budget-som-excel/) från Regeringskansliet, Finansdepartementet.
- Inflation: [Inflation i Sverige](https://www.scb.se/hitta-statistik/statistik-efter-amne/priser-och-ekonomiska-tendenser/priser/konsumentprisindex-kpi/pong/tabell-och-diagram/historiska-tal/inflation-i-sverige/) från SCB, konsumentprisindex (KPI).

Budgetfilerna är regeringens specifikation av budgetens utgifter och inkomster för respektive år, i tusental kronor. Inflationsjusteringen använder SCB:s årliga förändring av KPI och räknar om beloppen till prisnivån för det senaste år som har ett värde.

## Källmaterial

Filerna som sajten bygger på, i original:

[sources]
