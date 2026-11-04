import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
import { PushAlerts } from '@/components/PushAlerts';
import { pushAlertsAvailable } from '@/lib/push-available';
import { locationByPath } from '@/lib/territory';
import { aName } from '@/lib/format';

/**
 * Els avisos oficials taronja i vermell, al mòbil.
 *
 * S'hi arriba des de la fitxa d'un lloc (`?lloc=/maresme/malgrat-de-mar`), i és
 * l'única pàgina que carrega `PushAlerts`. Les regles del que s'envia són a
 * `src/lib/push-alerts.ts`; aquí es diuen amb paraules, perquè qui ho activa
 * ha de saber exactament què el despertarà i què no.
 *
 * Llegir `searchParams` la fa dinàmica, i per això és a `LIVE_PAGES`.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Avisos al mòbil · tempscat',
  description:
    'Rebeu al mòbil els avisos oficials taronja i vermell de l’AEMET per als llocs que trieu. '
    + 'Sense compte, sense correu i es poden apagar quan vulgueu.',
  alternates: { canonical: '/avisos/alertes' },
};

export default async function AlertesPage(
  { searchParams }: { searchParams: Promise<{ lloc?: string | string[] }> },
) {
  const { lloc } = await searchParams;
  const loc = typeof lloc === 'string' ? locationByPath(lloc) : undefined;
  const place = loc?.published ? { path: loc.path, nom: loc.nom } : null;
  const vapidKey = pushAlertsAvailable();

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Avisos', path: '/avisos' },
    { nom: 'Avisos al mòbil', path: '/avisos/alertes' },
  ];

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Avisos oficials"
        title={place ? `Avisos al mòbil ${aName(place.nom)}` : 'Avisos al mòbil'}
        lead={(
          <>
            Una notificació quan l’AEMET emet un avís taronja o vermell per al lloc que trieu. Sense
            compte ni correu, i es pot apagar des d’aquí mateix.
          </>
        )}
      />

      <Section id="activa" title={place ? `Activeu-los ${aName(place.nom)}` : 'Aquest aparell'}>
        <div className="card prose">
          {vapidKey ? (
            <PushAlerts vapidKey={vapidKey} place={place} />
          ) : (
            <p>Els avisos al mòbil encara no estan disponibles. Mentrestant, els podeu seguir amb
              el <Link href="/avisos/feed">canal d’avisos</Link> o afegir-los al calendari.</p>
          )}
        </div>
      </Section>

      <Section id="que-arriba" title="Què us arribarà, i què no">
        <div className="card prose">
          <ul>
            <li>
              <strong>Només avisos oficials de l’AEMET de nivell taronja o vermell.</strong> Mai un
              groc, i mai una previsió nostra: per al groc hi ha la franja de la fitxa.
            </li>
            <li>
              <strong>De les 23 h a les 7 h, només el vermell.</strong> Un taronja que s’emet de nit
              us arriba a les set del matí, si encara és vigent.
            </li>
            <li>
              <strong>Un missatge per episodi.</strong> L’AEMET torna a emetre el mateix avís cada
              dia que dura; només us tornarà a arribar si puja de taronja a vermell. Si hi ha
              diversos avisos alhora, us arriba un sol missatge amb el més greu.
            </li>
            <li>
              <strong>Es pot apagar aquí</strong>, lloc per lloc o tot de cop, sense desinstal·lar res.
              També podeu bloquejar les notificacions des del navegador.
            </li>
          </ul>
          <p>
            Els avisos es comproven cada quinze minuts. Tocant la notificació s’obre la fitxa del lloc,
            amb l’avís i el text oficial de l’AEMET.
          </p>
        </div>
      </Section>

      <Section id="dades" title="Què es desa">
        <div className="card prose">
          <p>
            Per poder-vos enviar el missatge, es desa l’adreça que el vostre navegador dona per a
            les notificacions, les claus amb què es xifra el missatge i els llocs que heu triat. Res
            més: ni nom, ni correu, ni ubicació. Quan apagueu els avisos, s’esborra. El detall és a
            la <Link href="/privacitat#avisos">política de privadesa</Link>.
          </p>
        </div>
      </Section>
    </article>
  );
}
