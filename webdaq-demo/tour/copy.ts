/**
 * The guided tour's copy, English and Italian (design §4.1, extended to every
 * capability of the demo). Statements about WebDAQ follow its code at the pin;
 * statements about the simulation say they are about the simulation.
 * Wording rule: the 3.5 MV accelerator is "the MV machine of the Bellotti Ion
 * Beam Facility (BIBF)".
 */
export type Kind = 'hpge' | 'bgo' | 'ej309' | 'he3'
type Txt = string | ((k: Kind) => string)
export interface StepCopy { title: string; body: Txt; doing?: Txt }

export interface TourCopy {
  label: string
  step: (i: number, n: number) => string
  next: string; back: string; finish: string; close: string; doIt: string; goTo: (page: string) => string
  done: string; waiting: string
  pages: Record<string, string>
  live: {
    rate: (ch: number, r: number, pu: number) => string
    fwhm: (e: number, model: number | null, fit: number | null, rel: boolean) => string
    gate: (ns: number) => string
    roi: (n: number) => string
    beam: (i: number, q: number) => string
    distance: (d: number) => string
    files: (run: number, kB: number) => string
    board: (dpp: string) => string
  }
  steps: Record<string, StepCopy>
}

const pick = (h: string, b: string, e: string, he: string) => (k: Kind) => ({ hpge: h, bgo: b, ej309: e, he3: he }[k])

