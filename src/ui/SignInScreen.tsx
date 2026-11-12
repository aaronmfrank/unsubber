import { isStandalone, switchAuthMode } from '../auth';
import { useSession } from '../state/session';
import { Button } from './Button';

export function SignInScreen() {
  const { status, error, authMode, configured, rememberedEmail, signIn } = useSession();
  const signingIn = status === 'signing_in';
  const showModeSwitch = authMode === 'redirect' || isStandalone();

  return (
    <main className="mx-auto flex min-h-dvh max-w-[400px] flex-col justify-center gap-8 px-6 py-12">
      <div className="flex flex-col gap-4">
        <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="size-16 rounded-[18px]" />
        <h1 className="text-display font-bold">Unsubber</h1>
        <p className="text-lead text-muted">
          Swipe through every sender in your Gmail. Unsubscribe, keep or save for later with one swipe.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button onClick={() => void signIn()} disabled={signingIn || !configured} className="w-full">
          {signingIn ? 'Signing in…' : rememberedEmail ? `Continue as ${rememberedEmail}` : 'Sign in with Google'}
        </Button>
        {rememberedEmail && (
          <Button variant="quiet" className="self-start" disabled={signingIn} onClick={() => void signIn({ differentAccount: true })}>
            Use a different account
          </Button>
        )}
        <p className="text-caption text-muted">
          Unsubber reads sender names, subjects and snippets from Gmail. Everything stays on this device.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-history border border-unsub bg-card px-4 py-3 text-body text-unsub">
          {error}
        </p>
      )}

      {showModeSwitch && (
        <Button variant="quiet" className="self-start" onClick={() => switchAuthMode(authMode === 'popup' ? 'redirect' : 'popup')}>
          {authMode === 'popup' ? 'Popup sign-in not working? Use redirect sign-in.' : 'Switch back to popup sign-in.'}
        </Button>
      )}
    </main>
  );
}
