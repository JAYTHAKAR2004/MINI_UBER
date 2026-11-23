import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center">
      <p className="font-mono text-sm font-bold text-brand-primary">404</p>
      <h1 className="mt-2 font-display text-3xl font-extrabold text-brand-black">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-neutral-500">
        The route you requested does not exist on Zomato.
      </p>
      <Link
        to="/"
        className="mt-7 inline-flex items-center gap-2 rounded-full bg-brand-black px-6 py-3 text-sm font-semibold text-white hover:bg-neutral-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Home
      </Link>
    </div>
  );
}

