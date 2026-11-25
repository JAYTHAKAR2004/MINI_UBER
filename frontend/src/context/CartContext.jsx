import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { PROMO_OFFERS } from '../data/restaurants';
import { citiesMatch } from '../utils/haversine';

const STORAGE_KEY = 'mini_uber_cart_v1';
const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items)) {
          const hasLegacyUsdPrices = parsed.items.some(
            (item) => Number(item.price) < 30
          );
          if (!hasLegacyUsdPrices) {
            return {
              restaurant: parsed.restaurant || null,
              items: parsed.items,
              appliedPromoCode: parsed.appliedPromoCode || null,
            };
          }
        }
      }
    } catch {
      // ignore corrupted storage
    }
    return { restaurant: null, items: [], appliedPromoCode: null };
  });

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage errors
    }
  }, [cart]);

  const addItem = useCallback((item, restaurantInfo) => {
    setCart((prev) => {
      const incomingRestaurant = restaurantInfo
        ? {
            id: restaurantInfo.id,
            slug: restaurantInfo.slug,
            name: restaurantInfo.name,
            deliveryFee: restaurantInfo.deliveryFee ?? 29,
            etaMinutes: restaurantInfo.etaMinutes ?? 25,
            city: restaurantInfo.city || '',
            modelCity: restaurantInfo.modelCity || 'Metropolitian',
            deliveryAvailable: restaurantInfo.deliveryAvailable !== false,
            coordinates: restaurantInfo.coordinates || null,
            address: restaurantInfo.address || '',
            image: restaurantInfo.image || '',
          }
        : prev.restaurant;

      const isSameRestaurant =
        !prev.restaurant ||
        !incomingRestaurant ||
        prev.restaurant.id === incomingRestaurant.id;

      const baseItems = isSameRestaurant ? prev.items : [];
      const existing = baseItems.find((i) => i.id === item.id);

      let nextItems;
      if (existing) {
        nextItems = baseItems.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      } else {
        nextItems = [
          ...baseItems,
          {
            id: item.id,
            name: item.name,
            price: Number(item.price),
            image: item.image,
            isVeg: item.isVeg ?? true,
            orderType: item.orderType || 'Meal',
            quantity: 1,
          },
        ];
      }

      return {
        restaurant: incomingRestaurant,
        items: nextItems,
        appliedPromoCode: isSameRestaurant ? prev.appliedPromoCode : null,
      };
    });
  }, []);

  const updateQuantity = useCallback((itemId, delta) => {
    setCart((prev) => {
      const nextItems = prev.items
        .map((item) =>
          item.id === itemId
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0);

      return {
        restaurant: nextItems.length > 0 ? prev.restaurant : null,
        items: nextItems,
        appliedPromoCode: nextItems.length > 0 ? prev.appliedPromoCode : null,
      };
    });
  }, []);

  const removeItem = useCallback((itemId) => {
    setCart((prev) => {
      const nextItems = prev.items.filter((item) => item.id !== itemId);
      return {
        restaurant: nextItems.length > 0 ? prev.restaurant : null,
        items: nextItems,
        appliedPromoCode: nextItems.length > 0 ? prev.appliedPromoCode : null,
      };
    });
  }, []);

  const clearCart = useCallback(() => {
    setCart({ restaurant: null, items: [], appliedPromoCode: null });
  }, []);

  const clearIncompatibleCart = useCallback(
    (nextCity) => {
      if (
        cart.items.length > 0 &&
        cart.restaurant?.city &&
        nextCity &&
        !citiesMatch(cart.restaurant.city, nextCity)
      ) {
        const previousRestaurant = cart.restaurant;
        setCart({ restaurant: null, items: [], appliedPromoCode: null });
        return previousRestaurant;
      }
      return null;
    },
    [cart.items.length, cart.restaurant]
  );

  const applyPromo = useCallback((rawCode) => {
    const code = String(rawCode || '').trim().toUpperCase();
    const offer = PROMO_OFFERS[code];
    if (!offer) {
      return { ok: false, message: 'Invalid coupon code. Try WELCOME50, ZOMATO75, or FREEDEL.' };
    }
    setCart((prev) => ({
      ...prev,
      appliedPromoCode: code,
    }));
    return { ok: true, message: `${code} applied — ${offer.title}` };
  }, []);

  const removePromo = useCallback(() => {
    setCart((prev) => ({ ...prev, appliedPromoCode: null }));
  }, []);

  const summary = useMemo(() => {
    const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.items.reduce(
      (sum, item) => sum + Number(item.price) * item.quantity,
      0
    );
    const baseDeliveryFee =
      cart.items.length > 0 ? Number(cart.restaurant?.deliveryFee ?? 29) : 0;
    const platformFee = cart.items.length > 0 ? 6 : 0;
    const taxes = Math.round(subtotal * 0.05 * 100) / 100;

    const promo = cart.appliedPromoCode
      ? PROMO_OFFERS[cart.appliedPromoCode] || null
      : null;

    let discount = 0;
    let deliveryFee = baseDeliveryFee;
    const promoEligible = promo ? subtotal >= promo.minOrder : false;

    if (promo && promoEligible) {
      if (promo.type === 'percent') {
        discount = Math.min(
          promo.maxDiscount,
          Math.round((subtotal * promo.value) / 100)
        );
      } else if (promo.type === 'flat') {
        discount = Math.min(promo.maxDiscount, subtotal);
      } else if (promo.type === 'free_delivery') {
        deliveryFee = 0;
      }
    }

    const total = Math.max(
      0,
      Math.round((subtotal + deliveryFee + platformFee + taxes - discount) * 100) /
        100
    );

    return {
      itemCount,
      subtotal,
      deliveryFee,
      platformFee,
      taxes,
      discount,
      total,
      appliedPromo: promo,
      promoEligible,
    };
  }, [cart]);

  return (
    <CartContext.Provider
      value={{
        items: cart.items,
        restaurant: cart.restaurant,
        ...summary,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        clearIncompatibleCart,
        applyPromo,
        removePromo,
        isDrawerOpen,
        openDrawer: () => setIsDrawerOpen(true),
        closeDrawer: () => setIsDrawerOpen(false),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used inside CartProvider');
  }
  return ctx;
}
