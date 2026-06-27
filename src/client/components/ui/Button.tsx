import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

const variants: Record<ButtonVariant, string> = {
  primary:
    "border-relay-accent bg-relay-accent text-white hover:bg-[#669bff]",
  secondary:
    "border-relay-border-strong bg-relay-surface-2 text-relay-text hover:border-relay-accent/70 hover:bg-relay-raised",
  quiet:
    "border-transparent bg-transparent text-relay-muted hover:bg-relay-surface-2 hover:text-relay-text",
  danger:
    "border-relay-negative/50 bg-relay-negative/10 text-relay-negative hover:bg-relay-negative/20",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
}

export function Button({
  children,
  className = "",
  type = "button",
  variant = "secondary",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
