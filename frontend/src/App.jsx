import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import AuthModal from './components/AuthModal';
import HomePage from './pages/HomePage';
import RestaurantsPage from './pages/RestaurantsPage';
import RestaurantDetailPage from './pages/RestaurantDetailPage';
import CartPage from './pages/CartPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderConfirmationPage from './pages/OrderConfirmationPage';
import OrderTrackingPage from './pages/OrderTrackingPage';
import PredictETAPage from './pages/PredictETAPage';
import AnalyticsPage from './pages/AnalyticsPage';
import SystemStatusPage from './pages/SystemStatusPage';
import ProfilePage from './pages/ProfilePage';
import NotFoundPage from './pages/NotFoundPage';
import { ToastProvider } from './context/ToastContext';
import { LocationProvider } from './context/LocationContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { OrderProvider } from './context/OrderContext';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ToastProvider>
        <AuthProvider>
          <LocationProvider>
            <CartProvider>
              <OrderProvider>
                <AuthModal />
                <Routes>
                  <Route element={<MainLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/restaurants" element={<RestaurantsPage />} />
                    <Route
                      path="/restaurants/:slug"
                      element={<RestaurantDetailPage />}
                    />
                    <Route path="/cart" element={<CartPage />} />
                    <Route path="/checkout" element={<CheckoutPage />} />
                    <Route
                      path="/order-confirmation"
                      element={<OrderConfirmationPage />}
                    />
                    <Route
                      path="/order-confirmation/:orderId"
                      element={<OrderConfirmationPage />}
                    />
                    <Route path="/track" element={<OrderTrackingPage />} />
                    <Route
                      path="/track/:orderId"
                      element={<OrderTrackingPage />}
                    />
                    <Route path="/predict" element={<PredictETAPage />} />
                    <Route
                      path="/predict/:orderId"
                      element={<PredictETAPage />}
                    />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/analytics" element={<AnalyticsPage />} />
                    <Route path="/system" element={<SystemStatusPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Routes>
              </OrderProvider>
            </CartProvider>
          </LocationProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
