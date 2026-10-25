import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CABINS, DOMAIN, isCabin, quote } from '../../shared/domain';
import { useToast } from '../context/ToastContext';
import { usePersistentState } from '../hooks/usePersistentState';
import { createBooking, getFlight } from '../services/api';
import { authClient } from '../services/authClient';
import { cityOf, formatDay, formatDuration, formatPrice, formatTime } from '../utils/format';

const emptyPassenger = { firstName: '', lastName: '' };

function Field({ label, error, ...rest }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input aria-invalid={!!error} {...rest} />
      {error && <small className="error">{error}</small>}
    </label>
  );
}

// Cabin and passenger count arrive via the URL (?cabin=&pax=), so refresh and back/forward keep working.
export default function BookingPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const cabin = params.get('cabin');
  const pax = Number(params.get('pax'));
  const navigate = useNavigate();
  const showToast = useToast();
  const { data: session } = authClient.useSession();

  const [flight, setFlight] = useState(undefined);
  const [passengers, setPassengers] = useState(() => Array.from({ length: pax || 1 }, () => ({ ...emptyPassenger })));
  const [contact, setContact] = usePersistentState('contact', { email: '', phone: '' }); // remembered between visits
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Pre-fill from the account: email, and the first passenger's name when still empty.
  useEffect(() => {
    if (!session) return;
    setContact((c) => ({ ...c, email: c.email || session.user.email }));
    const [firstName, ...rest] = session.user.name.trim().split(/\s+/);
    setPassengers((list) =>
      list.map((p, i) => (i === 0 && !p.firstName && !p.lastName ? { firstName, lastName: rest.join(' ') } : p)),
    );
  }, [session, setContact]);

  useEffect(() => {
    let cancelled = false;
    getFlight(id)
      .then((f) => !cancelled && setFlight(f))
      .catch(() => !cancelled && setFlight(null));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!isCabin(cabin) || !Number.isInteger(pax) || pax < 1 || pax > DOMAIN.maxPassengers) return <Navigate to="/" replace />;
  if (flight === null) return <Navigate to="/" replace />;
  if (!flight) return <div className="container"><div className="card skeleton" /></div>;

  const fare = flight[`${cabin}Price`];
  const price = quote(fare, pax);
  const backToSearch = `/?from=${flight.origin}&to=${flight.destination}&date=${new Intl.DateTimeFormat('en-CA', { timeZone: flight.originTz }).format(new Date(flight.departsAt))}&cabin=${cabin}&pax=${pax}`;

  const setPassenger = (i, key, value) =>
    setPassengers((list) => list.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)));

  const validate = () => {
    const e = {};
    passengers.forEach((p, i) => {
      if (!p.firstName.trim()) e[`first${i}`] = 'First name is required';
      if (!p.lastName.trim()) e[`last${i}`] = 'Last name is required';
    });
    if (!/^\S+@\S+\.\S+$/.test(contact.email)) e.email = 'Enter a valid email';
    return e;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const booking = await createBooking({ flightId: id, cabin, passengers, contact });
      showToast('Booking confirmed');
      navigate(`/bookings/${booking.id}?placed=1`, { replace: true });
    } catch (err) {
      // 409 means the seats went meanwhile; the message says so and the link goes back to fresh availability.
      setSubmitError(err.message || 'Could not complete your booking. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="container">
      <nav className="breadcrumbs">
        <Link to={backToSearch}>Search results</Link> / <span>Passengers</span>
      </nav>
      <h1>Confirm your booking</h1>
      <form className="two-col" onSubmit={onSubmit} noValidate>
        <div className="stack">
          {passengers.map((p, i) => (
            <fieldset key={i} className="card form-section">
              <legend>Passenger {i + 1}</legend>
              <div className="form-grid">
                <Field label="First name" value={p.firstName} onChange={(e) => setPassenger(i, 'firstName', e.target.value)} error={errors[`first${i}`]} maxLength={60} autoComplete="given-name" />
                <Field label="Last name" value={p.lastName} onChange={(e) => setPassenger(i, 'lastName', e.target.value)} error={errors[`last${i}`]} maxLength={60} autoComplete="family-name" />
              </div>
            </fieldset>
          ))}
          <fieldset className="card form-section">
            <legend>Contact</legend>
            <div className="form-grid">
              <Field label="Email" type="email" value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} error={errors.email} autoComplete="email" />
              <Field label="Phone (optional)" type="tel" value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} autoComplete="tel" />
            </div>
          </fieldset>
        </div>

        <aside className="card summary">
          <h2>Summary</h2>
          <p>
            <strong>{flight.airline} {flight.flightNo}</strong>
            <br />
            {cityOf(flight.origin)} ({flight.origin}) → {cityOf(flight.destination)} ({flight.destination})
            <br />
            {formatDay(flight.departsAt, flight.originTz)} · {formatTime(flight.departsAt, flight.originTz)} → {formatTime(flight.arrivesAt, flight.destTz)}
            <br />
            <span className="muted small">{formatDuration(flight.minutes)} · {CABINS[cabin].label}</span>
          </p>
          <dl>
            <div><dt>{formatPrice(fare)} × {pax} passenger{pax === 1 ? '' : 's'}</dt><dd>{formatPrice(price.subtotal)}</dd></div>
            <div><dt>Taxes &amp; fees</dt><dd>{formatPrice(price.tax)}</dd></div>
            <div className="summary-total"><dt>Total</dt><dd>{formatPrice(price.total)}</dd></div>
          </dl>
          {submitError && (
            <p className="form-error" role="alert">
              {submitError} <Link to={backToSearch}>Back to results</Link>
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? 'Booking…' : `Confirm · ${formatPrice(price.total)}`}
          </button>
        </aside>
      </form>
    </div>
  );
}
