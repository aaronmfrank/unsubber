/**
 * Dev-only screen gallery: renders any screen or state with fictional sample data and no Gmail.
 * Open /unsubber/dev/screens.html?screen=deck, or run `npm run screenshots` to capture them all.
 * Uses its own port in the screenshot script, so it never touches real data in the main dev server.
 */
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { useUpdate } from '../src/pwa';
import { useDeck } from '../src/state/deck';
import { useNav } from '../src/state/nav';
import { useQueue } from '../src/state/queue';
import { useScan } from '../src/state/scan';
import { gmail, useSession } from '../src/state/session';
import { useToast } from '../src/state/toast';
import { storage, type Sender } from '../src/storage';
import { UpdateBanner } from '../src/ui/App';
import { AppShell } from '../src/ui/AppShell';
import { ScanScreen } from '../src/ui/ScanScreen';
import { SignInScreen } from '../src/ui/SignInScreen';
import { InkFilter } from '../src/ui/Stamp';

const EMAIL = 'aaron@example.com';
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

type Methods = Sender['unsubMethods'];
const oneClick: Methods = { oneClickUrl: 'https://u.example.com/1c', httpUrl: 'https://u.example.com/1c' };
const email: Methods = { mailto: 'mailto:unsubscribe@lists.example.com' };
const link: Methods = { httpUrl: 'https://www.example.com/email-preferences' };
const none: Methods = {};

function sender(id: string, name: string, count: number, subject: string, snippet: string, methods: Methods, overrides: Partial<Sender> = {}): Sender {
  return {
    id,
    displayName: name,
    domain: id.slice(id.indexOf('@') + 1).split('.').slice(-2).join('.'),
    listIds: [],
    messageCount: count,
    lastReceivedAt: daysAgo(count % 9),
    latestSubject: subject,
    latestSnippet: snippet,
    latestMessageId: `m-${id}`,
    latestThreadId: `t-${id}`,
    unsubMethods: methods,
    status: 'new',
    escalationStep: 0,
    returnCount: 0,
    ...overrides,
  };
}

const main: Sender[] = [
  sender('deals@mail.brightsidebundle.com', 'Brightside Bundle', 137, 'Play Ascend from Nine Mountains and more this week', 'Your weekly bundle is here: eight indie games, one low price, and 10% to charity.', oneClick),
  sender('noreply@tabletopforge.com', 'Tabletop Forge', 104, 'Update 31: shipping wave two is underway', 'Backers in wave two should see tracking numbers by Friday. Here is what changed.', none),
  sender('messages-noreply@linkway.com', 'Linkway', 64, 'You appeared in 9 searches this week', 'See who is looking at your profile and the jobs that match your skills.', oneClick),
  sender('partner@enews.northwindair.com', 'Northwind Air Miles', 32, 'Breeze through security with a lounge pass', 'Members save 20% on lounge day passes through the end of the month.', oneClick),
  sender('hello@em.voltline.com', 'Voltline Motors', 29, 'Meet the new R2 crossover', 'Reserve yours today and be first in line for test drives near you.', oneClick),
  sender('rewards@email.casaburrito.com', 'Casa Burrito', 26, 'Free chips and dip today only', 'Show this email at checkout or use the app. One per guest.', oneClick),
  sender('messenger@messaging.squaremart.com', 'The Dice Tower Shop', 23, 'Receipt from The Dice Tower Shop', 'Thanks for your purchase. Total $42.17, paid with Visa ending 4411.', none),
  sender('hello@mail.streamly.com', 'Streamly+', 18, 'New series picked for you', 'Three new shows land this week, plus the season finale you have been waiting for.', oneClick),
  sender('notices@email.metropg.com', 'Metro Power & Gas', 16, 'Five ways to cut your winter bill', 'Simple changes that add up: thermostat schedules, door seals and more.', email),
  sender('news@email.ridgeline.com', 'Ridgeline Outfitters', 14, 'New arrivals for the season', 'Layers, boots and the parka everyone asks about are back in stock.', link),
];

const offender = sender('deals@couponcabinet.com', 'Coupon Cabinet', 58, 'We miss you! Here is 40% off', 'Come back and save on everything sitewide this weekend only.', { ...oneClick, ...email }, {
  status: 'repeat_offender',
  unsubscribedAt: daysAgo(40),
  escalationStep: 1,
  returnCount: 6,
  lastReturnAt: daysAgo(1),
});

const kept: Sender[] = [
  sender('alerts@elmbank.com', 'Elm Bank', 48, 'Your statement is ready', 'Your October statement for checking ending 0192 is now available.', link, { status: 'kept', keptAt: daysAgo(60), countAtKeep: 36 }),
  sender('hello@oakpubliclibrary.org', 'Oak Public Library', 22, 'Holds ready for pickup', 'Two items are waiting for you at the Main Street branch.', link, { status: 'kept', keptAt: daysAgo(60), countAtKeep: 21 }),
];

