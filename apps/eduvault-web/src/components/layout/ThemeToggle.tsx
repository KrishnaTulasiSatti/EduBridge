import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      className={cn(
        'grid size-9 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sunken hover:text-foreground',
        className,
      )}
    >
      {theme === 'dark' ? <Moon className="size-[18px]" /> : <Sun className="size-[18px]" />}
    </button>
  );
}
