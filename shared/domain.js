// Everything that makes this app "an airline booking app", plus the pricing rules and the airport list.
// Imported by the server (source of truth for bookings) and the React app (price preview, labels). Change rules here only.
export const DOMAIN = {
  appName: 'SkyBook',
  tagline: 'Find and book flights in seconds',
  icon: '✈️',
  // Lower-case nouns; the UI capitalises them where needed.
  resource: 'flight',
  resources: 'flights',
  booking: 'booking',
  bookings: 'bookings',
  currency: 'USD',
  locale: 'en-US',
  maxPassengers: 6, // per booking
  daysAhead: 60, // how far in advance flights are sold (and seeded)
  closeBookingHours: 2, // no new bookings within this many hours of departure
  cancelBeforeHours: 24, // cancellation allowed until this many hours before departure
  taxRate: 0.075, // ticket tax on the fare
  feePerPassenger: 5.6, // flat segment fee per passenger
};

export const CABINS = {
  economy: { label: 'Economy', blurb: 'Carry-on bag, standard seat' },
  business: { label: 'Business', blurb: 'Lie-flat seat, lounge access, 2 checked bags' },
};
export const isCabin = (c) => Object.hasOwn(CABINS, c);

// Display zones are the airport's own: times are stored as timestamptz and shown in the origin/destination zone.
export const AIRPORTS = [
  { code: 'ATL', city: 'Atlanta', name: 'Hartsfield–Jackson', tz: 'America/New_York' },
  { code: 'BOS', city: 'Boston', name: 'Logan', tz: 'America/New_York' },
  { code: 'DEN', city: 'Denver', name: 'Denver International', tz: 'America/Denver' },
  { code: 'DFW', city: 'Dallas', name: 'Dallas/Fort Worth', tz: 'America/Chicago' },
  { code: 'JFK', city: 'New York', name: 'John F. Kennedy', tz: 'America/New_York' },
  { code: 'LAS', city: 'Las Vegas', name: 'Harry Reid', tz: 'America/Los_Angeles' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles International', tz: 'America/Los_Angeles' },
  { code: 'LHR', city: 'London', name: 'Heathrow', tz: 'Europe/London' },
  { code: 'MIA', city: 'Miami', name: 'Miami International', tz: 'America/New_York' },
  { code: 'ORD', city: 'Chicago', name: "O'Hare", tz: 'America/Chicago' },
  { code: 'SEA', city: 'Seattle', name: 'Seattle–Tacoma', tz: 'America/Los_Angeles' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco International', tz: 'America/Los_Angeles' },
];
export const airport = (code) => AIRPORTS.find((a) => a.code === code);

const round = (n) => Math.round(n * 100) / 100;

// Price for `passengers` travellers at `fare` per person. `fare` comes from the flights table (never from the client).
export function quote(fare, passengers) {
  const subtotal = round(fare * passengers);
  const tax = round(subtotal * DOMAIN.taxRate + DOMAIN.feePerPassenger * passengers);
  return { subtotal, tax, total: round(subtotal + tax) };
}
