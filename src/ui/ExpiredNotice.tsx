import { useSession } from '../state/session';
import { Button } from './Button';

export function ExpiredNotice() {
  const { status, error, signIn } = useSession();
  if (status !== 'expired' && status !== 'signing_in') return null;

  return (
    <section role="alert" className="flex flex-col gap-3 rounded-card border border-cancel bg-card p-4">
      <p className="text-body text-cancel">{error ?? 'Gmail sign-in expired. Sign in again to keep going.'}</p>
      <Button onClick={() => void signIn()} disabled={status === 'signing_in'}>
        {status === 'signing_in' ? 'Signing in…' : 'Sign in again'}
      </Button>
    </section>
  );
}
