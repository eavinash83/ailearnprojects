import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CABINS, DOMAIN } from '../../shared/domain';
import { useToast } from '../context/ToastContext';
import { cancelBooking, getBooking } from '../services/api';
import { cityOf, formatDay, formatDuration, formatPrice, formatTime } from '../utils/format';

export default function BookingDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const showToast = useToast();
  const [booking, setBooking] = useState(undefined); // undefined = loading, null = not found
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getBooking(id).then(setBooking).catch(() => setError('Could not load this booking.'));
  }, [id]);

  if (error) return <div className="container empty"><p className="muted">{error}</p></div>;
  if (booking === null) {
    return (
      <div className="container empty">
        <div className="empty-icon">🧭</div>
        <h2>Booking not found</h2>
        <Link to="/bookings" className="btn btn-primary">My bookings</Link>
      </div>
    );
  }
  if (!booking) return <div className="container"><div className="card skeleton" /></div>;

  const onCancel = async () => {
    if (!window.confirm('Cancel this booking?')) return;
    setBusy(true);
    try {
      setBooking(await cancelBooking(id));
      showToast('Booking cancelled');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const minutes = Math.round((new Date(booking.arrivesAt) - new Date(booking.departsAt)) / 60_000);

  return (
    <div className="container">
      {params.get('placed') === '1' && (
        <div className="success-banner" role="status">
          <div className="empty-icon">✅</div>
          <div>
            <h2>Booking confirmed</h2>
            <p>Confirmation code {booking.id}. Have a great flight!</p>
          </div>
        </div>
      )}
      <nav className="breadcrumbs">
        <Link to="/bookings">My Bookings</Link> / <span>{booking.id}</span>
      </nav>
      <div className="card stack">
        <div className="page-head">
          <h1>{cityOf(booking.origin)} → {cityOf(booking.destination)}</h1>
          <span className={`status ${booking.status === 'Cancelled' ? 'status-cancelled' : ''}`}>{booking.status}</span>
        </div>
        <p>
          <strong>{booking.airline} {booking.flightNo}</strong> · {CABINS[booking.cabin].label}
          <br />
          {formatDay(booking.departsAt, booking.originTz)} · {formatTime(booking.departsAt, booking.originTz)} {booking.origin} →{' '}
          {formatTime(booking.arrivesAt, booking.destTz)} {booking.destination}
          <span className="muted small"> ({formatDuration(minutes)}, times are local to each airport)</span>
        </p>
        <h2>Passengers</h2>
        <ol className="pax-list">
          {booking.passengers.map((p, i) => (
            <li key={i}>{p.firstName} {p.lastName}</li>
          ))}
        </ol>
        <dl className="summary-dl">
          <div><dt>Email</dt><dd>{booking.contact.email}</dd></div>
          <div><dt>{formatPrice(booking.fare)} × {booking.pax}</dt><dd>{formatPrice(booking.subtotal)}</dd></div>
          <div><dt>Taxes &amp; fees</dt><dd>{formatPrice(booking.tax)}</dd></div>
          <div className="summary-total"><dt>Total</dt><dd>{formatPrice(booking.total)}</dd></div>
        </dl>
        {booking.cancellable && (
          <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>Cancel booking</button>
        )}
        {booking.status === 'Confirmed' && !booking.cancellable && (
          <p className="muted small">Changes close {DOMAIN.cancelBeforeHours} hours before departure.</p>
        )}
      </div>
    </div>
  );
}
