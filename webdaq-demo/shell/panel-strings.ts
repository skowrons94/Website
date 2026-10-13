// Strings of the Scenario panel and the Run files drawer, which load on demand.
import type { Lang } from './strings'

const en = {
  scenarioTitle: 'Scenario',
  activity: 'Source activity',
  background: 'Room background',
  bgUnderground: 'Underground (LUNA)',
  bgSurface: 'Surface',
  beamCurrent: 'Beam current on target',
  yieldFactor: 'Declared yield factor (in-beam, to see lines within a minute)',
  faults: 'Faults',
  faultBoard: 'Board 0 fails at t = 60 s of the run',
  faultStall: 'Buffers stall at t = 30 s of the run',
  apply: 'Apply',
  applied: 'Scenario applied.',
  stopFirst: 'Stop the run before changing the detectors.',
  filesTitle: 'Run files',
  filesLead: 'What a real run leaves in data/run<N>/. The files are regenerated in your browser from the run’s seed and settings; nothing is stored anywhere else.',
  noRuns: 'No finished runs yet. Start and stop a run with saving on.',
  run: 'Run',
  show: 'Show files',
  downloadAll: 'Download all (.zip)',
  preparing: 'Preparing…',
}
const it: typeof en = {
  scenarioTitle: 'Scenario',
  activity: 'Attività della sorgente',
  background: 'Fondo ambientale',
  bgUnderground: 'Sotterraneo (LUNA)',
  bgSurface: 'In superficie',
  beamCurrent: 'Corrente del fascio sul bersaglio',
  yieldFactor: 'Fattore di resa dichiarato (in fascio, per vedere le righe entro un minuto)',
  faults: 'Guasti',
  faultBoard: 'La scheda 0 si guasta a t = 60 s dall’inizio del run',
  faultStall: 'I buffer si bloccano a t = 30 s dall’inizio del run',
  apply: 'Applica',
  applied: 'Scenario applicato.',
  stopFirst: 'Ferma il run prima di cambiare i rivelatori.',
  filesTitle: 'File del run',
  filesLead: 'Ciò che un run reale lascia in data/run<N>/. I file vengono rigenerati nel tuo browser a partire dal seed e dalle impostazioni del run; non sono salvati da nessun’altra parte.',
  noRuns: 'Nessun run concluso. Avvia e ferma un run con il salvataggio attivo.',
  run: 'Run',
  show: 'Mostra i file',
  downloadAll: 'Scarica tutto (.zip)',
  preparing: 'Preparazione…',
}
export const PANEL: Record<Lang, typeof en> = { en, it }
export type PanelStrings = typeof en
