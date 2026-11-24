import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { Bike, Clock, MapPin, Navigation, Pause, Play, Store } from 'lucide-react';
import { fetchDrivingRoute } from '../../services/geocodingService';
import { calculateHaversineKm } from '../../utils/haversine';

function makeMarkerIcon(label, bgColor) {
  return L.divIcon({
    className: 'zomato-tracking-marker',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;background:${bgColor};color:#fff;font-size:12px;font-weight:800;border:2.5px solid #fff;box-shadow:0 4px 12px rgba(0,0,0,0.28);">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function getProgressForStage(stageIndex) {
  if (stageIndex <= 2) return 0;
  if (stageIndex === 3) return 0.15;
  if (stageIndex === 4) return 0.35;
  if (stageIndex === 5) return 0.72;
  return 1;
}

export default function DeliveryTrackingMap({
  restaurantName = 'Restaurant',
  restaurantCoords = { lat: 12.9716, lng: 77.5946 },
  deliveryCoords = { lat: 12.9855, lng: 77.6412 },
  deliveryLabel = 'Delivery Address',
  etaMinutes = 24,
  stageIndex = 1,
  stageLabel = 'Restaurant confirmed',
  showPartner = true,
  heightClass = 'h-72 sm:h-80',
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const routeLayerRef = useRef(null);
  const partnerMarkerRef = useRef(null);

  const [routeData, setRouteData] = useState({
    coordinates: [
      [restaurantCoords.lat, restaurantCoords.lng],
      [deliveryCoords.lat, deliveryCoords.lng],
    ],
    source: 'direct',
    distanceKm: null,
  });
  const [simulatingMovement, setSimulatingMovement] = useState(false);
  const [simulatedProgress, setSimulatedProgress] = useState(
    () => getProgressForStage(stageIndex)
  );

  useEffect(() => {
    if (!simulatingMovement) {
      setSimulatedProgress(getProgressForStage(stageIndex));
    }
  }, [stageIndex, simulatingMovement]);

  useEffect(() => {
    let active = true;
    fetchDrivingRoute(
      restaurantCoords.lat,
      restaurantCoords.lng,
      deliveryCoords.lat,
      deliveryCoords.lng
    ).then((res) => {
      if (active) setRouteData(res);
    });
    return () => {
      active = false;
    };
  }, [
    restaurantCoords.lat,
    restaurantCoords.lng,
    deliveryCoords.lat,
    deliveryCoords.lng,
  ]);

  useEffect(() => {
    if (!simulatingMovement) return undefined;
    const timer = setInterval(() => {
      setSimulatedProgress((prev) => {
        if (prev >= 0.96) return 0.05;
        return Math.min(0.96, prev + 0.06);
      });
    }, 900);
    return () => clearInterval(timer);
  }, [simulatingMovement]);

  const partnerPosition = useMemo(() => {
    const coords = routeData.coordinates;
    if (!coords || coords.length === 0) {
      return [restaurantCoords.lat, restaurantCoords.lng];
    }
    const idx = Math.min(
      coords.length - 1,
      Math.max(0, Math.round(simulatedProgress * (coords.length - 1)))
    );
    return coords[idx];
  }, [routeData.coordinates, simulatedProgress, restaurantCoords.lat, restaurantCoords.lng]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;

    const map = L.map(containerRef.current, {
      center: [
        (restaurantCoords.lat + deliveryCoords.lat) / 2,
        (restaurantCoords.lng + deliveryCoords.lng) / 2,
      ],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    routeLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      map.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      partnerMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = routeLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const polyline = L.polyline(routeData.coordinates, {
      color: '#E23744',
      weight: 4,
      opacity: 0.9,
      dashArray: routeData.source === 'direct' ? '6 8' : undefined,
    }).addTo(layer);

    L.marker([restaurantCoords.lat, restaurantCoords.lng], {
      icon: makeMarkerIcon('R', '#E23744'),
    })
      .bindPopup(`<strong>${restaurantName}</strong><br/>Pickup Kitchen`)
      .addTo(layer);

    L.marker([deliveryCoords.lat, deliveryCoords.lng], {
      icon: makeMarkerIcon('D', '#1C1C1C'),
    })
      .bindPopup(`<strong>Drop Location</strong><br/>${deliveryLabel}`)
      .addTo(layer);

    if (showPartner) {
      partnerMarkerRef.current = L.marker(partnerPosition, {
        icon: makeMarkerIcon('P', '#267E3E'),
      })
        .bindPopup(
          '<strong>Delivery Partner (Simulated)</strong><br/>Live courier GPS is not connected'
        )
        .addTo(layer);
    }

    const bounds = polyline.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    }
  }, [
    routeData,
    restaurantCoords.lat,
    restaurantCoords.lng,
    deliveryCoords.lat,
    deliveryCoords.lng,
    restaurantName,
    deliveryLabel,
    showPartner,
  ]);

  useEffect(() => {
    if (showPartner && partnerMarkerRef.current && partnerPosition) {
      partnerMarkerRef.current.setLatLng(partnerPosition);
    }
  }, [partnerPosition, showPartner]);

  const haversineKm = calculateHaversineKm(
    restaurantCoords.lat,
    restaurantCoords.lng,
    deliveryCoords.lat,
    deliveryCoords.lng
  );
  const displayDistance = routeData.distanceKm ?? haversineKm;

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-soft">
      {/* Top Map Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 bg-surface-soft px-4 py-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-brand-black">
            <Navigation className="h-3.5 w-3.5 text-brand-primary" />
            {displayDistance ?? '--'} km {routeData.source === 'osrm' ? 'road route' : 'direct distance'}
          </span>
          <span className="inline-flex items-center gap-1.5 font-semibold text-brand-black">
            <Clock className="h-3.5 w-3.5 text-brand-primary" />
            ETA {etaMinutes} min
          </span>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-neutral-700 border border-neutral-200">
            {stageLabel}
          </span>
        </div>

        {showPartner && (
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 border border-amber-200">
              Simulated Partner GPS
            </span>
            <button
              type="button"
              onClick={() => setSimulatingMovement((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-black px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-neutral-800"
            >
              {simulatingMovement ? (
                <>
                  <Pause className="h-3 w-3" />
                  Pause Demo
                </>
              ) : (
                <>
                  <Play className="h-3 w-3" />
                  Simulate Rider
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Leaflet Canvas */}
      <div ref={containerRef} className={`w-full ${heightClass}`} />

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 bg-white px-4 py-2.5 text-[11px] text-neutral-600">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5 text-brand-primary" />
            <strong>R</strong> Restaurant
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-brand-black" />
            <strong>D</strong> Your Address
          </span>
          {showPartner && (
            <span className="inline-flex items-center gap-1.5">
              <Bike className="h-3.5 w-3.5 text-brand-rating" />
              <strong>P</strong> Delivery Partner (Simulated)
            </span>
          )}
        </div>
        <span className="text-neutral-400">OpenStreetMap · Leaflet</span>
      </div>
    </div>
  );
}

