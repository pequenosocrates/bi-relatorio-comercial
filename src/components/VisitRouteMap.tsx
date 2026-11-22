import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  ExternalLink,
  Layers,
  Lock,
  MapPin,
  Navigation,
  Route as RouteIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Visit } from '../types/report';
import {
  buildGoogleMapsRouteUrl,
  formatDatePT,
  getRecordedVisits,
  getVisitCoordinates,
  haversineDistanceKm,
  VISITS_PER_DAY,
} from '../utils/storage';

interface GeoVisit {
  visit: Visit;
  orderNumber: string;
  lat: number;
  lng: number;
}

interface RouteStats {
  distanceKm: number;
  durationMinutes: number | null;
  source: 'roads' | 'straight';
}

interface CachedRouteEntry {
  stats: RouteStats;
  path: Array<{ lat: number; lng: number }>;
}

// In-memory cache avoids redundant Google Routes API calls for identical coordinates
const computedRouteCache = new Map<string, CachedRouteEntry>();

interface VisitRouteMapProps {
  visits: Visit[];
  activeDateISO: string;
  onOpenVisit?: (index: number) => void;
}

function getMapsApiKey(): string {
  return (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim() || '';
}

function calculateStraightDistanceKm(points: GeoVisit[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineDistanceKm(points[i - 1], points[i]);
  }
  return total;
}

function NumberedVisitMarker({
  geo,
  isSelected,
  onSelect,
  onOpenVisit,
}: {
  geo: GeoVisit;
  isSelected: boolean;
  onSelect: () => void;
  onOpenVisit?: (index: number) => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const companyLabel = geo.visit.company.trim() || `Visita ${geo.orderNumber}`;

  const pinBg = isSelected
    ? 'bg-brand-gold text-brand-950 border-white ring-2 ring-brand-900'
    : geo.visit.isLocked
      ? 'bg-emerald-600 text-white border-white'
      : 'bg-brand-900 text-white border-white';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: geo.lat, lng: geo.lng }}
        title={`${geo.orderNumber} · ${companyLabel}`}
        onClick={onSelect}
        zIndex={isSelected ? 50 : geo.visit.id}
      >
        <div className="flex flex-col items-center cursor-pointer select-none -translate-y-1">
          <div
            className={`w-8 h-8 rounded-full border-2 shadow-md flex items-center justify-center font-mono font-extrabold text-xs tabular-nums transition-transform ${pinBg} ${
              isSelected ? 'scale-110' : 'hover:scale-105'
            }`}
          >
            {geo.orderNumber}
          </div>
          <div className="w-2 h-2 rotate-45 bg-brand-900 -mt-1 border-r border-b border-white/80" />
        </div>
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={250} onCloseClick={onSelect}>
          <div className="p-1 space-y-1.5 text-slate-800">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-brand-900 text-white text-[10px] font-mono font-bold tabular-nums">
                {geo.orderNumber}
              </span>
              <span className="text-xs font-extrabold text-brand-900 truncate">
                {companyLabel}
              </span>
            </div>
            <p className="text-[11px] font-mono tabular-nums text-slate-500">
              {geo.lat.toFixed(6)}, {geo.lng.toFixed(6)}
            </p>
            {geo.visit.nextAction && (
              <p className="text-[11px] text-slate-600">
                Acção: <strong className="text-brand-cyan">{geo.visit.nextAction}</strong>
              </p>
            )}
            {onOpenVisit && (
              <button
                type="button"
                onClick={() => onOpenVisit(geo.visit.id - 1)}
                className="w-full mt-1 px-2.5 py-1.5 rounded-lg bg-brand-surface hover:bg-sky-100 text-brand-900 text-[11px] font-bold transition"
              >
                Abrir Visita {geo.orderNumber}
              </button>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

interface PolylineHandle {
  setMap: (map: unknown) => void;
  setOptions?: (opts: Record<string, unknown>) => void;
  getPath?: () => { getArray: () => Array<{ lat: () => number; lng: () => number }> };
}

function RouteTrajectoryLayer({
  geoVisits,
  onStatsUpdate,
}: {
  geoVisits: GeoVisit[];
  onStatsUpdate: (stats: RouteStats) => void;
}) {
  const map = useMap();
  const coreLib = useMapsLibrary('core');
  const routesLib = useMapsLibrary('routes');
  const mapsLib = useMapsLibrary('maps');
  const polylinesRef = useRef<PolylineHandle[]>([]);

  useEffect(() => {
    if (!map || !coreLib || geoVisits.length === 0) return;

    const bounds = new coreLib.LatLngBounds();
    geoVisits.forEach((g) => bounds.extend({ lat: g.lat, lng: g.lng }));

    if (geoVisits.length === 1) {
      map.setCenter({ lat: geoVisits[0].lat, lng: geoVisits[0].lng });
      map.setZoom(14);
    } else {
      map.fitBounds(bounds, 56);
    }
  }, [map, coreLib, geoVisits]);

  useEffect(() => {
    if (!map || geoVisits.length < 2) {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
      onStatsUpdate({ distanceKm: 0, durationMinutes: null, source: 'straight' });
      return;
    }

    let cancelled = false;
    const clearPolylines = () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };

    const drawStraightFallback = () => {
      if (!mapsLib || cancelled) return;
      clearPolylines();
      const line = new mapsLib.Polyline({
        path: geoVisits.map((g) => ({ lat: g.lat, lng: g.lng })),
        geodesic: true,
        strokeColor: '#0084C7',
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map,
      });
      polylinesRef.current = [line];
      onStatsUpdate({
        distanceKm: calculateStraightDistanceKm(geoVisits),
        durationMinutes: null,
        source: 'straight',
      });
    };

    const cacheKey = geoVisits.map((g) => `${g.lat.toFixed(5)},${g.lng.toFixed(5)}`).join('|');
    const cached = computedRouteCache.get(cacheKey);
    if (cached && mapsLib) {
      clearPolylines();
      const line = new mapsLib.Polyline({
        path: cached.path,
        geodesic: true,
        strokeColor: '#0084C7',
        strokeOpacity: 0.92,
        strokeWeight: 5,
        map,
      });
      polylinesRef.current = [line];
      onStatsUpdate(cached.stats);
      return () => {
        cancelled = true;
        clearPolylines();
      };
    }

    // Google Routes API accepts at most 25 intermediates; keep safe cap
    if (!routesLib || geoVisits.length > 25) {
      drawStraightFallback();
      return () => {
        cancelled = true;
        clearPolylines();
      };
    }

    const origin = { lat: geoVisits[0].lat, lng: geoVisits[0].lng };
    const destination = {
      lat: geoVisits[geoVisits.length - 1].lat,
      lng: geoVisits[geoVisits.length - 1].lng,
    };
    const intermediates = geoVisits.slice(1, -1).map((g) => ({
      location: { lat: g.lat, lng: g.lng },
    }));

    const request: Record<string, unknown> = {
      origin,
      destination,
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
    };
    if (intermediates.length > 0) {
      request.intermediates = intermediates;
    }

    const routeClass = (routesLib as unknown as {
      Route?: {
        computeRoutes: (req: Record<string, unknown>) => Promise<{
          routes?: Array<{
            createPolylines?: () => PolylineHandle[];
            distanceMeters?: number;
            durationMillis?: number;
            viewport?: unknown;
          }>;
        }>;
      };
    }).Route;

    if (!routeClass || typeof routeClass.computeRoutes !== 'function') {
      drawStraightFallback();
      return () => {
        cancelled = true;
        clearPolylines();
      };
    }

    routeClass
      .computeRoutes(request)
      .then((response) => {
        if (cancelled) return;
        const primaryRoute = response?.routes?.[0];
        if (!primaryRoute || typeof primaryRoute.createPolylines !== 'function') {
          drawStraightFallback();
          return;
        }

        clearPolylines();
        const created = primaryRoute.createPolylines();
        const extractedPath: Array<{ lat: number; lng: number }> = [];
        created.forEach((polyline) => {
          polyline.setOptions?.({
            strokeColor: '#0084C7',
            strokeOpacity: 0.92,
            strokeWeight: 5,
          });
          polyline.setMap(map);
          const pts = polyline.getPath?.().getArray?.();
          if (pts) {
            pts.forEach((pt) => extractedPath.push({ lat: pt.lat(), lng: pt.lng() }));
          }
        });
        polylinesRef.current = created;

        if (primaryRoute.viewport) {
          map.fitBounds(primaryRoute.viewport as Parameters<typeof map.fitBounds>[0]);
        }

        const stats: RouteStats = {
          distanceKm:
            typeof primaryRoute.distanceMeters === 'number'
              ? primaryRoute.distanceMeters / 1000
              : calculateStraightDistanceKm(geoVisits),
          durationMinutes:
            typeof primaryRoute.durationMillis === 'number'
              ? Math.max(1, Math.round(primaryRoute.durationMillis / 60000))
              : null,
          source: 'roads',
        };

        if (extractedPath.length >= 2) {
          if (computedRouteCache.size >= 25) {
            const firstKey = computedRouteCache.keys().next().value;
            if (firstKey) computedRouteCache.delete(firstKey);
          }
          computedRouteCache.set(cacheKey, { stats, path: extractedPath });
        }

        onStatsUpdate(stats);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('QuotaExceeded') ||
          msg.includes('OVER_QUERY_LIMIT') ||
          msg.includes('429')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        drawStraightFallback();
      });

    return () => {
      cancelled = true;
      clearPolylines();
    };
  }, [map, routesLib, mapsLib, geoVisits, onStatsUpdate]);

  return null;
}

function GoogleRouteMapInner({
  geoVisits,
  selectedVisitId,
  onSelectVisitId,
  onOpenVisit,
  onStatsUpdate,
  onLoadFailed,
}: {
  geoVisits: GeoVisit[];
  selectedVisitId: number | null;
  onSelectVisitId: (id: number | null) => void;
  onOpenVisit?: (index: number) => void;
  onStatsUpdate: (stats: RouteStats) => void;
  onLoadFailed: () => void;
}) {
  const status = useApiLoadingStatus();

  useEffect(() => {
    if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
      onLoadFailed();
    }
  }, [status, onLoadFailed]);

  const initialCenter = useMemo(() => {
    if (geoVisits.length === 0) return { lat: -25.9692, lng: 32.5732 };
    const latSum = geoVisits.reduce((acc, g) => acc + g.lat, 0);
    const lngSum = geoVisits.reduce((acc, g) => acc + g.lng, 0);
    return { lat: latSum / geoVisits.length, lng: lngSum / geoVisits.length };
  }, [geoVisits]);

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return null;
  }

  return (
    <GoogleMap
      mapId="DEMO_MAP_ID"
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      defaultCenter={initialCenter}
      defaultZoom={12}
      gestureHandling="greedy"
      streetViewControl={false}
      mapTypeControl={false}
      fullscreenControl={true}
      style={{ width: '100%', height: '100%' }}
    >
      <RouteTrajectoryLayer geoVisits={geoVisits} onStatsUpdate={onStatsUpdate} />

      {geoVisits.map((geo) => (
        <NumberedVisitMarker
          key={geo.visit.id}
          geo={geo}
          isSelected={selectedVisitId === geo.visit.id}
          onSelect={() =>
            onSelectVisitId(selectedVisitId === geo.visit.id ? null : geo.visit.id)
          }
          onOpenVisit={onOpenVisit}
        />
      ))}
    </GoogleMap>
  );
}

