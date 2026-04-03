import { useRef, useEffect, useMemo, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.heat';
import type { TreeGraph } from '@/graph/tree-graph.ts';
import type { ConfidenceTier } from '@/types/common.ts';
import type { PersonLocation, GeocodeBatchProgress } from '@/types/geocode.ts';
import { TIER_COLORS } from '@/types/tier-labels.ts';
import type { MapColorMode, MapLayerMode } from './TreeControls.tsx';
import type { TimeRange, PersonLocationWithEra } from './geo-map-data.ts';
import {
  buildPersonLocations, buildJourneyLine, collectUniquePlaceStrings,
  filterByTimeRange, computeYearBounds, buildHeatmapData, augmentWithEra,
  MAP_ERA_COLORS, MAP_ERA_LABELS,
} from './geo-map-data.ts';
import type { MapEra } from './geo-map-data.ts';
import { geocodeBatch, getMemoryCache } from '@/services/geocoder.ts';

export interface GeoMapViewHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fitToView: () => void;
  centerOnSelected: () => void;
}

interface GeoMapViewProps {
  graph: TreeGraph;
  rootPersonId: string;
  selectedPersonId: string | null;
  onSelectPerson: (personId: string) => void;
  visibleTiers: Set<ConfidenceTier>;
  showRejected: boolean;
  colorMode: MapColorMode;
  layerMode: MapLayerMode;
  timeRange: TimeRange | null;
  onYearBoundsComputed: (bounds: { minYear: number; maxYear: number } | null) => void;
}

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

function getMarkerShape(type: PersonLocation['locationType']): string {
  if (type === 'birth') return 'circle';
  if (type === 'death' || type === 'burial') return 'square';
  return 'diamond';
}

function createMarkerSvg(color: string, shape: string): string {
  const size = 12;
  let shapeEl: string;

  switch (shape) {
    case 'circle':
      shapeEl = `<circle cx="${size}" cy="${size}" r="${size - 2}" fill="${color}" fill-opacity="0.8" stroke="${color}" stroke-width="1.5"/>`;
      break;
    case 'square':
      shapeEl = `<rect x="2" y="2" width="${(size - 2) * 2}" height="${(size - 2) * 2}" fill="${color}" fill-opacity="0.8" stroke="${color}" stroke-width="1.5"/>`;
      break;
    default: // diamond
      shapeEl = `<polygon points="${size},2 ${size * 2 - 2},${size} ${size},${size * 2 - 2} 2,${size}" fill="${color}" fill-opacity="0.8" stroke="${color}" stroke-width="1.5"/>`;
      break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * 2}" height="${size * 2}" viewBox="0 0 ${size * 2} ${size * 2}">${shapeEl}</svg>`;
}

