import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#FF0A6C] disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default:     'bg-[#FF0A6C] text-white hover:bg-[#FF3D8A]',
        destructive: 'bg-red-600 text-white hover:bg-red-500',
        outline:     'border border-[#1f1f35] bg-transparent text-white hover:bg-[#13131f] hover:border-[#FF0A6C]/30',
        secondary:   'bg-[#13131f] text-[#a3a3b8] hover:bg-[#1a1a2e] hover:text-white',
        ghost:       'text-[#6b6b8a] hover:text-white hover:bg-[#13131f]',
        link:        'text-[#FF0A6C] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm:      'h-8 rounded-md px-3 text-xs',
        lg:      'h-11 rounded-md px-8',
        icon:    'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  )
);
Button.displayName = 'Button';

export { Button, buttonVariants };
