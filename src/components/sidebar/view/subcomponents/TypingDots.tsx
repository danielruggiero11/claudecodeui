import { cn } from '../../../../lib/utils';

type TypingDotsProps = {
  className?: string;
};

export default function TypingDots({ className }: TypingDotsProps) {
  return (
    <span className={cn('inline-flex items-center gap-[3px]', className)}>
      <span className="h-1 w-1 rounded-full bg-primary animate-typing-dot" />
      <span className="h-1 w-1 rounded-full bg-primary animate-typing-dot [animation-delay:150ms]" />
      <span className="h-1 w-1 rounded-full bg-primary animate-typing-dot [animation-delay:300ms]" />
    </span>
  );
}
