import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import {
  forwardRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';

const control =
  'w-full rounded-lg border border-border-strong bg-surface text-[15px] text-foreground outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-subtle focus:border-primary focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_14%,transparent)] disabled:cursor-not-allowed disabled:bg-sunken disabled:text-muted-foreground aria-[invalid=true]:border-danger';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  prefix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, invalid, type, prefix, ...props }, ref) => {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-muted-foreground">{prefix}</span>
      )}
      <input
        ref={ref}
        type={isPassword && show ? 'text' : type}
        aria-invalid={invalid || undefined}
        className={cn(control, 'h-10 px-3.5', prefix && 'pl-8', isPassword && 'pr-11', className)}
        {...props}
      />
      {isPassword && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted-foreground hover:text-foreground"
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      )}
    </div>
  );
});
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(control, 'min-h-28 resize-y px-3.5 py-2.5 leading-relaxed', className)}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  ({ className, invalid, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(control, 'h-10 cursor-pointer appearance-none pl-3.5 pr-10', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
);
Select.displayName = 'Select';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  optional,
  children,
  action,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  optional?: boolean;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
          {label}
          {optional && <span className="ml-1.5 font-normal text-subtle">Optional</span>}
        </label>
        {action}
      </div>
      {children}
      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }>(
  ({ label, description, className, id, ...props }, ref) => (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-3', className)}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-border-strong accent-[var(--primary)]"
        {...props}
      />
      <span className="text-sm leading-snug">
        <span className="text-foreground">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-muted-foreground">{description}</span>}
      </span>
    </label>
  ),
);
Checkbox.displayName = 'Checkbox';
