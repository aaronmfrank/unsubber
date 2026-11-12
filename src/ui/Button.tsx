import { forwardRef, type ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'chip' | 'quiet';

const variants: Record<Variant, string> = {
  primary: 'bg-inkfill text-on-inkfill hover:opacity-90 active:opacity-80',
  secondary: 'border border-ctl bg-card text-ink hover:bg-paper',
  chip: 'bg-chip text-ink hover:brightness-95',
  quiet: 'text-ink underline underline-offset-[3px] hover:no-underline',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** Every control is a pill. Primary is ink, not a brand color: red, blue and amber belong to the triage actions. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className = '', type = 'button', ...props },
  ref,
) {
  const sizing = variant === 'quiet' ? 'text-caption font-semibold' : 'h-12 rounded-full px-5 text-body font-semibold';
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center gap-2 transition disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${variants[variant]} ${className}`}
      {...props}
    />
  );
});
