import { Link } from 'react-router-dom';
import { CABINS } from '../../shared/domain';
import { cityOf, formatDuration, formatPrice, formatTime } from '../utils/format';

export default function FlightCard({ flight, cabin, passengers }) {
  const left = flight[`${cabin}Left`];
  const fare = flight[`${cabin}Price`];
  return (
    <article className={`card flight-card ${flight.available ? '' : 'flight-sold-out'}`}>
      <div className="flight-times">
        <div>
          <strong className="flight-time">{formatTime(flight.departsAt, flight.originTz)}</strong>
          <div className="muted small">{flight.origin} · {cityOf(flight.origin)}</div>
        </div>
        <div className="flight-line" aria-label={`Nonstop, ${formatDuration(flight.minutes)}`}>
          <span className="muted small">{formatDuration(flight.minutes)}</span>
          <span className="flight-rule" aria-hidden>✈</span>
          <span className="muted small">Nonstop</span>
        </div>
        <div>
          <strong className="flight-time">{formatTime(flight.arrivesAt, flight.destTz)}</strong>
          <div className="muted small">{flight.destination} · {cityOf(flight.destination)}</div>
        </div>
      </div>
      <div className="flight-meta muted small">
        {flight.airline} · {flight.flightNo} · {flight.aircraft}
      </div>
      <div className="flight-buy">
        <div>
          <span className="price">{formatPrice(fare)}</span>
          <small className="muted"> / person · {CABINS[cabin].label}</small>
          {left > 0 && left <= 9 && <div className="small low-seats">{left} seat{left === 1 ? '' : 's'} left</div>}
        </div>
        {flight.available ? (
          <Link to={`/book/${flight.id}?cabin=${cabin}&pax=${passengers}`} className="btn btn-primary">Select</Link>
        ) : (
          <button className="btn btn-ghost" disabled>{left === 0 ? 'Sold out' : `Only ${left} left`}</button>
        )}
      </div>
    </article>
  );
}