function createDivIcon(color: string, locationType: PersonLocation['locationType']): L.DivIcon {
  const shape = getMarkerShape(locationType);
  const svg = createMarkerSvg(color, shape);

  return L.divIcon({
    html: svg,
    className: 'geo-tier-marker',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

function formatPopup(loc: PersonLocationWithEra, colorMode: MapColorMode): string {
  const color = colorMode === 'era' ? MAP_ERA_COLORS[loc.era] : TIER_COLORS[loc.confidenceTier];
  const dateStr = loc.date?.raw || '';
  const typeLabel = loc.locationType.charAt(0).toUpperCase() + loc.locationType.slice(1);
  const extraLine = colorMode === 'era'
    ? `<div class="geo-popup-era" style="color:${MAP_ERA_COLORS[loc.era]}">${MAP_ERA_LABELS[loc.era]}</div>`
    : '';

  return `
    <div class="geo-popup">
      <div class="geo-popup-name">${loc.personName}</div>
      <div class="geo-popup-detail">
        <span class="geo-popup-type" style="color:${color}">${typeLabel}</span>
        ${dateStr ? `<span class="geo-popup-date">${dateStr}</span>` : ''}
      </div>
      <div class="geo-popup-place">${loc.placeRaw}</div>
      ${extraLine}
    </div>
  `;
}

export const GeoMapView = forwardRef<GeoMapViewHandle, GeoMapViewProps>(
  function GeoMapView(
    { graph, selectedPersonId, onSelectPerson, visibleTiers, showRejected, colorMode, layerMode, timeRange, onYearBoundsComputed },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<L.Map | null>(null);
    const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
    const heatLayerRef = useRef<L.HeatLayer | null>(null);
    const journeyLineRef = useRef<L.Polyline | null>(null);
    const markersMapRef = useRef<Map<string, L.Marker[]>>(new Map());
    const hasFittedRef = useRef(false);

    const [geocodeProgress, setGeocodeProgress] = useState<GeocodeBatchProgress | null>(null);
    const [geocodeComplete, setGeocodeComplete] = useState(false);
    const abortRef = useRef<AbortController | null>(null);

    // Imperative handle for zoom controls
    useImperativeHandle(ref, () => ({
      zoomIn: () => mapRef.current?.zoomIn(),
      zoomOut: () => mapRef.current?.zoomOut(),
      fitToView: () => fitBounds(),
      centerOnSelected: () => {
        if (selectedPersonId) centerOnPerson(selectedPersonId);
        else fitBounds();
      },
    }));

    const fitBounds = useCallback(() => {
      const map = mapRef.current;
      const cluster = clusterGroupRef.current;
      if (!map || !cluster) return;
      const bounds = cluster.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    }, []);

    const centerOnPerson = useCallback((personId: string) => {
      const map = mapRef.current;
      if (!map) return;
      const markers = markersMapRef.current.get(personId);
      if (markers && markers.length > 0) {
        const first = markers[0];
        map.setView(first.getLatLng(), Math.max(map.getZoom(), 6));
      }
    }, []);

    // Initialize Leaflet map
    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [30, 0],
        zoom: 2,
        zoomControl: false,
        attributionControl: true,
      });

      L.tileLayer(TILE_URL, {
        attribution: TILE_ATTRIBUTION,
        maxZoom: 18,
      }).addTo(map);

      mapRef.current = map;

      return () => {
        map.remove();
        mapRef.current = null;
      };
    }, []);

    // Trigger geocoding on first mount
    useEffect(() => {
      if (geocodeComplete) return;

      const placeStrings = collectUniquePlaceStrings(graph);
      if (placeStrings.length === 0) {
        setGeocodeComplete(true);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      geocodeBatch(placeStrings, setGeocodeProgress, controller.signal)
        .then(() => setGeocodeComplete(true))
        .catch(() => setGeocodeComplete(true));

      return () => {
        controller.abort();
      };
    }, [graph, geocodeComplete]);

    // Build all locations from cache (tier/rejected filtered)
    const allLocations = useMemo<PersonLocation[]>(() => {
      if (!geocodeComplete) return [];
      const cache = getMemoryCache();
      return buildPersonLocations(graph, cache, visibleTiers, showRejected);
    }, [graph, visibleTiers, showRejected, geocodeComplete]);

    // Report year bounds to parent
    const yearBounds = useMemo(() => computeYearBounds(allLocations), [allLocations]);
    useEffect(() => {
      onYearBoundsComputed(yearBounds);
    }, [yearBounds, onYearBoundsComputed]);

    // Apply time range filter
    const filteredLocations = useMemo(
      () => filterByTimeRange(allLocations, timeRange),
      [allLocations, timeRange],
    );

    // Augment with era
    const locationsWithEra = useMemo(
      () => augmentWithEra(filteredLocations),
      [filteredLocations],
    );

    // Update markers/heatmap when locations or mode change
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      // Clear old layers
      if (clusterGroupRef.current) {
        map.removeLayer(clusterGroupRef.current);
        clusterGroupRef.current = null;
      }
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }

      const markersByPerson = new Map<string, L.Marker[]>();

      if (layerMode === 'heatmap') {
        // Build heatmap layer
        const heatData = buildHeatmapData(filteredLocations);
        if (heatData.length > 0) {
          const heat = L.heatLayer(heatData, {
            radius: 25,
            blur: 15,
            maxZoom: 10,
            gradient: { 0.2: '#3b82f6', 0.4: '#8b5cf6', 0.6: '#f59e0b', 0.8: '#ef4444', 1.0: '#ffffff' },
          });
          heat.addTo(map);
          heatLayerRef.current = heat;
        }

        // Still build a hidden cluster for fitBounds + centerOnPerson lookup
        const cluster = L.markerClusterGroup({ maxClusterRadius: 40 });
        for (const loc of filteredLocations) {
          const marker = L.marker([loc.lat, loc.lng], { opacity: 0 });
          cluster.addLayer(marker);
          const existing = markersByPerson.get(loc.personId) ?? [];
          existing.push(marker);
          markersByPerson.set(loc.personId, existing);
        }
        map.addLayer(cluster);
        clusterGroupRef.current = cluster;
      } else {
        // Build clustered marker layer
        const cluster = L.markerClusterGroup({
          maxClusterRadius: 40,
          iconCreateFunction: (clstr) => {
            const count = clstr.getChildCount();
            let sizeClass = 'geo-marker-cluster-small';
            if (count >= 100) sizeClass = 'geo-marker-cluster-large';
            else if (count >= 10) sizeClass = 'geo-marker-cluster-medium';

            return L.divIcon({
              html: `<div><span>${count}</span></div>`,
              className: `geo-marker-cluster ${sizeClass}`,
              iconSize: L.point(40, 40),
            });
          },
        });

        for (const loc of locationsWithEra) {
          const color = colorMode === 'era' ? MAP_ERA_COLORS[loc.era] : TIER_COLORS[loc.confidenceTier];
          const icon = createDivIcon(color, loc.locationType);
          const marker = L.marker([loc.lat, loc.lng], { icon })
            .bindPopup(formatPopup(loc, colorMode), { className: 'geo-dark-popup' });

          marker.on('click', () => onSelectPerson(loc.personId));
          cluster.addLayer(marker);

          const existing = markersByPerson.get(loc.personId) ?? [];
          existing.push(marker);
          markersByPerson.set(loc.personId, existing);
        }

        map.addLayer(cluster);
        clusterGroupRef.current = cluster;
      }

      markersMapRef.current = markersByPerson;

      // Fit bounds on first load only
      if (!hasFittedRef.current && filteredLocations.length > 0 && clusterGroupRef.current) {
        const bounds = clusterGroupRef.current.getBounds();
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [40, 40] });
          hasFittedRef.current = true;
        }
      }
    }, [locationsWithEra, filteredLocations, layerMode, colorMode, onSelectPerson]);

    // Journey line for selected person (uses filtered locations)
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      // Remove old journey line
      if (journeyLineRef.current) {
        map.removeLayer(journeyLineRef.current);
        journeyLineRef.current = null;
      }

      if (!selectedPersonId || filteredLocations.length === 0) return;

      const journey = buildJourneyLine(selectedPersonId, filteredLocations);
      if (journey.length < 2) return;

      const latlngs = journey.map(l => L.latLng(l.lat, l.lng));
      const polyline = L.polyline(latlngs, {
        color: '#c9a84c',
        weight: 2,
        opacity: 0.8,
        dashArray: '8, 6',
      });

      polyline.addTo(map);
      journeyLineRef.current = polyline;
    }, [selectedPersonId, filteredLocations]);

    const isGeocoding = geocodeProgress?.inProgress && !geocodeComplete;
    const progressPercent = geocodeProgress
      ? Math.round((geocodeProgress.completed / Math.max(geocodeProgress.total, 1)) * 100)
      : 0;

    return (
      <div className="relative w-full h-full">
        <div ref={containerRef} className="w-full h-full leaflet-container-dark" />

        {/* Geocoding progress overlay */}
        {isGeocoding && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-surface border border-border rounded-lg px-4 py-2 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="animate-spin w-4 h-4 border-2 border-gold border-t-transparent rounded-full" />
              <div className="text-sm text-text-primary">
                Geocoding places... {geocodeProgress!.completed}/{geocodeProgress!.total}
              </div>
              <div className="w-24 h-1.5 bg-bg rounded-full overflow-hidden">
                <div
                  className="h-full bg-gold rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            {geocodeProgress!.failed > 0 && (
              <div className="text-xs text-text-dim mt-1">
                {geocodeProgress!.failed} places could not be found
              </div>
            )}
          </div>
        )}

        {/* Dynamic Legend */}
        <div className="absolute bottom-8 right-4 z-[1000] bg-surface border border-border rounded-lg px-3 py-2 shadow-lg">
          {layerMode === 'heatmap' ? (
            <HeatmapLegend />
          ) : colorMode === 'era' ? (
            <EraLegend />
          ) : (
            <TierShapeLegend />
          )}
        </div>
      </div>
    );
  },
);

