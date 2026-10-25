import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AIRPORTS, CABINS, DOMAIN } from '../../shared/domain';
import FlightCard from '../components/FlightCard';
import { searchFlights } from '../services/api';
import { cityOf, isoDate } from '../utils/format';

const POPULAR = [['JFK', 'LAX'], ['JFK', 'LHR'], ['LAX', 'LAS'], ['ORD', 'DEN'], ['ATL', 'MIA'], ['SFO', 'SEA']];

function AirportSelect({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} required>
        <option value="">Select airport</option>
        {AIRPORTS.map((a) => (
          <option key={a.code} value={a.code}>{a.city} ({a.code})</option>
        ))}
      </select>
    </label>
  );
}

export default function HomePage() {
  // The submitted search lives in the URL so results can be shared, bookmarked and survive refresh.
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const date = params.get('date') ?? '';
  const cabin = params.get('cabin') ?? 'economy';
  const passengers = Number(params.get('pax') ?? 1) || 1;
  const sort = params.get('sort') ?? 'departure';
  const searched = Boolean(from && to && date);

  // Form draft (not yet submitted).
  const [draft, setDraft] = useState({ from, to, date: date || isoDate(7), cabin, passengers });
  useEffect(() => {
    setDraft({ from, to, date: date || isoDate(7), cabin, passengers });
  }, [from, to, date, cabin, passengers]);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!searched) return;
    let cancelled = false; // ignore out-of-order responses when the search changes quickly
    setLoading(true);
    setError('');
    searchFlights({ from, to, date, cabin, passengers, sort })
      .then((list) => !cancelled && setFlights(list))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [searched, from, to, date, cabin, passengers, sort]);

  const submit = (e) => {
    e.preventDefault();
    if (!draft.from || !draft.to || draft.from === draft.to) return;
    setParams({ from: draft.from, to: draft.to, date: draft.date, cabin: draft.cabin, pax: String(draft.passengers) });
  };

  const swap = () => setDraft((d) => ({ ...d, from: d.to, to: d.from }));
  const sameAirport = draft.from && draft.from === draft.to;

  return (
    <div className="container">
      <section className="hero hero-search">
        <div>
          <h1>{DOMAIN.tagline}</h1>
          <p>Search nonstop flights, pick your cabin, and you're booked.</p>
        </div>
        <form className="search-form" onSubmit={submit}>
          <AirportSelect label="From" value={draft.from} onChange={set('from')} />
          <button type="button" className="btn btn-ghost swap" onClick={swap} aria-label="Swap origin and destination">⇄</button>
          <AirportSelect label="To" value={draft.to} onChange={set('to')} />
          <label className="field">
            <span>Departure</span>
            <input type="date" value={draft.date} min={isoDate(0)} max={isoDate(DOMAIN.daysAhead)} onChange={(e) => set('date')(e.target.value)} required />
          </label>
          <label className="field">
            <span>Passengers</span>
            <select value={draft.passengers} onChange={(e) => set('passengers')(Number(e.target.value))}>
              {Array.from({ length: DOMAIN.maxPassengers }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Cabin</span>
            <select value={draft.cabin} onChange={(e) => set('cabin')(e.target.value)}>
              {Object.entries(CABINS).map(([key, c]) => (
                <option key={key} value={key}>{c.label}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={!draft.from || !draft.to || sameAirport}>Search flights</button>
        </form>
        {sameAirport && <p className="form-error">Origin and destination must differ.</p>}
      </section>

      {!searched ? (
        <section>
          <h2>Popular routes</h2>
          <div className="chips">
            {POPULAR.map(([a, b]) => (
              <button
                key={a + b}
                className="chip"
                onClick={() => setParams({ from: a, to: b, date: draft.date, cabin: draft.cabin, pax: String(draft.passengers) })}
              >
                {cityOf(a)} → {cityOf(b)}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <div className="toolbar">
            <h2>{cityOf(from)} → {cityOf(to)}</h2>
            <label className="field-inline">
              Sort
              <select
                value={sort}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  next.set('sort', e.target.value);
                  setParams(next, { replace: true });
                }}
              >
                <option value="departure">Earliest departure</option>
                <option value="price">Cheapest</option>
                <option value="duration">Shortest</option>
              </select>
            </label>
          </div>

          {loading ? (
            <div className="flight-list">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card skeleton" style={{ height: 120 }} />
              ))}
            </div>
          ) : error ? (
            <div className="empty">
              <div className="empty-icon">⚠️</div>
              <h2>Something went wrong</h2>
              <p className="muted">{error}</p>
            </div>
          ) : flights.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">🛫</div>
              <h2>No flights found</h2>
              <p className="muted">No bookable flights on that date. Try another day.</p>
            </div>
          ) : (
            <div className="flight-list">
              {flights.map((f) => (
                <FlightCard key={f.id} flight={f} cabin={cabin} passengers={passengers} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
