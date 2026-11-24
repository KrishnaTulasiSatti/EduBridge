import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Fades content up the first time it scrolls into view. */
export function Reveal({
  children,
  as: Tag = 'div',
  delay = 0,
  className,
  ...rest
}: {
  children: ReactNode;
  as?: ElementType;
  delay?: number;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={cn('reveal', visible && 'is-visible', className)}
      style={delay ? ({ '--reveal-delay': `${delay}ms` } as CSSProperties) : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