// ── Legend Components ──

function HeatmapLegend() {
  return (
    <>
      <div className="text-xs text-text-dim mb-1 font-medium">Density</div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">Low</span>
        <div
          className="w-20 h-3 rounded"
          style={{ background: 'linear-gradient(to right, #3b82f6, #8b5cf6, #f59e0b, #ef4444, #ffffff)' }}
        />
        <span className="text-xs text-text-secondary">High</span>
      </div>
    </>
  );
}

function EraLegend() {
  const eras: MapEra[] = ['medieval', 'early_modern', 'colonial', 'nineteenth', 'modern', 'unknown'];
  return (
    <>
      <div className="text-xs text-text-dim mb-1 font-medium">Era</div>
      <div className="flex flex-col gap-1 text-xs text-text-secondary">
        {eras.map(era => (
          <div key={era} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: MAP_ERA_COLORS[era] }} />
            {MAP_ERA_LABELS[era]}
          </div>
        ))}
      </div>
    </>
  );
}

function TierShapeLegend() {
  return (
    <>
      <div className="text-xs text-text-dim mb-1 font-medium">Markers</div>
      <div className="flex flex-col gap-1 text-xs text-text-secondary">
        <div className="flex items-center gap-2">
          <svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#9a8872" /></svg>
          Birth
        </div>
        <div className="flex items-center gap-2">
          <svg width="12" height="12"><rect x="1" y="1" width="10" height="10" fill="#9a8872" /></svg>
          Death/Burial
        </div>
        <div className="flex items-center gap-2">
          <svg width="12" height="12"><polygon points="6,1 11,6 6,11 1,6" fill="#9a8872" /></svg>
          Other
        </div>
      </div>
    </>
  );
}
