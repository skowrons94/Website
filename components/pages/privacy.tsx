import type { Metadata } from "next"
import Link from "next/link"

import { Container, PageHeader } from "@/components/page-header"
import { getProfile } from "@/lib/content"
import { localePath, type Lang } from "@/lib/i18n"
import { pageMetadata } from "@/lib/metadata"

/*
 * /privacy: what is logged and for how long, what the browser keeps, and who
 * else sees a visit (GDPR Art. 13, in short). Running text in both
 * languages, as on /about. The facts it states live elsewhere and must move
 * with it: the access log's retention and address masking in
 * deploy/Caddyfile, the API's log in server/app/routes/api.py and
 * app/limits.py, the browser storage in components/search/command-palette.tsx
 * (recent searches), next-themes (the theme), lib/api.ts (sessionStorage) and
 * browser/worker.js (Cache Storage, static build).
 */

// deploy/Caddyfile: roll_keep_for 336h.
const RETENTION_DAYS = 14
// The static (GitHub Pages) build runs the engine in the browser.
const STATIC_BUILD = process.env.API_BASE === "browser"

const TEXT = {
  en: {
    title: "Privacy",
    description:
      "What this site records about a visit (a shortened address in the server log, for 14 days), what it keeps in your browser, and that it uses no cookies, analytics or trackers.",
    lead: "No cookies, no analytics, no trackers, no advertising. What is recorded, why, and for how long.",
  },
  it: {
    title: "Privacy",
    description:
      "Che cosa registra questo sito di una visita (un indirizzo abbreviato nel registro del server, per 14 giorni), che cosa conserva nel browser, e che non usa cookie, statistiche né tracciamento.",
    lead: "Niente cookie, statistiche, tracciamento o pubblicità. Che cosa viene registrato, perché e per quanto tempo.",
  },
}

export const privacyMetadata = (lang: Lang): Metadata => pageMetadata(TEXT[lang].title, TEXT[lang].description, lang)

const A = "text-link"
const prose = "mt-4 max-w-[68ch] space-y-4 text-pretty leading-[1.75] text-foreground/90"
const list = "mt-4 max-w-[68ch] list-disc space-y-2 pl-5 leading-[1.7] text-foreground/90 marker:text-muted-foreground"

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-12 text-balance font-serif text-2xl font-semibold tracking-tight first:mt-0">{children}</h2>
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-secondary/60 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
}

function BodyEn({ email, name, to }: { email: string; name: string; to: (p: string) => string }) {
  return (
    <>
      <H2>In short</H2>
      <div className={prose}>
        <p>
          This site sets no cookies and loads nothing from other companies: no analytics, no trackers, no advertising, no
          social-media buttons, no fonts or scripts from a CDN. Every file comes from the site&apos;s own address. Links to
          journals, DOIs or GitHub take you elsewhere only when you click them.
        </p>
      </div>

      <H2>What the server records</H2>
      {STATIC_BUILD ? (
        <div className={prose}>
          <p>
            This copy of the site is hosted on GitHub Pages and calculates the R-matrix evaluations in your browser, so no
            server of mine sees your visit. GitHub, as the host, receives your IP address and the pages you request, as any
            web host does; see the{" "}
            <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" className={A}>
              GitHub General Privacy Statement
            </a>
            . I receive no logs from GitHub.
          </p>
        </div>
      ) : (
        <>
          <div className={prose}>
            <p>
              The web server keeps an access log, for security (spotting attacks and abuse) and for finding faults. Each
              request records:
            </p>
          </div>
          <ul className={list}>
            <li>
              your IP address, <strong>shortened before it is written</strong>: the last of its four numbers is removed
              (IPv4), or everything after the first 48 bits (IPv6), so the log never holds a full address;
            </li>
            <li>the date and time, the address requested, the answer&apos;s status and size, and how long it took;</li>
            <li>the browser&apos;s identification (user agent) and the page you came from (referrer), as your browser sends them.</li>
          </ul>
          <div className={prose}>
            <p>
              The log is deleted automatically after <strong>{RETENTION_DAYS} days</strong>. The calculation server (the
              R-matrix evaluations) logs each request with the same shortened address; its log is overwritten as it grows
              and cleared whenever the server is updated. Nobody else has access to either log, and they are not used to
              identify visitors or to build profiles. The legal basis is my legitimate interest in running the site
              securely (Art. 6(1)(f) GDPR).
            </p>
            <p>
              When you open an evaluation, the server starts a calculation for you and keeps it in memory while the page
              is open; it is closed, with the parameters you tried, shortly after you leave. To stop one visitor from
              taking all the calculation capacity, the server also counts, in memory only, how many calculations each
              address has open; these counts are never written down and are forgotten within minutes.
            </p>
          </div>
        </>
      )}

      <H2>What your browser keeps</H2>
      <div className={prose}>
        <p>Only for your convenience, on your device, never sent anywhere:</p>
      </div>
      <ul className={list}>
        <li>
          your colour theme, if you chose one (<Code>theme</Code>, local storage);
        </li>
        <li>
          your recent searches in the site&apos;s search (<Code>search-recent-en</Code>, <Code>search-recent-it</Code>,
          local storage);
        </li>
        <li>
          for the open tab only, which optional calculation-server features are missing (<Code>azure2-api-absent</Code>,
          session storage);
        </li>
        {STATIC_BUILD && (
          <li>
            the calculation engine&apos;s files, so that they are downloaded once rather than on every visit (Cache Storage).
          </li>
        )}
      </ul>
      <div className={prose}>
        <p>Clearing this site&apos;s data in your browser&apos;s settings removes all of it.</p>
      </div>

      <H2>Contact</H2>
      <div className={prose}>
        <p>
          The site is run by {name}, who is responsible for it. For any question about your data, or to exercise your
          rights under the GDPR (access, erasure, objection), write to{" "}
          <a href={`mailto:${email}`} className={A}>
            {email}
          </a>
          ; you may also complain to your data-protection authority. How the site was made is on the{" "}
          <Link href={to("/about")} className={A}>
            about page
          </Link>
          .
        </p>
      </div>
    </>
  )
}

