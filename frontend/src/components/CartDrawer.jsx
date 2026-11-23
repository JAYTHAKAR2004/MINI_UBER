import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../utils/formatters';
import FoodImage from './FoodImage';
import VegBadge from './VegBadge';

export default function CartDrawer() {
  const {
    items,
    restaurant,
    itemCount,
    subtotal,
    deliveryFee,
    platformFee,
    taxes,
    discount,
    appliedPromo,
    promoEligible,
    total,
    updateQuantity,
    removeItem,
    clearCart,
    isDrawerOpen,
    closeDrawer,
  } = useCart();
  const navigate = useNavigate();

  if (!isDrawerOpen) return null;

  const handleNavigate = (to) => {
    closeDrawer();
    navigate(to);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-black/40 transition-opacity"
        onClick={closeDrawer}
      />

      <aside
        aria-label="Shopping cart"
        className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-elevated"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-brand-black">
              Your Cart
            </h2>
            {restaurant && (
              <p className="text-xs text-neutral-500">
                From{' '}
                <span className="font-semibold text-brand-black">
                  {restaurant.name}
                </span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-neutral-500 hover:bg-red-50 hover:text-red-600"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Close cart"
              className="rounded-full p-2 text-neutral-500 transition-colors hover:bg-surface-soft hover:text-brand-black"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-soft">
                <ShoppingBag className="h-7 w-7 text-neutral-400" />
              </div>
              <h3 className="mt-4 font-display text-base font-bold text-brand-black">
                Your cart is empty
              </h3>
              <p className="mt-1 max-w-xs text-sm text-neutral-500">
                Add dishes from your favorite kitchens to place an order.
              </p>
              <button
                type="button"
                onClick={() => handleNavigate('/restaurants')}
                className="mt-5 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-primaryDark"
              >
                Browse Restaurants
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3.5 py-4">
                  <FoodImage
                    src={item.image}
                    alt={item.name}
                    containerClassName="h-16 w-16 shrink-0 rounded-xl"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <VegBadge isVeg={item.isVeg !== false} />
                      <p className="truncate text-sm font-semibold text-brand-black">
                        {item.name}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-neutral-500 tabular-nums">
                      {formatPrice(item.price)} each
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="inline-flex items-center rounded-lg border border-brand-primaryBorder bg-brand-primarySoft">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, -1)}
                          aria-label={`Decrease quantity of ${item.name}`}
                          className="p-1.5 text-brand-primaryDark hover:bg-brand-primary hover:text-white rounded-l-lg"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[1.5rem] text-center text-xs font-bold text-brand-primaryDark tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, 1)}
                          aria-label={`Increase quantity of ${item.name}`}
                          className="p-1.5 text-brand-primaryDark hover:bg-brand-primary hover:text-white rounded-r-lg"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-right text-sm font-bold text-brand-black tabular-nums">
                    {formatPrice(item.price * item.quantity)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-neutral-200 bg-surface-soft px-6 py-5">
            {appliedPromo && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                <Tag className="h-3.5 w-3.5 shrink-0" />
                {promoEligible
                  ? `${appliedPromo.code} applied!`
                  : `Add ${formatPrice(
                      appliedPromo.minOrder - subtotal
                    )} more for ${appliedPromo.code}`}
              </div>
            )}

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>Item total ({itemCount} items)</span>
                <span className="tabular-nums">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Delivery charge</span>
                <span className="tabular-nums">
                  {deliveryFee === 0 ? 'Free' : formatPrice(deliveryFee)}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Platform fee</span>
                <span className="tabular-nums">{formatPrice(platformFee)}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>GST &amp; restaurant charges (5%)</span>
                <span className="tabular-nums">{formatPrice(taxes)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between font-semibold text-emerald-700">
                  <span>Promo discount</span>
                  <span className="tabular-nums">-{formatPrice(discount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-neutral-200 pt-2 text-sm font-extrabold text-brand-black">
                <span>To Pay</span>
                <span className="tabular-nums">{formatPrice(total)}</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <Link
                to="/cart"
                onClick={closeDrawer}
                className="flex items-center justify-center rounded-xl border border-neutral-300 bg-white py-3 text-sm font-semibold text-brand-black transition-colors hover:bg-neutral-100"
              >
                Review Cart
              </Link>
              <button
                type="button"
                onClick={() => handleNavigate('/checkout')}
                className="rounded-xl bg-brand-primary py-3 text-sm font-semibold text-white shadow-soft transition-colors hover:bg-brand-primaryDark"
              >
                Checkout
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
