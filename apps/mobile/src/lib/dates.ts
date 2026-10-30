export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysAgo(days: number, from = new Date()): string {
  const copy = new Date(from);
  copy.setDate(copy.getDate() - days);
  return isoDate(copy);
}

const dateFormatter = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const dateTimeFormatter = new Intl.DateTimeFormat('en-ZA', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDate(value: string): string {
  // Plain dates (YYYY-MM-DD) are local calendar dates; avoid a UTC shift.
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return dateFormatter.format(date);
}

export function formatDateTime(value: string): string {
  return dateTimeFormatter.format(new Date(value));
}
