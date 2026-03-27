export const formatTime = (value: Date) =>
  new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value);

export const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(value);

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

const relativeUnits = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
] as const;

export const formatRelativeTime = (value: Date, now = new Date()) => {
  const diffSeconds = Math.round((value.getTime() - now.getTime()) / 1000);

  for (const [unit, secondsPerUnit] of relativeUnits) {
    if (Math.abs(diffSeconds) >= secondsPerUnit || unit === 'second') {
      return relativeTimeFormatter.format(Math.round(diffSeconds / secondsPerUnit), unit);
    }
  }

  return relativeTimeFormatter.format(0, 'second');
};
