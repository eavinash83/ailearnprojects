// Flight schedule generator. The server calls ensureFlights() at every startup, which inserts any missing
// departures for the next DOMAIN.daysAhead days (ids are deterministic, so re-running is a no-op).
// Airlines are fictional.
import { DOMAIN, airport } from '../shared/domain.js';

const AIRLINES = [
  { code: 'SW', name: 'Skyway Airlines' },
  { code: 'AU', name: 'Aurora Air' },
  { code: 'PC', name: 'Pacific Crest' },
];

const AIRCRAFT = {
  narrow: { name: 'Airbus A320', economy: 150, business: 12 },
  mid: { name: 'Boeing 737-900', economy: 160, business: 16 },
  wide: { name: 'Boeing 787-9', economy: 230, business: 30 },
};

// [origin, destination, minutes there, minutes back, economy base fare, aircraft, departure times (origin local)]
const ROUTES = [
  ['JFK', 'LAX', 380, 330, 289, 'mid', ['07:30', '12:15', '18:45']],
  ['JFK', 'SFO', 400, 345, 309, 'mid', ['08:10', '16:20']],
  ['JFK', 'MIA', 190, 180, 129, 'narrow', ['06:45', '11:00', '17:30']],
  ['JFK', 'ORD', 165, 150, 119, 'narrow', ['07:00', '13:00', '19:15']],
  ['JFK', 'BOS', 75, 80, 89, 'narrow', ['06:30', '10:30', '15:30', '20:00']],
  ['JFK', 'LHR', 440, 410, 539, 'wide', ['19:30', '22:10']],
  ['LAX', 'SFO', 80, 85, 99, 'narrow', ['07:00', '11:30', '17:00']],
  ['LAX', 'SEA', 175, 160, 149, 'narrow', ['08:40', '14:50']],
  ['LAX', 'LAS', 70, 75, 79, 'narrow', ['06:55', '12:05', '18:10']],
  ['ORD', 'DEN', 150, 135, 139, 'mid', ['09:15', '15:45']],
  ['ATL', 'MIA', 125, 120, 109, 'narrow', ['07:20', '13:35', '19:50']],
  ['DFW', 'LAX', 195, 175, 179, 'mid', ['08:00', '14:00', '20:30']],
  ['SFO', 'SEA', 125, 120, 119, 'narrow', ['07:45', '17:15']],
  ['BOS', 'ORD', 165, 150, 129, 'narrow', ['09:00', '16:30']],
  ['ATL', 'JFK', 140, 135, 119, 'mid', ['06:50', '12:40', '18:20']],
  ['DEN', 'LAS', 120, 115, 109, 'narrow', ['10:10', '16:55']],
];

const BUSINESS_MULTIPLIER = 3.2;

// Small stable hash so the same flight always gets the same price/number.
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const t = (h * 60 + m + mins) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function buildTemplates() {
  const out = [];
  const used = new Set();
  for (const [a, b, there, back, fare, size, times] of ROUTES) {
    for (const [origin, destination, minutes] of [[a, b, there], [b, a, back]]) {
      times.forEach((time, i) => {
        const localTime = origin === b ? addMinutes(time, 37 + i * 11) : time;
        const h = hash(`${origin}${destination}${localTime}`);
        const airline = AIRLINES[h % AIRLINES.length];
        let n = 100 + (h % 880);
        while (used.has(`${airline.code}${n}`)) n++;
        const flightNo = `${airline.code}${n}`;
        used.add(flightNo);
        out.push({
          origin,
          destination,
          minutes,
          fare,
          size,
          localTime,
          airline,
          flightNo,
        });
      });
    }
  }
  return out;
}

const TEMPLATES = buildTemplates();

// Rows for every template on each of the next `days` calendar days (starting today, UTC calendar date).
export function buildFlightRows(days = DOMAIN.daysAhead) {
  const rows = [];
  const base = new Date();
  for (let d = 0; d <= days; d++) {
    const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + d));
    const localDate = date.toISOString().slice(0, 10);
    const weekend = [5, 0].includes(date.getUTCDay()); // Fri/Sun demand
    for (const t of TEMPLATES) {
      const h = hash(`${t.flightNo}${localDate}`);
      const economy = Math.round(t.fare * (weekend ? 1.15 : 1) * (0.88 + (h % 30) / 100));
      const craft = AIRCRAFT[t.size];
      rows.push({
        id: `${t.flightNo}-${localDate.replaceAll('-', '')}-${t.origin}`,
        flightNo: t.flightNo,
        airline: t.airline.name,
        origin: t.origin,
        destination: t.destination,
        originTz: airport(t.origin).tz,
        destTz: airport(t.destination).tz,
        localDate,
        localTime: t.localTime,
        minutes: t.minutes,
        aircraft: craft.name,
        economyPrice: economy,
        businessPrice: Math.round(economy * BUSINESS_MULTIPLIER),
        economySeats: craft.economy,
        businessSeats: craft.business,
      });
    }
  }
  return rows;
}
