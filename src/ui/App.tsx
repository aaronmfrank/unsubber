import { useEffect } from 'react';
import { useSession } from '../state/session';
import { HomeScreen } from './HomeScreen';
import { SignInScreen } from './SignInScreen';

export function App() {
  const status = useSession((s) => s.status);
  const email = useSession((s) => s.email);
  const init = useSession((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (status === 'initializing') {
    return <main className="grid min-h-dvh place-items-center text-ink-muted">Loading…</main>;
  }
  const hasSession = status === 'signed_in' || status === 'expired' || (status === 'signing_in' && email);
  return hasSession ? <HomeScreen /> : <SignInScreen />;
}
