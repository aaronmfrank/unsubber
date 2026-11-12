import { useEffect } from 'react';
import { useUpdate } from '../pwa';
import { useQueue } from '../state/queue';
import { useScan } from '../state/scan';
import { useSession } from '../state/session';
import { AppShell } from './AppShell';
import { Button } from './Button';
import { ScanScreen } from './ScanScreen';
import { SignInScreen } from './SignInScreen';
import { InkFilter } from './Stamp';

export function App() {
  const status = useSession((s) => s.status);
  const email = useSession((s) => s.email);
  const init = useSession((s) => s.init);
  const scanStatus = useScan((s) => s.status);
  const ensureScanned = useScan((s) => s.ensureScanned);
  const updateReady = useUpdate((s) => s.ready);
  const applyUpdate = useUpdate((s) => s.apply);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (status === 'signed_in' && email) void ensureScanned(email);
  }, [status, email, ensureScanned]);

  // Before sign-in nothing is in flight, so a waiting update can reload straight away.
  useEffect(() => {
    if (updateReady && (status === 'initializing' || status === 'signed_out')) applyUpdate();
  }, [updateReady, status, applyUpdate]);

  return (
    <>
      <InkFilter />
      <Screen status={status} email={email} scanStatus={scanStatus} />
      <UpdateBanner />
    </>
  );
}

function UpdateBanner() {
  const { ready, apply } = useUpdate();
  const committing = useQueue((s) => s.running);
  if (!ready) return null;
  return (
    <div className="fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 flex justify-center px-4">
      <div role="status" className="flex w-full max-w-[440px] items-center gap-3 rounded-card border border-rule bg-card px-4 py-2 shadow-[0_8px_24px_rgba(15,23,42,0.18)]">
        <p className="flex-1 text-body">A new version of Unsubber is ready.</p>
        <Button variant="secondary" disabled={committing} onClick={apply}>
          Reload
        </Button>
      </div>
    </div>
  );
}

function Screen({ status, email, scanStatus }: { status: string; email: string | null; scanStatus: string }) {
  if (status === 'initializing') return <Loading />;
  const hasSession = status === 'signed_in' || status === 'expired' || (status === 'signing_in' && email);
  if (!hasSession) return <SignInScreen />;
  if (scanStatus === 'checking' && status === 'signed_in') return <Loading />;
  return scanStatus === 'done' ? <AppShell /> : <ScanScreen />;
}

function Loading() {
  return <main className="grid min-h-dvh place-items-center text-ink-muted">Loading…</main>;
}
