import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'bg-card text-card-foreground rounded-xl border border-border shadow-sm',
        className,
      )}
      {...props}
    />
  );
}
