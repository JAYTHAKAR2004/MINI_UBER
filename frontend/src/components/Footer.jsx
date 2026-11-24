import { Link } from 'react-router-dom';
import BrandLogo from './BrandLogo';

export default function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-surface-soft text-brand-black">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div className="sm:col-span-2">
            <BrandLogo />
            <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-600">
              Explore restaurants, menus, cart, interactive maps, and live ML delivery ETA forecasts built on the{' '}
              <strong className="text-brand-black">Mini-Uber-ETA</strong> Random Forest platform.
            </p>
          </div>

          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-neutral-500">
              For Customers
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-neutral-700">
              <li>
                <Link to="/restaurants" className="hover:text-brand-primary">
                  Order Online
                </Link>
              </li>
              <li>
                <Link
                  to="/restaurants?tab=dining"
                  className="hover:text-brand-primary"
                >
                  Dining Out
                </Link>
              </li>
              <li>
                <Link to="/cart" className="hover:text-brand-primary">
                  Shopping Cart
                </Link>
              </li>
              <li>
                <Link to="/track" className="hover:text-brand-primary">
                  Track Order
                </Link>
              </li>
              <li>
                <Link to="/profile" className="hover:text-brand-primary">
                  Account &amp; Addresses
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-neutral-500">
              ETA Platform
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-neutral-700">
              <li>
                <Link to="/predict" className="hover:text-brand-primary">
                  Live AI Delivery ETA
                </Link>
              </li>
              <li>
                <Link to="/analytics" className="hover:text-brand-primary">
                  ML Performance Analytics
                </Link>
              </li>
              <li>
                <Link to="/system" className="hover:text-brand-primary">
                  System Health &amp; APIs
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-neutral-200 pt-6 text-xs text-neutral-500 sm:flex-row sm:items-center">
          <p>
            Independent academic project UI for <strong>Mini-Uber-ETA</strong>{' '}
            inspired by Zomato. Not affiliated with Zomato. Restaurant menus,
            demo accounts &amp; courier movement are simulated; ML ETA connects
            live to FastAPI.
          </p>
          <p className="font-mono text-neutral-500">
            Mini-Uber-ETA · Random Forest
          </p>
        </div>
      </div>
    </footer>
  );
}
