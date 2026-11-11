import { useEffect } from 'react';
import { useScan } from '../state/scan';
import { useSession } from '../state/session';
import { AppShell } from './AppShell';
import { ScanScreen } from './ScanScreen';
import { SignInScreen } from './SignInScreen';
import { InkFilter } from './Stamp';

export function App() {
  const status = useSession((s) => s.status);
  const email = useSession((s) => s.email);
  const init = useSession((s) => s.init);
  const scanStatus = useScan((s) => s.status);
  const ensureScanned = useScan((s) => s.ensureScanned);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (status === 'signed_in' && email) void ensureScanned(email);
  }, [status, email, ensureScanned]);

  return (
    <>
      <InkFilter />
      <Screen status={status} email={email} scanStatus={scanStatus} />
    </>
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
