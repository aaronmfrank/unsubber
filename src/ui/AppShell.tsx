import { useEffect, type ComponentType } from 'react';
import { useDeck } from '../state/deck';
import { useNav, type Screen } from '../state/nav';
import { useScan } from '../state/scan';
import { useSync } from '../state/sync';
import { ConfirmSheet } from './deck/ConfirmSheet';
import { DeckScreen } from './deck/DeckScreen';
import { ExpiredNotice } from './ExpiredNotice';
import { HistoryScreen } from './HistoryScreen';
import { DeckIcon, HistoryIcon, ManualIcon, SettingsIcon } from './icons';
import { ManualScreen } from './ManualScreen';
import { SettingsScreen } from './SettingsScreen';
import { Toast } from './Toast';

const TABS: { id: Screen; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'deck', label: 'Deck', Icon: DeckIcon },
  { id: 'manual', label: 'Manual', Icon: ManualIcon },
  { id: 'history', label: 'History', Icon: HistoryIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] leading-none font-bold text-on-accent">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function AppShell() {
  const { screen, setScreen } = useNav();
  const scanVersion = useScan((s) => s.version);
  const load = useDeck((s) => s.load);
  const manualCount = useDeck((s) => Object.values(s.senders).filter((sender) => sender.status === 'manual').length);

  useEffect(() => {
    void load().then(() => useSync.getState().sync('open'));
  }, [scanVersion, load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void useSync.getState().sync('resume');
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return (
    <div className="flex h-dvh flex-col pt-[env(safe-area-inset-top)] min-[900px]:flex-row">

      <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto pb-[calc(106px+env(safe-area-inset-bottom))] min-[900px]:pb-0">
        <div className="mx-auto w-full max-w-[400px] px-4 empty:hidden [&:has(>*)]:pt-4">
          <ExpiredNotice />
        </div>
        <div className="min-h-0 flex-1">
          {screen === 'deck' && <DeckScreen />}
          {screen === 'manual' && <ManualScreen />}
          {screen === 'history' && <HistoryScreen />}
          {screen === 'settings' && <SettingsScreen />}
        </div>
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-4 bottom-[calc(20px+env(safe-area-inset-bottom))] z-20 flex h-[68px] gap-1 rounded-full bg-pill p-1.5 min-[900px]:static min-[900px]:order-first min-[900px]:inset-auto min-[900px]:m-4 min-[900px]:h-auto min-[900px]:w-52 min-[900px]:flex-col min-[900px]:self-start min-[900px]:rounded-[28px]"
      >
        <p className="hidden px-4 pt-3 pb-2 text-lead font-bold text-pill-muted min-[900px]:block">Unsubber</p>
        {TABS.map(({ id, label, Icon }) => {
          const active = screen === id;
          const count = id === 'manual' ? manualCount : 0;
          return (
            <button
              key={id}
              onClick={() => setScreen(id)}
              aria-current={active ? 'page' : undefined}
              aria-label={count > 0 ? `${label}, ${count} need you` : label}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-full transition min-[900px]:h-12 min-[900px]:flex-none min-[900px]:flex-row min-[900px]:justify-start min-[900px]:gap-2.5 min-[900px]:px-4 ${
                active
                  ? 'gap-1.5 bg-pill-active text-[14px] font-bold text-on-pill-active'
                  : 'flex-col gap-0.5 text-[12px] font-semibold text-pill-muted hover:text-white min-[900px]:text-[14px]'
              }`}
            >
              <span className="relative">
                <Icon size={18} />
                {!active && <CountBadge count={count} />}
              </span>
              {label}
            </button>
          );
        })}
      </nav>

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(100px+env(safe-area-inset-bottom))] z-30 flex justify-center px-4 empty:hidden min-[900px]:bottom-6 min-[900px]:left-56 [&>*]:pointer-events-auto [&>*]:w-full [&>*]:max-w-[440px]">
        <Toast />
      </div>

      <ConfirmSheet />
    </div>
  );
}
