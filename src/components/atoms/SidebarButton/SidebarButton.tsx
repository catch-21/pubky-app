import { Slot } from 'radix-ui';
import { Button } from '../Button/Button';
import type { SidebarButtonProps } from './SidebarButton.types';

export function SidebarButton({ icon: Icon, children, asChild = false, ...props }: SidebarButtonProps) {
  // `bg-glass` is the faint white wash in dark mode and the page grey in light mode, where the
  // frame uses the card surface so the button reads lighter than the page.
  return (
    <Button
      asChild={asChild}
      variant="dark-outline"
      size="sm"
      className="w-full border-border bg-glass text-xs font-bold [.light_&]:bg-card"
      {...props}
    >
      <Icon className="size-4" />
      <Slot.Slottable>{children}</Slot.Slottable>
    </Button>
  );
}
