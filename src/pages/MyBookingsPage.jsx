import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CABINS } from '../../shared/domain';
import { getBookings } from '../services/api';
import { formatDay, formatPrice, formatTime } from '../utils/format';

export default function MyBookingsPage() {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getBookings().then(setBookings).catch(() => setError('Could not load your bookings.'));
  }, []);

  if (error) return <div className="container empty"><p className="muted">{error}</p></div>;
  if (!bookings) return <div className="container"><div className="card skeleton" /></div>;

  return (
    <div className="container">
      <h1>My Bookings</h1>
      {bookings.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🧳</div>
          <h2>No bookings yet</h2>
          <Link to="/" className="btn btn-primary">Search flights</Link>
        </div>
      ) : (
        <ul className="order-list">
          {bookings.map((b) => (
            <li key={b.id}>
              <Link to={`/bookings/${b.id}`} className="card order-row">
                <span>
                  <strong>{b.origin} → {b.destination}</strong> <span className="muted small">{b.flightNo}</span>
                  <br />
                  <span className="muted small">
                    {formatDay(b.departsAt, b.originTz)} · {formatTime(b.departsAt, b.originTz)} · {b.pax} × {CABINS[b.cabin].label}
                  </span>
                </span>
                <span className={`status ${b.status === 'Cancelled' ? 'status-cancelled' : ''}`}>{b.status}</span>
                <strong>{formatPrice(b.total)}</strong>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
