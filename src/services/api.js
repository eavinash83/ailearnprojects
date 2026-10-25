// Client for the Express API in server/api.js. Pages only talk to the backend through here.
async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' }, // the Better Auth session cookie is sent automatically (same origin)
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(data?.error ?? `Request failed (${res.status})`);
    error.status = res.status;
    throw error;
  }
  return data;
}

// Resolves to null instead of throwing when the thing doesn't exist.
const orNull = (promise) => promise.catch((err) => (err.status === 404 ? null : Promise.reject(err)));

export function searchFlights({ from, to, date, cabin, passengers, sort }) {
  const params = new URLSearchParams({ from, to, date, cabin, passengers });
  if (sort) params.set('sort', sort);
  return request(`/flights?${params}`);
}

export const getFlight = (id) => orNull(request(`/flights/${encodeURIComponent(id)}`));

export const createBooking = (payload) => request('/bookings', { method: 'POST', body: payload });

export const getBookings = () => request('/bookings');

export const getBooking = (id) => orNull(request(`/bookings/${encodeURIComponent(id)}`));

export const cancelBooking = (id) => request(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