function BodyIt({ email, name, to }: { email: string; name: string; to: (p: string) => string }) {
  return (
    <>
      <H2>In breve</H2>
      <div className={prose}>
        <p>
          Questo sito non usa cookie e non carica nulla da altre aziende: niente statistiche, tracciamento, pubblicità,
          pulsanti dei social, né caratteri o script da una CDN. Ogni file viene dall&apos;indirizzo del sito stesso. I
          collegamenti a riviste, DOI o GitHub portano altrove solo quando li segui.
        </p>
      </div>

      <H2>Che cosa registra il server</H2>
      {STATIC_BUILD ? (
        <div className={prose}>
          <p>
            Questa copia del sito è ospitata su GitHub Pages e calcola le valutazioni R-matrix nel tuo browser, quindi
            nessun mio server vede la tua visita. GitHub, come ogni servizio di hosting, riceve il tuo indirizzo IP e le
            pagine richieste; vedi la{" "}
            <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" className={A} hrefLang="en">
              GitHub General Privacy Statement
            </a>
            . Non ricevo alcun registro da GitHub.
          </p>
        </div>
      ) : (
        <>
          <div className={prose}>
            <p>
              Il server web tiene un registro degli accessi, per sicurezza (individuare attacchi e abusi) e per trovare
              guasti. Per ogni richiesta registra:
            </p>
          </div>
          <ul className={list}>
            <li>
              il tuo indirizzo IP, <strong>abbreviato prima di essere scritto</strong>: senza l&apos;ultimo dei suoi
              quattro numeri (IPv4), o senza tutto ciò che segue i primi 48 bit (IPv6), così il registro non contiene mai
              un indirizzo completo;
            </li>
            <li>data e ora, l&apos;indirizzo richiesto, lo stato e la dimensione della risposta, e il tempo impiegato;</li>
            <li>
              l&apos;identificazione del browser (user agent) e la pagina di provenienza (referrer), come li invia il tuo
              browser.
            </li>
          </ul>
          <div className={prose}>
            <p>
              Il registro viene cancellato automaticamente dopo <strong>{RETENTION_DAYS} giorni</strong>. Il server di
              calcolo (le valutazioni R-matrix) registra ogni richiesta con lo stesso indirizzo abbreviato; il suo registro
              viene sovrascritto man mano che cresce e azzerato a ogni aggiornamento del server. Nessun altro ha accesso ai
              registri, che non servono a identificare i visitatori né a profilarli. La base giuridica è il mio legittimo
              interesse a gestire il sito in sicurezza (art. 6, par. 1, lett. f, GDPR).
            </p>
            <p>
              Quando apri una valutazione, il server avvia un calcolo riservato alla tua visita e lo tiene in memoria finché la pagina è
              aperta; viene chiuso, con i parametri che hai provato, poco dopo che te ne vai. Per evitare che un solo
              visitatore occupi tutta la capacità di calcolo, il server conta inoltre, solo in memoria, quanti calcoli ha
              aperti ciascun indirizzo; questi conteggi non vengono mai scritti e si perdono nel giro di minuti.
            </p>
          </div>
        </>
      )}

      <H2>Che cosa conserva il tuo browser</H2>
      <div className={prose}>
        <p>Solo per comodità, sul tuo dispositivo, senza mai inviarlo altrove:</p>
      </div>
      <ul className={list}>
        <li>
          il tema dei colori, se ne hai scelto uno (<Code>theme</Code>, archiviazione locale);
        </li>
        <li>
          le ricerche recenti nella ricerca del sito (<Code>search-recent-en</Code>, <Code>search-recent-it</Code>,
          archiviazione locale);
        </li>
        <li>
          solo per la scheda aperta, quali funzioni facoltative del server di calcolo mancano (
          <Code>azure2-api-absent</Code>, archiviazione di sessione);
        </li>
        {STATIC_BUILD && (
          <li>i file del motore di calcolo, scaricati una volta sola anziché a ogni visita (Cache Storage).</li>
        )}
      </ul>
      <div className={prose}>
        <p>Cancellare i dati di questo sito dalle impostazioni del browser li rimuove tutti.</p>
      </div>

      <H2>Contatti</H2>
      <div className={prose}>
        <p>
          Il sito è gestito da {name}, che ne è responsabile. Per qualsiasi domanda sui tuoi dati, o per esercitare i
          diritti previsti dal GDPR (accesso, cancellazione, opposizione), scrivi a{" "}
          <a href={`mailto:${email}`} className={A}>
            {email}
          </a>
          ; puoi anche rivolgerti all&apos;autorità per la protezione dei dati del tuo paese (in Italia, il Garante). Come è stato realizzato il sito è spiegato
          nella pagina{" "}
          <Link href={to("/about")} className={A}>
            Informazioni sul sito
          </Link>
          .
        </p>
      </div>
    </>
  )
}

export function PrivacyPage({ lang }: { lang: Lang }) {
  const t = TEXT[lang]
  const profile = getProfile(lang)
  const to = (p: string) => localePath(lang, p)
  const Body = lang === "it" ? BodyIt : BodyEn
  return (
    <Container>
      <PageHeader title={t.title} lead={t.lead} />
      <Body email={profile.email} name={profile.name} to={to} />
    </Container>
  )
}
