import { Link, NavLink, useNavigate } from 'react-router-dom';
import { DOMAIN } from '../../shared/domain';
import { authClient } from '../services/authClient';
import { storage } from '../services/storage';

export default function Header() {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  const signOut = async () => {
    await authClient.signOut();
    storage.remove('contact'); // don't leave the previous user's details on a shared browser
    navigate('/');
  };

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="logo">
          <span aria-hidden>{DOMAIN.icon}</span> {DOMAIN.appName}
        </Link>
        <nav className="nav">
          <NavLink to="/bookings">My Bookings</NavLink>
          {session ? (
            <>
              <span className="nav-user muted small" title={session.user.email}>{session.user.name}</span>
              <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <NavLink to="/login">Sign in</NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
