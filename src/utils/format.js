import { DOMAIN, airport } from '../../shared/domain';

const money = new Intl.NumberFormat(DOMAIN.locale, { style: 'currency', currency: DOMAIN.currency });
export const formatPrice = (value) => money.format(value);

export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Times are always shown in the airport's own zone, never the browser's: "7:30 AM" is 7:30 at that airport.
export const formatTime = (iso, tz) =>
  new Date(iso).toLocaleTimeString(DOMAIN.locale, { timeZone: tz, hour: 'numeric', minute: '2-digit' });
export const formatDay = (iso, tz) =>
  new Date(iso).toLocaleDateString(DOMAIN.locale, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' });

export const formatDuration = (minutes) => `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;

export const cityOf = (code) => airport(code)?.city ?? code;

// 'YYYY-MM-DD' for "today + days" (en-CA formats as an ISO date). Search dates are origin-local calendar days.
export function isoDate(addDays = 0) {
  return new Intl.DateTimeFormat('en-CA').format(new Date(Date.now() + addDays * 86_400_000));
}
