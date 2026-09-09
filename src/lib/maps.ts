import mapboxgl from 'mapbox-gl'
import * as turf from '@turf/turf'

export interface MapCoordinates {
  latitude: number
  longitude: number
}

export interface GeoFenceData {
  id: string
  name: string
  coordinates: MapCoordinates
  radius: number
  isActive: boolean
}

export interface VisitLocation {
  id: string
  name: string
  coordinates: MapCoordinates
  status: string
  assignee?: string
}

let mapInstance: mapboxgl.Map | null = null

export function initializeMap(container: HTMLElement, options: {
  center: MapCoordinates
  zoom: number
  style?: string
}): mapboxgl.Map {
  if (!process.env.NEXT_PUBLIC_MAPBOX_TOKEN) {
    throw new Error('Mapbox access token not configured')
  }

  mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

  mapInstance = new mapboxgl.Map({
    container,
    style: options.style || 'mapbox://styles/mapbox/dark-v11',
    center: [options.center.longitude, options.center.latitude],
    zoom: options.zoom,
  })

  return mapInstance
}

export function addMarker(
  map: mapboxgl.Map,
  coordinates: MapCoordinates,
  options: {
    color?: string
    popupContent?: string
    className?: string
  } = {}
) {
  const el = document.createElement('div')
  el.className = options.className || 'map-marker'
  el.style.backgroundColor = options.color || '#8b5cf6'
  el.style.width = '12px'
  el.style.height = '12px'
  el.style.borderRadius = '50%'
  el.style.border = '2px solid white'
  el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)'

  const marker = new mapboxgl.Marker(el)
    .setLngLat([coordinates.longitude, coordinates.latitude])
    .addTo(map)

  if (options.popupContent) {
    const popup = new mapboxgl.Popup({ offset: 25 }).setHTML(options.popupContent)
    marker.setPopup(popup)
  }

  return marker
}

export function addGeoFence(
  map: mapboxgl.Map,
  geofence: GeoFenceData,
  options: {
    fillColor?: string
    strokeColor?: string
    fillOpacity?: number
  } = {}
) {
  const circle = turf.circle(
    [geofence.coordinates.longitude, geofence.coordinates.latitude],
    geofence.radius / 1000,
    { steps: 64, units: 'kilometers' }
  )

  map.addSource(`geofence-${geofence.id}`, {
    type: 'geojson',
    data: circle,
  })

  map.addLayer({
    id: `geofence-fill-${geofence.id}`,
    type: 'fill',
    source: `geofence-${geofence.id}`,
    paint: {
      'fill-color': options.fillColor || '#8b5cf6',
      'fill-opacity': options.fillOpacity || 0.1,
    },
  })

  map.addLayer({
    id: `geofence-stroke-${geofence.id}`,
    type: 'line',
    source: `geofence-${geofence.id}`,
    paint: {
      'line-color': options.strokeColor || '#8b5cf6',
      'line-width': 2,
      'line-dasharray': [4, 4],
    },
  })
}

export function removeGeoFence(map: mapboxgl.Map, geofenceId: string) {
  if (map.getLayer(`geofence-fill-${geofenceId}`)) {
    map.removeLayer(`geofence-fill-${geofenceId}`)
  }
  if (map.getLayer(`geofence-stroke-${geofenceId}`)) {
    map.removeLayer(`geofence-stroke-${geofenceId}`)
  }
  if (map.getSource(`geofence-${geofenceId}`)) {
    map.removeSource(`geofence-${geofenceId}`)
  }
}

export function getMapInstance(): mapboxgl.Map | null {
  return mapInstance
}

export function destroyMap() {
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
  }
}
