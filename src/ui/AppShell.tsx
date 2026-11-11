import { useEffect, useState } from 'react';
import { useDeck } from '../state/deck';
import { useScan } from '../state/scan';
import { DeckScreen } from './deck/DeckScreen';
import { ExpiredNotice } from './ExpiredNotice';
import { number } from './format';
import { SettingsScreen } from './SettingsScreen';

type Screen = 'deck' | 'manual' | 'history' | 'settings';

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto flex max-w-[400px] flex-col gap-2 px-6 py-8">
      <h1 className="text-title font-bold">{title}</h1>
      <p className="text-body text-ink-muted">{body}</p>
    </div>
  );
}

export function AppShell() {
  const [screen, setScreen] = useState<Screen>('deck');
  const scanVersion = useScan((s) => s.version);
  const load = useDeck((s) => s.load);
  const manualCount = useDeck((s) => Object.values(s.senders).filter((sender) => sender.status === 'manual').length);

  useEffect(() => {
    void load();
  }, [scanVersion, load]);

  const tabs: { id: Screen; label: string }[] = [
    { id: 'deck', label: 'Deck' },
    { id: 'manual', label: manualCount > 0 ? `Manual (${number.format(manualCount)})` : 'Manual' },
    { id: 'history', label: 'History' },
    { id: 'settings', label: 'Settings' },
  ];

  return (
    <div className="flex h-dvh flex-col pt-[env(safe-area-inset-top)] min-[900px]:flex-row">
      <nav
        aria-label="Main"
        className="order-last flex border-t border-rule bg-card pb-[env(safe-area-inset-bottom)] min-[900px]:order-first min-[900px]:w-48 min-[900px]:flex-col min-[900px]:gap-1 min-[900px]:border-t-0 min-[900px]:border-r min-[900px]:p-3"
      >
        <p className="hidden px-3 pb-4 pt-2 text-lead font-bold min-[900px]:block">Unsubber</p>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setScreen(tab.id)}
            aria-current={screen === tab.id ? 'page' : undefined}
            className={`flex-1 py-3 text-caption transition min-[900px]:flex-none min-[900px]:rounded-md min-[900px]:px-3 min-[900px]:py-2 min-[900px]:text-left min-[900px]:text-body ${
              screen === tab.id ? 'font-semibold text-post min-[900px]:bg-paper' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-[400px] px-4 empty:hidden [&:has(>*)]:pt-4">
          <ExpiredNotice />
        </div>
        <div className="min-h-0 flex-1">
          {screen === 'deck' && <DeckScreen />}
          {screen === 'manual' && (
            <Placeholder title="Manual" body="Nothing needs you yet. Senders that need a link clicked show up here after you unsubscribe." />
          )}
          {screen === 'history' && (
            <Placeholder title="History" body="No unsubscribes yet. Senders you unsubscribe from or block show up here." />
          )}
          {screen === 'settings' && <SettingsScreen />}
        </div>
      </main>
    </div>
  );
}