export const en: TourCopy = {
  label: 'Guided tour of the WebDAQ demo',
  step: (i, n) => `Step ${i} of ${n}`,
  next: 'Next', back: 'Back', finish: 'Finish', close: 'Close the tour', doIt: 'Do it for me',
  goTo: p => `Go to ${p}`,
  done: '✓ Done.',
  waiting: 'Waiting for you to do it, or use “Do it for me”.',
  pages: { '/': 'the start page', '/board': 'Board', '/DAQ': 'DAQ', '/dashboard': 'the Dashboard', '/tuner': 'the Tuner', '/logbook': 'the Logbook' },
  live: {
    rate: (ch, r, pu) => `Channel ${ch}: ${r.toFixed(0)} events/s, pile-up ${pu.toFixed(1)}/s (simulated).`,
    fwhm: (e, m, f, rel) => {
      const u = (x: number) => (rel ? `${x.toFixed(1)} %` : `${x.toFixed(2)} keV`)
      return `FWHM at ${e.toFixed(0)} keV with these settings: ${m === null ? '—' : u(m)}` + (f === null ? '.' : `; on the spectrum so far: ${u(f)}.`) + ' (Simulated.)'
    },
    gate: ns => `Long gate on channel 0: ${ns} ns.`,
    roi: n => `Counts in the region: ${n.toFixed(0)}.`,
    beam: (i, q) => `Beam on target: ${i.toFixed(1)} µA; charge this run: ${q.toFixed(1)} µC (simulated).`,
    distance: d => `Source–detector distance: ${d} cm.`,
    files: (run, kB) => `Run ${run}: ${kB} kB of files on record, metadata.json among them.`,
    board: dpp => `Board 0: V1730 running ${dpp}.`,
  },
  steps: {
    choose: {
      title: 'Choose your detectors',
      body: 'A data acquisition system (DAQ) turns the pulses of the detectors into numbers and keeps them: a digitizer samples each pulse, its firmware measures the energy and the time, and the software sets the boards up, starts and stops the runs and stores the data with a record of how they were taken. Here one simulated CAEN V1730 digitizer (16 channels, 14 bit, 500 million samples a second) reads two detectors on channels 0 and 1. Germanium (HPGe) is read with the DPP-PHA firmware (pulse-height analysis): a trapezoidal filter measures the energy, for resolution. BGO scintillators, EJ-309-like liquid scintillators and ³He counters are read with DPP-PSD (pulse-shape discrimination): two charge gates integrate the light, for efficiency, for telling neutrons from γ-rays, or for counting thermal neutrons. Choose a source and the source–detector distance; you can change all of this later from Scenario in the banner.',
    },
    board: {
      title: 'Find the board',
      body: 'WebDAQ probes the optical and USB links and lists the boards that answer, as CAEN’s own program, CoMPASS, does. Press “Scan for boards”, then “Use these settings” and “Add Board”. WebDAQ then writes the register file, the list of every setting of the board: from now on it is the board’s configuration, the dashboard edits it, and every run copies it into its directory.',
    },
    config: {
      title: 'Look at the configuration',
      body: pick(
        'DAQ → Configuration shows every register by name and CAEN address, channel by channel: trapezoid rise time, flat top, decay time, threshold, DC offset. Turn waveform recording on for the board (the switch on its card on the Dashboard overview, or here with “Do it for me”), so the Tuner can show traces.',
        'DAQ → Configuration shows every register by name and CAEN address, channel by channel. With DPP-PSD the important ones are the gates: Short Gate, Long Gate and Gate Offset. Turn waveform recording on for the board so the Tuner can show traces.',
        'DAQ → Configuration shows every register by name and CAEN address. With DPP-PSD the short and long gates decide how well neutrons and γ-rays separate: neutron recoils put more light in the slow component. Turn waveform recording on for the board.',
        'DAQ → Configuration shows every register by name and CAEN address. A ³He counter’s charge arrives over microseconds, so the demo starts with a long gate of 4 µs. Turn waveform recording on for the board.'),
    },
    run: {
      title: 'Start a run',
      body: 'On the Dashboard, fill in the run name (the target) and the run type: they become the run’s metadata. Keep “Save” on, then press “Start Run”. WebDAQ starts the beam-current log and stats.csv for the run as well.',
    },
    fill: {
      title: 'Watch it fill',
      body: pick(
        'Histograms shows the spectrum of each channel, already in keV because the board was added with its calibration. Data Rates shows event, pile-up, lost and saturated rates per channel. With the default trapezoid (rise 400 ns, flat top 200 ns, decay 4 µs instead of the preamplifier’s 50 µs) the peaks are broad: that is the next step.',
        'Histograms shows the charge spectrum (Q long) of each crystal; PSD shows Q long against 1 − Q short/Q long. BGO is not a pulse-shape scintillator, so there is a single band: the plot is what the firmware computes, not a particle identification.',
        'Open the PSD tab: Q long against 1 − Q short/Q long. With the ²⁵²Cf source, γ-rays and neutrons fall in two separate bands, because the protons that neutrons knock on put more light in the slow component of EJ-309. Data Rates shows the rates per channel.',
        'Histograms shows the charge spectrum: the full-energy peak of n + ³He → p + t (764 keV) with the wall effect below it, where the proton or the triton hits the tube wall before stopping.'),
    },
    tune: {
      title: 'Tune while the run goes',
      body: pick(
        'In the Tuner, turn “Online” on and set Decay Time to 50 µs (the preamplifier’s), Rise Time to 4 µs and Flat Top to 1 µs. The registers are written to the running board, the trapezoid’s flat top flattens and the 1332 keV peak narrows. A register that is not safe to change mid-run is saved and applied at the next start, and WebDAQ says so.',
        'In DAQ → Configuration, lengthen the Long Gate of channels 0 and 1 to about 1 µs (500 samples of 2 ns), so it covers the 300 ns BGO light: more photoelectrons (the electrons the light frees in the photomultiplier) are counted and the peak narrows. Gate registers are safe to change while acquiring.',
        'In DAQ → Configuration, set a Long Gate of about 500 ns and keep the Short Gate near 30–40 ns: the two bands on the PSD plot separate further. Gate registers are safe to change while acquiring.',
        'The ³He gate is already long (4 µs): shorten it in DAQ → Configuration and watch the peak move down and widen as charge is cut off, then set it back. “Do it for me” sets 4 µs.'),
    },
    roi: {
      title: 'Mark a region',
      body: pick(
        'On Histograms, add a region of interest (ROI), a range of the spectrum whose counts WebDAQ keeps, around the 1332 keV peak. Its counts are live on the Dashboard overview, and when the run stops they are written into the run directory as roi.json, with the region’s limits.',
        'On Histograms, add a region of interest (ROI), a range of the spectrum whose counts WebDAQ keeps, around the 1332 keV peak. Its counts are live on the Dashboard overview, and when the run stops they are written into the run directory as roi.json, with the region’s limits.',
        'On Histograms, add a region of interest (ROI), a range of the spectrum whose counts WebDAQ keeps. EJ-309 has no full-energy peak: its spectrum is made of Compton edges and proton recoils, so take a range of light, 200–1800 keVee. Its counts are live on the Dashboard overview, and when the run stops they are written into the run directory as roi.json, with the region’s limits.',
        'On Histograms, add a region of interest (ROI), a range of the spectrum whose counts WebDAQ keeps, around the 764 keV peak. Its counts are live on the Dashboard overview, and when the run stops they are written into the run directory as roi.json, with the region’s limits.'),
    },
    scenario: {
      title: 'Distance, beam and faults',
      body: pick(
        'Open Scenario in the banner. A run’s files describe the conditions it was taken in, so a new condition is best recorded as a new run: “Do it for me” stops this calibration run, switches to in-beam ¹⁴N(p,γ)¹⁵O and starts a new run. The beam current and the accumulated charge appear on the overview, and the 6.79 MeV line is the one that matters for the CNO cycle. (A change during a run is allowed too: metadata.json lists it with its time.) Moving the source closer instead raises the rate and the pile-up, and brings out the ⁶⁰Co sum peak at 2505 keV: both γ-rays of one decay absorbed together. Faults: make the board fail during a run; it stops sending data, the bell raises an alert, and with auto-restart on (Dashboard) the run is stopped, flagged bad with an [AUTO-RESTART] note and started again. Troubleshoot keeps the history.',
        'Open Scenario in the banner. A run’s files describe the conditions it was taken in, so a new condition is best recorded as a new run: “Do it for me” stops this run, moves the source closer and starts a new one. Watch the rate and the sum peaks grow: BGO’s large solid angle is why LUNA uses it for total-absorption measurements. Faults: make the board fail during a run; it stops sending data, the bell raises an alert, and with auto-restart on the run is stopped, flagged and started again. Troubleshoot keeps the history.',
        'Open Scenario in the banner. A run’s files describe the conditions it was taken in, so a new condition is best recorded as a new run: “Do it for me” stops this run, moves the ²⁵²Cf source closer and starts a new one; fission neutrons and γ-rays arrive together, and both bands grow. Faults: make the board fail during a run; it stops sending data, the bell raises an alert, and with auto-restart on the run is stopped, flagged and started again. Troubleshoot keeps the history.',
        'Open Scenario in the banner. A run’s files describe the conditions it was taken in, so a new condition is best recorded as a new run: “Do it for me” stops this run, moves the ²⁵²Cf source closer and starts a new one, and the counting rate follows the distance. Faults: make the board fail during a run; it stops sending data, the bell raises an alert, and with auto-restart on the run is stopped, flagged and started again. Troubleshoot keeps the history.'),
    },
    files: {
      title: 'Stop, and see what was kept',
      body: 'Press “Stop Run”. The Logbook lists the run; its page shows times, charge, boards, current and the files. “Run files” in the banner holds what a real run leaves on disk: the raw data (.caendat, readable by RUReader), the register file, current.txt, stats.csv, roi.json and metadata.json, plus the demo’s events.csv and README.txt. metadata.json describes the run and lists every file with its role and size, so a copied directory explains itself. That is a first step towards FAIR data (Findable, Accessible, Interoperable, Reusable): WebDAQ keeps the record FAIR-ready, and the Logbook keeps it searchable. A persistent identifier, a published schema and a licence field are next steps, not done.',
    },
  },
}

