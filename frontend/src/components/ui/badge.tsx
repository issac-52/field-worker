import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
export function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex w-fit shrink-0 items-center gap-1 rounded-md border border-transparent px-2 py-1 text-xs font-medium whitespace-nowrap',
        className,
      )}
      {...props}
    />
  );
}