function FallbackRouteCanvas({
  geoVisits,
  selectedVisitId,
  onSelectVisitId,
  onOpenVisit,
}: {
  geoVisits: GeoVisit[];
  selectedVisitId: number | null;
  onSelectVisitId: (id: number | null) => void;
  onOpenVisit?: (index: number) => void;
}) {
  const projected = useMemo(() => {
    const width = 640;
    const height = 360;
    const padX = 72;
    const padY = 56;

    if (geoVisits.length === 0) return [];

    const lats = geoVisits.map((g) => g.lat);
    const lngs = geoVisits.map((g) => g.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const spanLat = Math.max(maxLat - minLat, 0.004);
    const spanLng = Math.max(maxLng - minLng, 0.004);

    return geoVisits.map((geo, idx) => {
      const x =
        geoVisits.length === 1
          ? width / 2
          : padX + ((geo.lng - minLng) / spanLng) * (width - padX * 2);
      const y =
        geoVisits.length === 1
          ? height / 2
          : height - padY - ((geo.lat - minLat) / spanLat) * (height - padY * 2);

      const duplicateOffset = idx * 4;
      return {
        ...geo,
        x: Math.min(width - 36, Math.max(36, x + (spanLng === 0.004 ? duplicateOffset : 0))),
        y: Math.min(height - 36, Math.max(36, y)),
      };
    });
  }, [geoVisits]);

  const selectedGeo =
    projected.find((p) => p.visit.id === selectedVisitId) ?? projected[0] ?? null;

  const pathPoints = projected.map((p) => `${p.x},${p.y}`).join(' ');
  const showAllLabels = projected.length <= 5;

  return (
    <div className="relative h-full w-full bg-brand-surface flex flex-col justify-between overflow-hidden">
      <svg
        viewBox="0 0 640 360"
        className="w-full h-full select-none"
        role="img"
        aria-label="Mapa esquemático da trajectória de visitas comerciais"
      >
        <defs>
          <pattern id="bi-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke="#DCE7F3"
              strokeWidth="1"
            />
          </pattern>
          <marker
            id="route-arrow"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#0084C7" />
          </marker>
        </defs>

        <rect width="640" height="360" fill="url(#bi-grid)" />

        {projected.length >= 2 && (
          <>
            <polyline
              fill="none"
              stroke="#BAE6FD"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={pathPoints}
            />
            {projected.slice(0, -1).map((pt, i) => {
              const next = projected[i + 1];
              return (
                <line
                  key={`seg-${pt.visit.id}-${next.visit.id}`}
                  x1={pt.x}
                  y1={pt.y}
                  x2={next.x}
                  y2={next.y}
                  stroke="#0084C7"
                  strokeWidth="3"
                  strokeDasharray="6 4"
                  markerEnd="url(#route-arrow)"
                />
              );
            })}
          </>
        )}

        {projected.map((pt) => {
          const isSelected = selectedGeo?.visit.id === pt.visit.id;
          const fill = isSelected
            ? '#F59E0B'
            : pt.visit.isLocked
              ? '#059669'
              : '#192863';
          const textFill = isSelected ? '#101B47' : '#FFFFFF';
          const shortName =
            (pt.visit.company.trim() || `Visita ${pt.orderNumber}`).slice(0, 18) +
            ((pt.visit.company.trim().length || 0) > 18 ? '…' : '');

          return (
            <g
              key={pt.visit.id}
              className="cursor-pointer"
              onClick={() => onSelectVisitId(pt.visit.id)}
            >
              {isSelected && (
                <circle cx={pt.x} cy={pt.y} r="22" fill="#F59E0B" fillOpacity="0.22" />
              )}
              <circle
                cx={pt.x}
                cy={pt.y}
                r="15"
                fill={fill}
                stroke="#FFFFFF"
                strokeWidth="3"
              />
              <text
                x={pt.x}
                y={pt.y + 4}
                textAnchor="middle"
                fill={textFill}
                fontSize="11"
                fontWeight="800"
                fontFamily="JetBrains Mono, monospace"
              >
                {pt.orderNumber}
              </text>
              {(showAllLabels || isSelected) && (
                <g transform={`translate(${pt.x}, ${pt.y + 26})`}>
                  <rect
                    x="-58"
                    y="-10"
                    width="116"
                    height="18"
                    rx="6"
                    fill="#FFFFFF"
                    fillOpacity="0.94"
                    stroke={isSelected ? '#F59E0B' : '#CBD5E1'}
                    strokeWidth="1"
                  />
                  <text
                    x="0"
                    y="2.5"
                    textAnchor="middle"
                    fill="#192863"
                    fontSize="9.5"
                    fontWeight="700"
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {shortName}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>

      {selectedGeo && (
        <div className="absolute bottom-3 left-3 right-3 sm:left-auto sm:right-3 sm:w-72 bg-white/95 backdrop-blur-xs border border-slate-200 rounded-xl p-3 shadow-md flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-brand-900 text-white text-[10px] font-mono font-bold tabular-nums">
                {selectedGeo.orderNumber}
              </span>
              <span className="text-xs font-extrabold text-brand-900 truncate">
                {selectedGeo.visit.company.trim() || `Visita ${selectedGeo.orderNumber}`}
              </span>
            </div>
            <p className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
              {selectedGeo.lat.toFixed(6)}, {selectedGeo.lng.toFixed(6)}
            </p>
          </div>
          {onOpenVisit && (
            <button
              type="button"
              onClick={() => onOpenVisit(selectedGeo.visit.id - 1)}
              className="shrink-0 min-h-[34px] px-2.5 py-1 rounded-lg bg-brand-surface hover:bg-sky-100 text-brand-900 text-xs font-bold border border-slate-200 transition"
            >
              Abrir
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function VisitRouteMap({ visits, activeDateISO, onOpenVisit }: VisitRouteMapProps) {
  const apiKey = getMapsApiKey();
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [preferOfflineView, setPreferOfflineView] = useState(false);
  const [quotaBlocked, setQuotaBlocked] = useState(false);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [routeStats, setRouteStats] = useState<RouteStats>({
    distanceKm: 0,
    durationMinutes: null,
    source: 'straight',
  });

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onQuotaExceeded = () => setQuotaBlocked(true);

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
    };
  }, []);

  const geoVisits = useMemo<GeoVisit[]>(() => {
    const recorded = getRecordedVisits(visits);
    const list: GeoVisit[] = [];
    recorded.forEach((visit) => {
      const coords = getVisitCoordinates(visit);
      if (coords) {
        list.push({
          visit,
          orderNumber: String(visit.id).padStart(2, '0'),
          lat: coords.lat,
          lng: coords.lng,
        });
      }
    });
    return list;
  }, [visits]);

  const totalSlots = visits.length || VISITS_PER_DAY;
  const externalRouteUrl = useMemo(
    () => buildGoogleMapsRouteUrl(geoVisits.map((g) => ({ lat: g.lat, lng: g.lng }))),
    [geoVisits]
  );

  const straightKm = useMemo(() => calculateStraightDistanceKm(geoVisits), [geoVisits]);
  const canRenderGoogleMap =
    Boolean(apiKey) && isOnline && !quotaBlocked && !mapLoadFailed && !preferOfflineView;

  return (
    <section className="bg-white rounded-2xl p-5 sm:p-6 border border-slate-200 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-brand-cyan flex items-center gap-1.5">
            <Navigation className="w-3.5 h-3.5" />
            <span>Mapeamento &amp; Trajectória · {formatDatePT(activeDateISO)}</span>
          </p>
          <h3 className="text-lg font-extrabold text-brand-900 mt-0.5">
            Rota Sequencial das Visitas no Terreno
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {Boolean(apiKey) && isOnline && !quotaBlocked && !mapLoadFailed && (
            <button
              type="button"
              onClick={() => setPreferOfflineView((prev) => !prev)}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-brand-surface hover:bg-sky-100 text-brand-900 border border-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition"
            >
              <Layers className="w-3.5 h-3.5 text-brand-cyan" />
              <span>{preferOfflineView ? 'Usar Google Maps' : 'Vista Esquemática'}</span>
            </button>
          )}

          {externalRouteUrl && (
            <a
              href={externalRouteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-brand-900 hover:bg-brand-800 text-white text-xs font-bold inline-flex items-center gap-1.5 transition whitespace-nowrap"
            >
              <ExternalLink className="w-3.5 h-3.5 text-brand-gold" />
              <span>Abrir Trajectória no Google Maps</span>
            </a>
          )}
        </div>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <div className="rounded-xl bg-brand-surface border border-slate-200 px-3.5 py-2.5">
          <span className="block text-[11px] font-semibold text-slate-500">
            Visitas com Localização
          </span>
          <span className="text-base font-extrabold text-brand-900 font-mono tabular-nums">
            {geoVisits.length}/{totalSlots}
          </span>
        </div>

        <div className="rounded-xl bg-brand-surface border border-slate-200 px-3.5 py-2.5">
          <span className="block text-[11px] font-semibold text-slate-500">
            Distância da Trajectória
          </span>
          <span className="text-base font-extrabold text-brand-900 font-mono tabular-nums">
            {geoVisits.length >= 2
              ? `${(canRenderGoogleMap ? routeStats.distanceKm : straightKm).toFixed(1)} km`
              : '---'}
          </span>
        </div>

        <div className="col-span-2 sm:col-span-1 rounded-xl bg-brand-surface border border-slate-200 px-3.5 py-2.5">
          <span className="block text-[11px] font-semibold text-slate-500">Modo do Mapa</span>
          <span className="text-xs font-bold text-brand-cyan inline-flex items-center gap-1 mt-0.5">
            <Compass className="w-3.5 h-3.5" />
            {canRenderGoogleMap
              ? routeStats.source === 'roads' && routeStats.durationMinutes
                ? `Google Maps (${routeStats.durationMinutes} min)`
                : 'Google Maps Interactivo'
              : 'Vista Esquemática Local'}
          </span>
        </div>
      </div>

      {geoVisits.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-brand-surface p-8 text-center space-y-2.5">
          <MapPin className="w-9 h-9 text-slate-400 mx-auto" />
          <p className="text-sm font-bold text-brand-900">
            Nenhuma visita deste dia tem coordenadas registadas.
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Abra uma visita e clique em «Obter localização actual» (GPS) ou cole um link/coordenadas
            do Google Maps para visualizar os marcadores numerados e a trajectória.
          </p>
        </div>
      ) : (
        <>
          <div className="h-[360px] sm:h-[420px] w-full rounded-2xl overflow-hidden border border-slate-200 bg-brand-surface">
            {canRenderGoogleMap ? (
              <APIProvider
                apiKey={apiKey}
                language="pt"
                region="MZ"
                libraries={['marker', 'routes', 'maps']}
              >
                <GoogleRouteMapInner
                  geoVisits={geoVisits}
                  selectedVisitId={selectedVisitId}
                  onSelectVisitId={setSelectedVisitId}
                  onOpenVisit={onOpenVisit}
                  onStatsUpdate={setRouteStats}
                  onLoadFailed={() => setMapLoadFailed(true)}
                />
              </APIProvider>
            ) : (
              <FallbackRouteCanvas
                geoVisits={geoVisits}
                selectedVisitId={selectedVisitId}
                onSelectVisitId={setSelectedVisitId}
                onOpenVisit={onOpenVisit}
              />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-brand-900">
              <RouteIcon className="w-3.5 h-3.5 text-brand-cyan" />
              <span>Ordem Sequencial da Rota</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {geoVisits.map((geo, idx) => {
                const isSelected = selectedVisitId === geo.visit.id;
                return (
                  <button
                    key={geo.visit.id}
                    type="button"
                    onClick={() => setSelectedVisitId(geo.visit.id)}
                    className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-left transition shrink-0 flex items-center gap-2 ${
                      isSelected
                        ? 'bg-brand-900 text-white border-brand-900'
                        : 'bg-brand-surface hover:bg-sky-50 text-brand-900 border-slate-200'
                    }`}
                  >
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[11px] font-extrabold tabular-nums ${
                        isSelected
                          ? 'bg-brand-gold text-brand-950'
                          : 'bg-brand-900 text-white'
                      }`}
                    >
                      {geo.orderNumber}
                    </span>
                    <span className="text-xs font-semibold max-w-[140px] truncate">
                      {geo.visit.company.trim() || `Visita ${geo.orderNumber}`}
                    </span>
                    {geo.visit.isLocked && (
                      <Lock
                        className={`w-3 h-3 shrink-0 ${
                          isSelected ? 'text-emerald-300' : 'text-emerald-600'
                        }`}
                      />
                    )}
                    {idx < geoVisits.length - 1 && (
                      <span
                        aria-hidden="true"
                        className={`text-xs ${isSelected ? 'text-sky-200' : 'text-slate-400'}`}
                      >
                        →
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
