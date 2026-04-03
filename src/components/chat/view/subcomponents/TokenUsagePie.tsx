type TokenUsagePieProps = {
  used: number;
  total: number;
};

export default function TokenUsagePie({ used, total }: TokenUsagePieProps) {
  if (used == null || total == null || total <= 0) return null;

  const percentage = Math.min(100, (used / total) * 100);

  const barColor =
    percentage >= 75 ? 'bg-red-500' :
    percentage >= 50 ? 'bg-yellow-500' :
    'bg-blue-500';

  const textColor =
    percentage >= 75 ? 'text-red-500' :
    percentage >= 50 ? 'text-yellow-500' :
    'text-blue-500 dark:text-blue-400';

  return (
    <div
      className="flex w-6 flex-col items-center gap-0.5"
      title={`${used.toLocaleString()} / ${total.toLocaleString()} tokens`}
    >
      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {/* Percentage label */}
      <span className={`text-[10px] font-medium leading-none ${textColor}`}>
        {percentage.toFixed(0)}%
      </span>
    </div>
  );
}