const manual: Sender[] = [
  sender('news@email.ridgeline.com', 'Ridgeline Outfitters', 14, 'New arrivals for the season', '', link, { status: 'manual' }),
  sender('noreply@tabletopforge.com', 'Tabletop Forge', 104, 'Update 31: shipping wave two is underway', '', { bodyLinks: [] }, { status: 'manual' }),
];

async function seed(senders: Sender[]) {
  await storage.clearAll();
  await storage.upsertSenders(senders);
  await storage.setMeta('historyId', 'h1');
  await storage.setMeta('peopleScannedAt', daysAgo(30));
  await storage.setMeta('scannedWindows', [{ after: '2026/08/13', before: '2026/11/12' }]);
  await storage.addAttempt({ id: '0001', senderId: offender.id, method: 'one_click', at: daysAgo(40), result: 'sent_unconfirmed', detail: '' });
  await storage.addMessages(
    Array.from({ length: 6 }, (_, i) => ({ id: `o${i}`, threadId: 't', senderId: offender.id, date: daysAgo(30 - i * 4) })),
  );
}

async function queueAll(senders: Sender[]) {
  const queued = senders.map((s): Sender => ({ ...s, prevStatus: s.status, status: 'queued' }));
  await storage.upsertSenders(queued);
  for (const s of queued) await storage.enqueue({ senderId: s.id, createdAt: new Date().toISOString() });
}

Object.assign(gmail, {
  listAddedMessageIds: async () => ({ ids: [], historyId: 'h1' }),
  getMessageMetadata: async (id: string) => ({
    id,
    threadId: 't',
    internalDate: String(Date.now()),
    payload: { headers: [{ name: 'Subject', value: ['Last chance: 40% off ends tonight', 'Your weekly picks', 'New arrivals are here'][id.length % 3]! }] },
  }),
});

const screen = new URLSearchParams(location.search).get('screen') ?? 'deck';
const signedIn = () => useSession.setState({ status: 'signed_in', email: EMAIL, configured: true });

async function setup(): Promise<ReactNode> {
  switch (screen) {
    case 'sign-in':
      useSession.setState({ status: 'signed_out', configured: true, rememberedEmail: null, error: null });
      return <SignInScreen />;
    case 'sign-in-returning':
      useSession.setState({ status: 'signed_out', configured: true, rememberedEmail: EMAIL, error: null });
      return <SignInScreen />;
    case 'scan':
      signedIn();
      useScan.setState({ status: 'running', progress: { phase: 'reading', done: 1240, total: 4180, senders: 212 } });
      return <ScanScreen />;
    case 'scan-paused':
      signedIn();
      useScan.setState({
        status: 'error',
        error: 'Gmail asked Unsubber to slow down. The scan picks up where it stopped in a minute.',
        resumeAt: Date.now() + 42_000,
      });
      return <ScanScreen />;
  }

  signedIn();
  useScan.setState({ status: 'done' });
  const withOffender = screen === 'deck-repeat-offender' || screen === 'confirm';
  await seed([...(withOffender ? [offender] : []), ...(screen === 'deck-empty' ? [] : main), ...kept, ...(screen === 'manual' ? manual : [])]);
  if (screen === 'confirm' || screen === 'confirm-running') await queueAll([offender, ...main.slice(0, 5), main[8]!, main[9]!].filter((s) => screen === 'confirm' || s !== offender));
  if (screen === 'expired') useSession.setState({ status: 'expired', error: null });
  if (screen === 'manual') useNav.setState({ screen: 'manual' });
  if (screen === 'settings') useNav.setState({ screen: 'settings' });
  if (screen === 'history') useNav.setState({ screen: 'history' });
  if (screen === 'deck-rereview') useDeck.setState({ deck: 'rereview' });
  if (screen === 'deck-later') useDeck.setState({ deck: 'later' });
  return <AppShell />;
}

async function afterMount() {
  await new Promise((r) => setTimeout(r, 300));
  if (screen === 'confirm' || screen === 'confirm-running') await useQueue.getState().openSheet();
  if (screen === 'confirm-running') useQueue.setState({ running: true, progress: { done: 3, total: 7 } });
  if (screen === 'toast') useToast.getState().show({ message: 'Unsubscribed from 10.', needYou: 2, tone: 'ok' });
  if (screen === 'toast-error')
    useToast.getState().show({ message: 'Gmail sign-in expired. 4 still queued. Sign in again and tap Unsubscribe.', tone: 'error' });
  if (screen === 'update') useUpdate.setState({ ready: true });
  await new Promise((r) => setTimeout(r, 300));
  Object.assign(window, { __ready: true });
}

const content = await setup();
createRoot(document.getElementById('root')!).render(
  <>
    <InkFilter />
    {content}
    <UpdateBanner />
  </>,
);
void afterMount();