const pickIt = pick

export const it: TourCopy = {
  label: 'Visita guidata della demo di WebDAQ',
  step: (i, n) => `Passo ${i} di ${n}`,
  next: 'Avanti', back: 'Indietro', finish: 'Fine', close: 'Chiudi la visita', doIt: 'Fallo per me',
  goTo: p => `Vai a ${p}`,
  done: '✓ Fatto.',
  waiting: 'In attesa che tu lo faccia, oppure usa «Fallo per me».',
  pages: { '/': 'la pagina iniziale', '/board': 'Board', '/DAQ': 'DAQ', '/dashboard': 'la Dashboard', '/tuner': 'il Tuner', '/logbook': 'il Logbook' },
  live: {
    rate: (ch, r, pu) => `Canale ${ch}: ${r.toFixed(0)} eventi/s, pile-up ${pu.toFixed(1).replace('.', ',')}/s (simulati).`,
    fwhm: (e, m, f, rel) => {
      const u = (x: number) => (rel ? `${x.toFixed(1)} %` : `${x.toFixed(2)} keV`).replace('.', ',')
      return `FWHM a ${e.toFixed(0)} keV con queste impostazioni: ${m === null ? '—' : u(m)}` + (f === null ? '.' : `; sullo spettro finora: ${u(f)}.`) + ' (Simulato.)'
    },
    gate: ns => `Long gate sul canale 0: ${ns} ns.`,
    roi: n => `Conteggi nella regione: ${n.toFixed(0)}.`,
    beam: (i, q) => `Fascio sul bersaglio: ${i.toFixed(1).replace('.', ',')} µA; carica in questo run: ${q.toFixed(1).replace('.', ',')} µC (simulati).`,
    distance: d => `Distanza sorgente–rivelatore: ${d} cm.`,
    files: (run, kB) => `Run ${run}: ${kB} kB di file registrati, tra cui metadata.json.`,
    board: dpp => `Scheda 0: V1730 con firmware ${dpp}.`,
  },
  steps: {
    choose: {
      title: 'Scegli i rivelatori',
      body: 'Un sistema di acquisizione dati (DAQ) trasforma in numeri gli impulsi dei rivelatori e li conserva: un digitizzatore campiona ogni impulso, il suo firmware ne misura l’energia e il tempo, e il software configura le schede, avvia e ferma i run e salva i dati insieme alla descrizione di come sono stati presi. Qui un digitizzatore CAEN V1730 simulato (16 canali, 14 bit, 500 milioni di campioni al secondo) legge due rivelatori sui canali 0 e 1. Il germanio (HPGe) si legge con il firmware DPP-PHA (analisi dell’altezza degli impulsi): un filtro trapezoidale misura l’energia, per la risoluzione. Gli scintillatori BGO, gli scintillatori liquidi tipo EJ-309 e i contatori a ³He si leggono con DPP-PSD (discriminazione della forma degli impulsi): due finestre integrano la carica, per l’efficienza, per distinguere neutroni e raggi γ, o per contare neutroni termici. Scegli una sorgente e la distanza sorgente–rivelatore; puoi cambiare tutto più tardi da Scenario, nella barra in alto.',
    },
    board: {
      title: 'Trova la scheda',
      body: 'WebDAQ interroga i collegamenti ottici e USB ed elenca le schede che rispondono, come fa CoMPASS, il programma di CAEN. Premi «Scan for boards», poi «Use these settings» e «Add Board». WebDAQ scrive allora il file dei registri, l’elenco di tutte le impostazioni della scheda: da ora è la sua configurazione, la dashboard lo modifica, e ogni run lo copia nella propria cartella.',
    },
    config: {
      title: 'Guarda la configurazione',
      body: pickIt(
        'DAQ → Configuration mostra ogni registro con nome e indirizzo CAEN, canale per canale: rise time del trapezio, flat top, decay time, soglia, DC offset. Attiva la registrazione delle forme d’onda per la scheda (l’interruttore sulla sua scheda nella panoramica della Dashboard, oppure qui con «Fallo per me»), così il Tuner può mostrare le tracce.',
        'DAQ → Configuration mostra ogni registro con nome e indirizzo CAEN, canale per canale. Con DPP-PSD contano soprattutto le finestre: Short Gate, Long Gate e Gate Offset. Attiva la registrazione delle forme d’onda per la scheda, così il Tuner può mostrare le tracce.',
        'DAQ → Configuration mostra ogni registro con nome e indirizzo CAEN. Con DPP-PSD la short e la long gate decidono quanto bene si separano neutroni e raggi γ: i rinculi dei neutroni mettono più luce nella componente lenta. Attiva la registrazione delle forme d’onda per la scheda.',
        'DAQ → Configuration mostra ogni registro con nome e indirizzo CAEN. In un contatore a ³He la carica arriva in microsecondi, perciò la demo parte con una long gate di 4 µs. Attiva la registrazione delle forme d’onda per la scheda.'),
    },
    run: {
      title: 'Avvia un run',
      body: 'Nella Dashboard inserisci il nome del run (il bersaglio) e il tipo di run: diventano i metadati del run. Lascia attivo «Save» e premi «Start Run». WebDAQ avvia anche il registro della corrente del fascio e stats.csv per il run.',
    },
    fill: {
      title: 'Lo spettro si riempie',
      body: pickIt(
        'Histograms mostra lo spettro di ogni canale, già in keV perché la scheda è stata aggiunta con la sua calibrazione. Data Rates mostra per canale i rate di eventi, pile-up, persi e saturati. Con il trapezio di partenza (rise 400 ns, flat top 200 ns, decay 4 µs invece dei 50 µs del preamplificatore) i picchi sono larghi: è il prossimo passo.',
        'Histograms mostra lo spettro di carica (Q long) di ogni cristallo; PSD mostra Q long contro 1 − Q short/Q long. Il BGO non è uno scintillatore adatto alla discriminazione di forma, quindi c’è una banda sola: il grafico è ciò che calcola il firmware, non un’identificazione di particelle.',
        'Apri la scheda PSD: Q long contro 1 − Q short/Q long. Con la sorgente di ²⁵²Cf raggi γ e neutroni cadono in due bande separate, perché i protoni di rinculo dei neutroni mettono più luce nella componente lenta dell’EJ-309. Data Rates mostra i rate per canale.',
        'Histograms mostra lo spettro di carica: il picco di piena energia di n + ³He → p + t (764 keV) e, sotto, l’effetto parete, quando il protone o il trizio urtano la parete del tubo prima di fermarsi.'),
    },
    tune: {
      title: 'Regola durante il run',
      body: pickIt(
        'Nel Tuner attiva «Online» e porta Decay Time a 50 µs (quello del preamplificatore), Rise Time a 4 µs e Flat Top a 1 µs. I registri vengono scritti sulla scheda in acquisizione, il trapezio diventa piatto e il picco a 1332 keV si stringe. Un registro che non si può cambiare durante il run viene salvato e applicato al prossimo avvio, e WebDAQ lo dice.',
        'In DAQ → Configuration allunga la Long Gate dei canali 0 e 1 fino a circa 1 µs (500 campioni da 2 ns), in modo che copra la luce del BGO da 300 ns: si contano più fotoelettroni (gli elettroni che la luce libera nel fotomoltiplicatore) e il picco si stringe. I registri delle finestre si possono cambiare durante l’acquisizione.',
        'In DAQ → Configuration imposta una Long Gate di circa 500 ns e tieni la Short Gate attorno a 30–40 ns: le due bande del grafico PSD si separano di più. I registri delle finestre si possono cambiare durante l’acquisizione.',
        'La finestra del ³He è già lunga (4 µs): accorciala in DAQ → Configuration e guarda il picco scendere e allargarsi man mano che la carica viene tagliata, poi rimettila com’era. «Fallo per me» imposta 4 µs.'),
    },
    roi: {
      title: 'Segna una regione',
      body: pickIt(
        'In Histograms aggiungi una regione di interesse (ROI), un intervallo dello spettro di cui WebDAQ tiene i conteggi, attorno al picco a 1332 keV. I suoi conteggi sono in tempo reale nella panoramica della Dashboard e, quando il run si ferma, vengono scritti nella cartella del run come roi.json, con i limiti della regione.',
        'In Histograms aggiungi una regione di interesse (ROI), un intervallo dello spettro di cui WebDAQ tiene i conteggi, attorno al picco a 1332 keV. I suoi conteggi sono in tempo reale nella panoramica della Dashboard e, quando il run si ferma, vengono scritti nella cartella del run come roi.json, con i limiti della regione.',
        'In Histograms aggiungi una regione di interesse (ROI), un intervallo dello spettro di cui WebDAQ tiene i conteggi. L’EJ-309 non ha un picco di piena energia: il suo spettro è fatto di spalle Compton e di protoni di rinculo, quindi prendi un intervallo di luce, 200–1800 keVee. I suoi conteggi sono in tempo reale nella panoramica della Dashboard e, quando il run si ferma, vengono scritti nella cartella del run come roi.json, con i limiti della regione.',
        'In Histograms aggiungi una regione di interesse (ROI), un intervallo dello spettro di cui WebDAQ tiene i conteggi, attorno al picco a 764 keV. I suoi conteggi sono in tempo reale nella panoramica della Dashboard e, quando il run si ferma, vengono scritti nella cartella del run come roi.json, con i limiti della regione.'),
    },
    scenario: {
      title: 'Distanza, fascio e guasti',
      body: pickIt(
        'Apri Scenario nella barra in alto. I file di un run descrivono le condizioni in cui è stato preso, quindi una condizione nuova è meglio un run nuovo: «Fallo per me» ferma questo run di calibrazione, passa al fascio, ¹⁴N(p,γ)¹⁵O, e avvia un nuovo run. Nella panoramica compaiono la corrente del fascio e la carica accumulata, e la riga a 6,79 MeV è quella che conta per il ciclo CNO. (Si può cambiare anche durante un run: metadata.json registra il cambiamento con il suo istante.) Avvicinando invece la sorgente, il rate e il pile-up salgono e compare il picco somma del ⁶⁰Co a 2505 keV: i due raggi γ dello stesso decadimento assorbiti insieme. Guasti: fai guastare la scheda durante un run; smette di mandare dati, la campanella segnala l’allarme e, con il riavvio automatico attivo (Dashboard), il run viene fermato, segnato come «bad» con una nota [AUTO-RESTART] e riavviato. Troubleshoot ne conserva la storia.',
        'Apri Scenario nella barra in alto. I file di un run descrivono le condizioni in cui è stato preso, quindi una condizione nuova è meglio un run nuovo: «Fallo per me» ferma questo run, avvicina la sorgente e ne avvia uno nuovo. Guarda crescere il rate e i picchi somma: il grande angolo solido del BGO è il motivo per cui LUNA lo usa nelle misure ad assorbimento totale. Guasti: fai guastare la scheda durante un run; smette di mandare dati, la campanella segnala l’allarme e, con il riavvio automatico attivo, il run viene fermato, segnato e riavviato. Troubleshoot ne conserva la storia.',
        'Apri Scenario nella barra in alto. I file di un run descrivono le condizioni in cui è stato preso, quindi una condizione nuova è meglio un run nuovo: «Fallo per me» ferma questo run, avvicina la sorgente di ²⁵²Cf e ne avvia uno nuovo; neutroni di fissione e raggi γ arrivano insieme, e crescono entrambe le bande. Guasti: fai guastare la scheda durante un run; smette di mandare dati, la campanella segnala l’allarme e, con il riavvio automatico attivo, il run viene fermato, segnato e riavviato. Troubleshoot ne conserva la storia.',
        'Apri Scenario nella barra in alto. I file di un run descrivono le condizioni in cui è stato preso, quindi una condizione nuova è meglio un run nuovo: «Fallo per me» ferma questo run, avvicina la sorgente di ²⁵²Cf e ne avvia uno nuovo, e il rate di conteggio segue la distanza. Guasti: fai guastare la scheda durante un run; smette di mandare dati, la campanella segnala l’allarme e, con il riavvio automatico attivo, il run viene fermato, segnato e riavviato. Troubleshoot ne conserva la storia.'),
    },
    files: {
      title: 'Ferma, e guarda cosa resta',
      body: 'Premi «Stop Run». Il Logbook elenca il run; la sua pagina mostra tempi, carica, schede, corrente e file. «File del run», nella barra in alto, contiene ciò che un run reale lascia su disco: i dati grezzi (.caendat, leggibili con RUReader), il file dei registri, current.txt, stats.csv, roi.json e metadata.json, più events.csv e README.txt della demo. metadata.json descrive il run ed elenca ogni file con il suo ruolo e la sua dimensione, così una cartella copiata si spiega da sola. È un primo passo verso dati FAIR (Findable, Accessible, Interoperable, Reusable: reperibili, accessibili, interoperabili, riutilizzabili): WebDAQ tiene la documentazione predisposta per i principi FAIR, e il Logbook la rende consultabile. Un identificativo persistente, uno schema pubblicato e un campo per la licenza sono passi futuri, non ancora fatti.',
    },
  },
}
