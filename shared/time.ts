export const WIB_TIMEZONE = 'Asia/Jakarta';

export const DAY_NAMES_ID = [
  '',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
  'Minggu',
];

export function getWibDateString(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: WIB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function getWibDayOfWeek(date: Date = new Date()): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: WIB_TIMEZONE,
    weekday: 'short',
  }).format(date);
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[weekday] ?? 1;
}

export function formatWibDateTime(isoUtc: string | null | undefined): string {
  if (!isoUtc) return '-';
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return '-';
  return (
    new Intl.DateTimeFormat('id-ID', {
      timeZone: WIB_TIMEZONE,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d) + ' WIB'
  );
}

export function formatWibDateOnly(isoUtc: string | null | undefined): string {
  if (!isoUtc) return '-';
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return '-';
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

export function formatCountdown(deadlineUtc: string): {
  label: string;
  isPast: boolean;
  isUrgent: boolean;
} {
  const diffMs = new Date(deadlineUtc).getTime() - Date.now();
  if (Number.isNaN(diffMs)) {
    return { label: '-', isPast: false, isUrgent: false };
  }
  if (diffMs <= 0) {
    const absHours = Math.floor(Math.abs(diffMs) / 3600000);
    if (absHours < 24) {
      return { label: `Terlewat ${absHours} jam`, isPast: true, isUrgent: true };
    }
    const absDays = Math.floor(absHours / 24);
    return { label: `Terlewat ${absDays} hari`, isPast: true, isUrgent: true };
  }
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) {
    return {
      label: `${days}h ${hours}j tersisa`,
      isPast: false,
      isUrgent: days < 1,
    };
  }
  return {
    label: `${hours}j ${mins}m tersisa`,
    isPast: false,
    isUrgent: true,
  };
}

export function wibLocalInputToUtcIso(wibDateTimeLocal: string): string {
  // Input format: YYYY-MM-DDTHH:mm (interpreted as Asia/Jakarta UTC+07:00)
  if (!wibDateTimeLocal) return new Date().toISOString();
  if (wibDateTimeLocal.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(wibDateTimeLocal)) {
    return new Date(wibDateTimeLocal).toISOString();
  }
  return new Date(`${wibDateTimeLocal}:00+07:00`).toISOString();
}

export function utcIsoToWibLocalInput(isoUtc: string): string {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: WIB_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
