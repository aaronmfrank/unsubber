import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'quiet';

const variants: Record<Variant, string> = {
  primary: 'bg-post text-white hover:brightness-110 active:brightness-95',
  secondary: 'border border-rule bg-card text-ink hover:bg-paper',
  quiet: 'text-post underline-offset-2 hover:underline',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonProps) {
  const sizing = variant === 'quiet' ? 'text-caption' : 'h-11 rounded-card px-5 text-body font-semibold';
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 transition disabled:cursor-not-allowed disabled:opacity-60 ${sizing} ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
