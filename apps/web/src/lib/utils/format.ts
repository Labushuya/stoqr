import { format, differenceInCalendarDays, parseISO } from 'date-fns';

function toDate(date: Date | string | null): Date | null {
  if (date === null) return null;
  if (date instanceof Date) return date;
  return parseISO(date);
}

export function formatDate(date: Date | string | null): string {
  const d = toDate(date);
  if (!d) return '—';
  return format(d, 'dd.MM.yyyy');
}

export function unitLabel(unit: string): string {
  const map: Record<string, string> = {
    piece: 'Stück',
    gram: 'g',
    kg: 'kg',
    ml: 'ml',
    liter: 'l',
  };
  return map[unit] ?? unit;
}

export function formatQuantity(value: number | string, unit: string): string {
  return `${value} ${unitLabel(unit)}`;
}

export function formatPrice(cents: number | null): string {
  if (cents === null) return '—';
  const euros = cents / 100;
  return `€ ${euros.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function daysFromNow(date: Date | string | null): number | null {
  const d = toDate(date);
  if (!d) return null;
  return differenceInCalendarDays(d, new Date());
}
