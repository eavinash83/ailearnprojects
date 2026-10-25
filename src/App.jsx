import { useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { DOMAIN } from '../shared/domain';
import Header from './components/Header';
import RequireAuth from './components/RequireAuth';
import AuthPage from './pages/AuthPage';
import BookingDetailPage from './pages/BookingDetailPage';
import BookingPage from './pages/BookingPage';
import HomePage from './pages/HomePage';
import MyBookingsPage from './pages/MyBookingsPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function NotFound() {
  return (
    <div className="container empty">
      <div className="empty-icon">🧭</div>
      <h2>Page not found</h2>
      <Link to="/" className="btn btn-primary">Go home</Link>
    </div>
  );
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Header />
      <main className="main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/book/:id" element={<BookingPage />} />
            <Route path="/bookings" element={<MyBookingsPage />} />
            <Route path="/bookings/:id" element={<BookingDetailPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="container">{DOMAIN.appName} demo · no real payments are taken</div>
      </footer>
    </>
  );
}
