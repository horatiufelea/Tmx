# TMX Tolmács: traducere vocală live pentru traininguri

Tu vorbești în engleză sau română, iar participanții aud traducerea în maghiară, pe telefon, în căștile proprii. Traducerea o face Palabra.

- **Pagina trainerului** (pe laptopul tău): pornești și oprești traducerea, alegi limba (EN/RO) și microfonul, afișezi codul QR, vezi ce se traduce și câți participanți sunt conectați.
- **Pagina participanților** (pe telefon, în maghiară): scanează codul QR, apasă „Hallgatás indítása” și ascultă. Nu trebuie instalat nimic.

## Varianta online (recomandată): Render

Aplicația rulează online, cu link fix și cod QR permanent. Nu trebuie pornit nimic de pe laptop.

1. Intră pe https://render.com și fă-ți cont cu **„Sign in with GitHub”** (contul horatiufelea).
2. Apasă **New → Blueprint** și alege repository-ul **tmx-tolmacs**. Render citește automat setările din `render.yaml`.
3. Când îți cere valorile, completează:
   - `PALABRA_API_KEY`: cheia ta Palabra (începe cu `plbr_`);
   - `TRAINER_PIN`: un PIN ales de tine.
4. Apasă **Apply**. După 2–3 minute primești un link de forma `https://tmx-tolmacs.onrender.com`.

Paginile aplicației:
- **Trainer:** `https://…onrender.com/trainer` (cu PIN);
- **Participanți:** `https://…onrender.com/hallgato` (la aceeași adresă duce și codul QR);
- **Pagina de test** (cheia se introduce în pagină): `https://…onrender.com/test`.

Planul gratuit „adoarme” după 15 minute fără activitate, iar prima deschidere durează aprox. un minut. Deschide pagina de trainer cu câteva minute înainte de training. Pentru o aplicație mereu pornită, schimbă planul în „Starter” (aprox. $7/lună) din setările serviciului.

Orice modificare urcată pe GitHub se publică automat pe Render.

## Instalare locală (alternativă, pe Windows)

1. Instalează **Node.js LTS** de pe https://nodejs.org (lasă opțiunile implicite).
2. Dezarhivează folderul `tmx-tolmacs` unde vrei (de ex. în Documente).
3. În folder, copiază fișierul `.env.example` și redenumește copia în `.env`. Deschide-l cu Notepad și completează:
   - `PALABRA_API_KEY=` cu cheia ta de la https://platform.palabra.ai/api-keys
   - `TRAINER_PIN=` cu un PIN ales de tine
4. Deschide folderul, scrie `cmd` în bara de adresă și apasă Enter. În fereastra care apare rulează:
   ```
   npm install
   ```

## Pornire la training

În același terminal, deschis din folderul aplicației:

```
npm start
```

Apoi deschide în browser (Chrome sau Edge) pagina **http://localhost:3000/trainer** și introdu PIN-ul.

### Cum ajung participanții la aplicație

**Varianta A, recomandată: link public, merge pe orice rețea (Wi-Fi sau date mobile)**

Lasă `npm start` să ruleze, deschide un **al doilea** terminal în același folder și rulează:

```
npm run tunnel
```

După câteva secunde apare un link de forma `https://ceva-aleatoriu.trycloudflare.com`. **Deschide pagina trainerului prin acest link** (`https://…trycloudflare.com/trainer`). Codul QR afișat va duce automat participanții acolo. Linkul se schimbă la fiecare pornire.

**Varianta B: aceeași rețea Wi-Fi**

Dacă laptopul și telefoanele sunt pe același Wi-Fi, codul QR de pe `http://localhost:3000/trainer` indică direct adresa laptopului. La prima pornire, Windows poate întreba despre firewall: alege **Permite** (rețele private). Atenție: multe rețele de hotel sau de sală de evenimente blochează comunicarea între dispozitive. În acest caz folosește varianta A.

## În timpul trainingului

- Apasă **Pornește traducerea**. Statusul devine „LIVE”.
- Comutatorul **English / Română** schimbă limba sursă și poate fi folosit chiar în timpul trainingului.
- **Pauză** oprește traducerea (de ex. la pauza de cafea). Participanții rămân conectați.
- **Oprește** încheie sesiunea și deconectează pe toată lumea. Apasă de două ori, ca să eviți opririle accidentale.
- **Afișează mare** pune codul QR pe tot ecranul, util pe proiector.
- Bara verde de sub microfon arată dacă microfonul te aude.

## Sfaturi pentru calitate

- Folosește un microfon lavalieră sau unul de tip cască, nu microfonul laptopului.
- Vorbește în fraze scurte și fă o mică pauză după fiecare idee.
- Nu bifa „Ascult și eu traducerea” decât dacă porți căști, altfel microfonul preia vocea traducerii.
- Participanții trebuie să țină ecranul telefonului aprins. Pe iPhone, sunetul se poate opri când se blochează ecranul.

## Costuri

Palabra taxează traducerea din voce în voce cu aprox. **$0,04/minut** (aprox. $2,40/oră), indiferent de numărul de participanți. Contul nou primește **$50 credit gratuit**. Soldul și consumul se văd pe https://platform.palabra.ai/billing.

## Probleme frecvente

| Problemă | Soluție |
|---|---|
| „Lipsește PALABRA_API_KEY” | Fișierul `.env` nu există sau cheia nu e completată. |
| „Nu am putut porni traducerea…” cu mesaj despre sold sau „blocked” | Creditul s-a terminat sau încă nu a fost activat: așteaptă un minut, apoi verifică pe billing. |
| Telefoanele nu deschid linkul | Folosește varianta A (`npm run tunnel`). |
| Participanții văd „ÉLŐ”, dar nu aud nimic | Să verifice volumul și să apese „Hang bekapcsolása”. Pentru diagnostic, deschide pe un telefon linkul cu `?debug` la final (`…/hallgato?debug`) și trimite-mi ce apare. |
| „Megtelt” (plin) | S-a atins limita de participanți. Mărește `MAX_LISTENERS` în `.env` și repornește. Dacă planul Palabra are o limită mai mică, aplicația coboară automat la cât acceptă Palabra (vezi mesajele din terminal). |

## Pentru dezvoltare

Codul sursă al paginilor e în `src/`. După modificări, rulează `npm run build`: generează `public/js/` și pagina de test `public/test.html`.
