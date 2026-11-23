import { Link } from 'react-router-dom';
import BrandLogo from './BrandLogo';

export default function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-surface-soft text-brand-black">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <BrandLogo />
            <p className="mt-4 max-w-md text-sm leading-relaxed text-neutral-600">
              Order online from top local restaurants with real-time delivery
              ETA predictions powered by our{' '}
              <strong className="text-brand-black">Mini-Uber-ETA</strong>{' '}
              Random Forest Machine Learning platform.
            </p>
          </div>

          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-neutral-500">
              Food Ordering
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-neutral-700">
              <li>
                <Link to="/" className="hover:text-brand-primary">
                  Home
                </Link>
              </li>
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
                  Your Cart
                </Link>
              </li>
              <li>
                <Link to="/track" className="hover:text-brand-primary">
                  Track Order
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-display text-xs font-bold uppercase tracking-wider text-neutral-500">
              Project &amp; ETA Engine
            </h3>
            <ul className="mt-4 space-y-2.5 text-sm text-neutral-700">
              <li>
                <Link to="/predict" className="hover:text-brand-primary">
                  AI Delivery ETA Prediction
                </Link>
              </li>
              <li>
                <Link to="/analytics" className="hover:text-brand-primary">
                  ML Analytics Dashboard
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
            Academic project UI for <strong>Mini-Uber-ETA</strong> inspired by
            Zomato. Not affiliated with Zomato. Restaurant menus, payments &amp;
            order tracking use demo data; ETA predictions connect live to FastAPI.
          </p>
          <p className="font-mono text-neutral-500">Mini-Uber-ETA · Random Forest</p>
        </div>
      </div>
    </footer>
  );
}
