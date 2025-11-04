// app/(tabs)/admin-map.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Platform,
  ActivityIndicator,
  Dimensions,
  TextInput,
  Animated as RNAnimated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRealTimeTracking } from '@/hooks/useRealTimeTracking';
import { useAuth } from '../_layout';
import axios from 'axios';
import { InfoWindow } from '@react-google-maps/api';


let MapView: any;
let Marker: any;
let Polyline: any;
let AnimatedMarker: any;

if (Platform.OS === 'web') {
  const {
    GoogleMap,
    Marker: GoogleMarker,
    Polyline: GooglePolyline,
    useJsApiLoader,
  } = require('@react-google-maps/api');

  MapView = ({ children, center, zoom = 14 }: any) => {
    const { isLoaded, loadError } = useJsApiLoader({
      googleMapsApiKey: 'AIzaSyDkvW0YqFTDRpRVZaUC9K2nemQbYswzVCs',
      libraries: ['places'],
    });

    if (loadError) return <div style={{ width: '100%', height: '100%' }}>Error loading maps</div>;
    if (!isLoaded) return <div style={{ width: '100%', height: '100%' }}>Loading map...</div>;

    return (
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={center}
        zoom={zoom}
        options={{ disableDefaultUI: false, zoomControl: true }}
      >
        {children}
      </GoogleMap>
    );
  };

  Marker = GoogleMarker;
  Polyline = GooglePolyline;
} else {
  const RNMaps = require('react-native-maps');
  MapView = RNMaps.default;
  Marker = RNMaps.Marker;
  Polyline = RNMaps.Polyline;
  AnimatedMarker = RNMaps.Animated?.Marker || RNMaps.Marker; // fallback
}

const { height } = Dimensions.get('window');

const defaultRegion = {
  latitude: 4.60971,
  longitude: -74.08175,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

export default function AdminMapRedirect() {
  const {
    userLocations,
    formMarkers,
    loading,
    isConnected,
    refreshData,
    connectWebSocket,
    disconnectWebSocket,
    fetchUserLocationsByDate,
    selectedUserRoute,
    fetchFormMarkers,
    startLiveTracking,
  } = useRealTimeTracking();

  const { user } = useAuth() as { user: any | null };

  const [viewMode, setViewMode] = useState<'all' | 'routes' | 'forms'>('all');
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [showDateModal, setShowDateModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const mapRef = useRef<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [isMapReady, setIsMapReady] = useState(false);
   const [selectedMarker, setSelectedMarker] = useState<any>(null);


  // Animated marker state for RN
  const markerCoord = useRef<any>(null); // will be AnimatedRegion when RN
  const lastKnownPoint = useRef<{ latitude: number; longitude: number } | null>(null);

  // Helper colors
  const getUserMarkerColor = (u: any) => {
    if (!u.isOnline) return '#808080';
    if (u.speed && u.speed > 5) return '#ff4444';
    if (u.speed && u.speed > 1) return '#ffaa00';
    return '#44ff44';
  };

  const getTrackingMarkerColor = (type: string) => {
    switch (type) {
      case 'login':
        return '#4CAF50';
      case 'logout':
        return '#F44336';
      default:
        return '#2196F3';
    }
  };

  // Center map on coordinates
  const centerMapOn = useCallback((lat: number, lng: number, zoom = 15) => {
    if (!mapRef.current) return;
    if (Platform.OS === 'web') {
      try {
        mapRef.current.panTo({ lat, lng });
        // setZoom exists on google maps map instance; our ref must be the GoogleMap instance
        typeof mapRef.current.setZoom === 'function' && mapRef.current.setZoom(zoom);
      } catch (e) {
        // no-op
      }
    } else {
      mapRef.current.animateToRegion(
        {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        800
      );
    }
  }, []);

  // === SEARCH USERS ===
  const fetchUsersBySearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) {
      setFilteredUsers([]);
      return;
    }
    setSearchLoading(true);
    try {
      const url = `https://operaciones.lavianda.com.co/api/admin/users/search?q=${encodeURIComponent(q)}`;
      const resp = await axios.get(url, {
        headers: { Authorization: `Bearer ${user?.token}`, Accept: 'application/json' },
        timeout: 15000,
      });
      
      if (resp.data?.success && Array.isArray(resp.data.data)) setFilteredUsers(resp.data.data);
      else setFilteredUsers([]);
    } catch (err) {
      console.error('fetchUsersBySearch', err);
      setFilteredUsers([]);
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, user]);
  

  // === SELECT USER ===
  const handleUserSelect = useCallback(
    async (userId: number) => {
      setSelectedUser(userId);
      setSelectedDate(new Date());
      // request live tracking channel for this user
      try {
        await startLiveTracking(userId);
      } catch (err) {
        console.error('startLiveTracking', err);
      }

      // fetch today's points immediately
      const today = new Date().toISOString().split('T')[0];
      await fetchUserLocationsByDate(userId, today);
      await fetchFormMarkers(userId, today);

      // center map on last-known point if any
      const lastPoint = selectedUserRoute[selectedUserRoute.length - 1];
      if (lastPoint) {
        centerMapOn(lastPoint.latitude, lastPoint.longitude, 16);
      } else {
        // fallback to userLocations current
        const u = userLocations.find(u => u.id === userId);
        if (u) centerMapOn(u.latitude, u.longitude, 16);
      }
    },
    [startLiveTracking, fetchUserLocationsByDate, fetchFormMarkers, userLocations, selectedUserRoute, centerMapOn]
  );

  // === AUTO CENTER WHEN ENTER MAP: pick first online user or previously selected ===
  useEffect(() => {
    if (!isMapReady || !mapRef.current || userLocations.length === 0) return;
    const useIdToCenter = selectedUser ?? userLocations[0]?.id;
    if (!useIdToCenter) return;

    const u = userLocations.find(x => x.id === useIdToCenter) || userLocations[0];
    if (!u) return;
    setSelectedUser(u.id);
    centerMapOn(u.latitude, u.longitude, 15);
  }, [isMapReady, userLocations, selectedUser, centerMapOn]);

  // === POLLING (backup + periodic refresh) ===
  useEffect(() => {
    if (!selectedUser) return;
    // only poll if selectedDate is today
    const selectedIsToday = selectedDate.toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
    if (!selectedIsToday) return;

    let mounted = true;
    const fetchLoop = async () => {
      try {
        if (!selectedUser) return;
        const date = new Date().toISOString().split('T')[0];
        await fetchUserLocationsByDate(selectedUser, date);
        await fetchFormMarkers(selectedUser, date);
      } catch (err) {
        console.error('polling fetchUserLocationsByDate', err);
      }
    };

    // initial
    fetchLoop();

    const interval = setInterval(() => {
      if (!mounted) return;
      fetchLoop();
    }, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [selectedUser, selectedDate, fetchUserLocationsByDate, fetchFormMarkers]);

  // === MOVE / ANIMATE MARKER WHEN selectedUserRoute changes ===
  useEffect(() => {
    // When selectedUserRoute updates, animate marker to last point (if today's route and map visible)
    if (!selectedUserRoute || selectedUserRoute.length === 0 || !selectedUser) return;

    const last = selectedUserRoute[selectedUserRoute.length - 1];
    if (!last) return;

    // Save last known
    lastKnownPoint.current = { latitude: Number(last.latitude), longitude: Number(last.longitude) };

    if (Platform.OS === 'web') {
      // pan the web map to last point
      try {
        centerMapOn(Number(last.latitude), Number(last.longitude), 16);
      } catch (e) {}
    } else {
      // mobile: animate AnimatedRegion if available
      try {
        if (!markerCoord.current) {
          // create AnimatedRegion initial
          const RNMaps = require('react-native-maps');
          const AnimatedRegion = RNMaps.AnimatedRegion || RNMaps.Region;
          markerCoord.current = new AnimatedRegion({
            latitude: Number(last.latitude),
            longitude: Number(last.longitude),
            latitudeDelta: 0,
            longitudeDelta: 0,
          });
        } else if (markerCoord.current && typeof markerCoord.current.timing === 'function') {
          // animate to new coordinate
          markerCoord.current.timing({
            latitude: Number(last.latitude),
            longitude: Number(last.longitude),
            duration: 800,
            useNativeDriver: false,
          }).start();
        } else {
          // fallback: no animation API present
        }
      } catch (e) {
        // fallback no-op
      }

      // center map on last
      if (mapRef.current) {
        centerMapOn(Number(last.latitude), Number(last.longitude), 16);
      }
    }
  }, [selectedUserRoute, selectedUser, centerMapOn]);

  // connect websocket once when component mounts
  useEffect(() => {
    (async () => {
      try {
        await refreshData();
        await connectWebSocket();
      } catch (e) {
        console.error('init map', e);
      }
    })();

    return () => {
      disconnectWebSocket();
    };
  }, [refreshData, connectWebSocket, disconnectWebSocket]);

  
const renderMap = () => {
 

  if (!MapView) {
    return (
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapPlaceholderText}>Mapa no disponible</Text>
      </View>
    );
  }

  // --- 🌐 WEB ---
  if (Platform.OS === 'web') {
    const googleAvailable = typeof window !== 'undefined' && (window as any).google;
    const [hoveredMarker, setHoveredMarker] = useState<any>(null);

    // Coordenadas de tracking
    const trackingCoords = selectedUserRoute
      .filter(p => (p.type?.toLowerCase?.() ?? '') === 'tracking')
      .map(p => ({ lat: Number(p.latitude), lng: Number(p.longitude) }));

    return (
      <MapView
        ref={mapRef}
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={{ lat: defaultRegion.latitude, lng: defaultRegion.longitude }}
        zoom={12}
        onLoad={() => setIsMapReady(true)}
      >
        {/* 🔹 Marcadores de todos los usuarios */}
        {(viewMode === 'all' || viewMode === 'routes') &&
          userLocations.map(u => (
            <Marker
              key={`user-${u.id}`}
              position={{ lat: u.latitude, lng: u.longitude }}
              onMouseOver={() => setHoveredMarker(u)}
              onMouseOut={() => setHoveredMarker(null)}
              icon={
                googleAvailable
                  ? {
                      path: (window as any).google.maps.SymbolPath.CIRCLE,
                      scale: 8,
                      fillColor: getUserMarkerColor(u),
                      fillOpacity: 0.9,
                      strokeWeight: 2,
                      strokeColor: '#fff',
                    }
                  : undefined
              }
            >
              {hoveredMarker && hoveredMarker.id === u.id && (
                <InfoWindow position={{ lat: u.latitude, lng: u.longitude }}>
                  <div style={{ minWidth: 140 }}>
                    <strong>{u.name}</strong>
                    <br />
                    Estado: {u.isOnline ? '🟢 Online' : '🔴 Offline'}
                    <br />
                    Velocidad: {u.speed?.toFixed?.(1) ?? 0} km/h
                  </div>
                </InfoWindow>
              )}
            </Marker>
          ))}

        {/* 🔹 Eventos y ruta del usuario seleccionado */}
        {(viewMode === 'all' || viewMode === 'routes') && selectedUserRoute.length > 0 && (
          <>
            {selectedUserRoute
              .filter(p => p.type === 'login' || p.type === 'logout')
              .map((p, i) => (
                <Marker
                  key={`event-${i}`}
                  position={{ lat: Number(p.latitude), lng: Number(p.longitude) }}
                  onClick={() => setSelectedMarker(p)}
                  title={p.type === 'login' ? 'Login' : 'Logout'}
                  icon={
                    googleAvailable
                      ? {
                          path: (window as any).google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                          scale: 6,
                          fillColor: getTrackingMarkerColor(p.type),
                          fillOpacity: 0.95,
                          strokeWeight: 1,
                          strokeColor: '#fff',
                        }
                      : undefined
                  }
                />
              ))}

            {trackingCoords.length > 1 && (
              <Polyline
                path={trackingCoords}
                options={{
                  strokeColor: '#0a84ff',
                  strokeOpacity: 0.9,
                  strokeWeight: 6,
                }}
              />
            )}
          </>
        )}

        {/* 🔹 Formularios (form_start) */}
        {(viewMode === 'forms' || viewMode === 'all') &&
          selectedUserRoute
            .filter(p => p.type === 'form_start')
            .map((p, i) => (
              <Marker
                key={`formstart-${i}`}
                position={{ lat: Number(p.latitude), lng: Number(p.longitude) }}
                onClick={() => setSelectedMarker(p)}
                title="Inicio Formulario"
              />
            ))}

        {/* 🪟 InfoWindow del marcador seleccionado */}
        {selectedMarker && (
          <InfoWindow
            position={{
              lat: Number(selectedMarker.latitude),
              lng: Number(selectedMarker.longitude),
            }}
            onCloseClick={() => setSelectedMarker(null)}
          >
            <div style={{ minWidth: 160 }}>
              <strong>{selectedMarker.type.toUpperCase()}</strong>
              <br />
              Fecha:{' '}
              {new Date(
                selectedMarker.timestamp ?? selectedMarker.created_at,
              ).toLocaleString()}
              <br />
             
            </div>
          </InfoWindow>
        )}
      </MapView>
    );
  }

  // --- 📱 MÓVIL (React Native Maps) ---
  const rnTrackingCoords = selectedUserRoute
    .filter(p => (p.type?.toLowerCase?.() ?? '') === 'tracking')
    .map(p => ({
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
    }));

  const lastPoint = selectedUserRoute[selectedUserRoute.length - 1];

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={defaultRegion}
        onMapReady={() => setIsMapReady(true)}
      >
        {/* 🔹 Usuarios */}
        {(viewMode === 'all' || viewMode === 'routes') &&
          userLocations.map(u => (
            <Marker
              key={`user-${u.id}`}
              coordinate={{
                latitude: Number(u.latitude),
                longitude: Number(u.longitude),
              }}
              title={u.name}
              description={`${u.isOnline ? 'Online' : 'Offline'} • ${
                u.speed?.toFixed?.(1) ?? 0
              } km/h`}
              pinColor={getUserMarkerColor(u)}
            />
          ))}

        {/* 🔹 Ruta animada */}
        {selectedUser && lastPoint && Platform.OS !== 'windows' && (
          <>
            {rnTrackingCoords.length > 1 && (
              <Polyline
                coordinates={rnTrackingCoords}
                strokeColor="#0a84ff"
                strokeWidth={6}
              />
            )}
            {markerCoord.current &&
            typeof markerCoord.current.timing === 'function' ? (
              <AnimatedMarker.Animated
                coordinate={markerCoord.current}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.animatedMarker}>
                  <Ionicons name="person" size={10} color="#fff" />
                </View>
              </AnimatedMarker.Animated>
            ) : (
              <Marker
                coordinate={{
                  latitude: Number(lastPoint.latitude),
                  longitude: Number(lastPoint.longitude),
                }}
                title="Última posición"
                pinColor="#0a84ff"
              />
            )}
          </>
        )}

        {/* 🔹 Eventos */}
        {(viewMode === 'all' || viewMode === 'routes') &&
          selectedUserRoute
            .filter(p => p.type === 'login' || p.type === 'logout')
            .map((p, i) => (
              <Marker
                key={`event-${i}`}
                coordinate={{
                  latitude: Number(p.latitude),
                  longitude: Number(p.longitude),
                }}
                title={p.type === 'login' ? 'Login' : 'Logout'}
                pinColor={getTrackingMarkerColor(p.type)}
                onPress={() => setSelectedMarker(p)}
              />
            ))}

        {/* 🔹 Formularios */}
        {(viewMode === 'forms' || viewMode === 'all') &&
          selectedUserRoute
            .filter(p => p.type === 'form_start')
            .map((p, i) => (
              <Marker
                key={`formstart-${i}`}
                coordinate={{
                  latitude: Number(p.latitude),
                  longitude: Number(p.longitude),
                }}
                onPress={() => setSelectedMarker(p)}
              >
                <View style={styles.formMarker}>
                  <Ionicons name="clipboard-outline" size={18} color="#007BFF" />
                </View>
              </Marker>
            ))}
      </MapView>

      {/* 🪟 Panel inferior con info del marcador (solo móvil) */}
      {selectedMarker && (
        <View style={styles.markerInfoBox}>
          <Text style={styles.markerInfoTitle}>
            {selectedMarker.type.toUpperCase()}
          </Text>
          <Text>
            📅{' '}
            {new Date(
              selectedMarker.timestamp ?? selectedMarker.created_at,
            ).toLocaleString()}
          </Text>
    
          <TouchableOpacity
            onPress={() => setSelectedMarker(null)}
            style={styles.closeInfoButton}
          >
            <Text style={{ color: '#fff' }}>Cerrar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};



  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mapa de Tracking</Text>
          <View style={styles.headerButtons}>
            <TouchableOpacity onPress={refreshData} style={styles.headerButton} disabled={loading}>
              <Ionicons name="refresh" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={[styles.connectionIndicator, isConnected && styles.connected]}>
              <Ionicons name={isConnected ? 'wifi' : 'wifi-outline'} size={14} color="#fff" />
            </View>
          </View>
        </View>

        {/* Controls */}
        <View style={styles.viewControls}>
          {['all', 'routes', 'forms'].map(mode => (
            <TouchableOpacity key={mode} style={[styles.viewButton, viewMode === mode && styles.viewButtonActive]} onPress={() => setViewMode(mode as any)}>
              <Text style={[styles.viewButtonText, viewMode === mode && styles.viewButtonTextActive]}>
                {mode === 'all' ? 'Todo' : mode === 'routes' ? 'Rutas' : 'Formularios'}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity onPress={() => setShowDateModal(true)} style={styles.dateButton}>
            <Text style={{ color: '#2196F3' }}>{selectedDate.toLocaleDateString()}</Text>
          </TouchableOpacity>
        </View>

        {/* Map */}
        <View style={styles.mapContainer}>
          {loading && userLocations.length === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2196F3" />
              <Text style={styles.loadingText}>Cargando datos...</Text>
            </View>
          ) : (
            renderMap()
          )}
        </View>

        {/* Date picker */}
        {showDateModal && (
          <DateTimePicker value={selectedDate} mode="date" display="default" onChange={(e, d) => {
            setShowDateModal(Platform.OS === 'ios');
            if (d) {
              setSelectedDate(d);
              // if there's a selectedUser and the date is not today, fetch historical points once
              if (selectedUser) {
                const formatted = d.toISOString().split('T')[0];
                fetchUserLocationsByDate(selectedUser, formatted);
                fetchFormMarkers(selectedUser, formatted);
              }
            }
          }} maximumDate={new Date()} />
        )}

        {/* Info / Search panel */}
        <ScrollView style={styles.infoPanel} refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshData} />}>
          <View style={styles.searchContainer}>
            <TextInput style={styles.searchInput} placeholder="Buscar usuario..." value={searchQuery} onChangeText={setSearchQuery} onSubmitEditing={fetchUsersBySearch} />
            <TouchableOpacity onPress={fetchUsersBySearch} style={styles.searchButton}>
              <Ionicons name="search" size={18} color="#fff" />
            </TouchableOpacity>
          </View>

          <Text style={styles.infoPanelTitle}>
            {searchQuery.trim() ? 'Resultados de búsqueda' : `Usuarios activos (${userLocations.filter(u => u.isOnline).length})`}
          </Text>

          {(searchQuery.trim() ? filteredUsers : userLocations.filter(u => u.isOnline)).map(u => (
            <View key={u.id} style={[styles.userItem, selectedUser === u.id && styles.userItemSelected]}>
              <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => handleUserSelect(u.id)}>
                <Text style={styles.userName}>{u.name}</Text>
                <Ionicons name="calendar-outline" size={18} color="#2196F3" style={{ marginLeft: 8 }} onPress={() => { setSelectedUser(u.id); setShowDateModal(true); }} />
              </TouchableOpacity>
              <Text style={styles.userStatus}>{u.isOnline ? 'Online' : 'Offline'}</Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

// === Styles ===
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f0f0f0' },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#f32121ff',
  },
  backButton: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerButton: { padding: 6 },
  connectionIndicator: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
  },
  connected: { backgroundColor: '#4CAF50' },
  viewControls: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, backgroundColor: '#fff', alignItems: 'center' },
  viewButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#eee' },
  viewButtonActive: { backgroundColor: '#2196F3' },
  viewButtonText: { fontSize: 14, color: '#555' },
  viewButtonTextActive: { color: '#fff', fontWeight: '700' },
  dateButton: { padding: 6, borderWidth: 1, borderColor: '#2196F3', borderRadius: 6 },
  mapContainer: { flex: 1 },
  map: { width: '100%', height: '100%' },
  mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ccc' },
  mapPlaceholderText: { fontSize: 16, fontWeight: 'bold' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 8, fontSize: 14, color: '#555' },
  infoPanel: { maxHeight: height * 0.34, backgroundColor: '#fff' },
  infoPanelTitle: { fontSize: 16, fontWeight: 'bold', padding: 8, backgroundColor: '#f9f9f9' },
  userItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
  userItemSelected: { backgroundColor: '#e3f2fd' },
  userName: { fontSize: 14 },
  userStatus: { fontSize: 12, color: '#555' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f2f2f2', padding: 8, margin: 8, borderRadius: 8 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 6 },
  searchButton: { marginLeft: 8, backgroundColor: '#007bff', padding: 10, borderRadius: 8 },
  animatedMarker: { backgroundColor: '#0a84ff', padding: 8, borderRadius: 50, borderWidth: 2, borderColor: '#fff' },
  formMarker: { backgroundColor: '#fff', padding: 6, borderRadius: 18, borderWidth: 1, borderColor: '#007BFF' },
  markerInfoBox: {
  position: 'absolute',
  bottom: 20,
  left: 20,
  right: 20,
  backgroundColor: 'white',
  borderRadius: 12,
  padding: 14,
  shadowColor: '#000',
  shadowOpacity: 0.2,
  shadowOffset: { width: 0, height: 2 },
  shadowRadius: 4,
  elevation: 5,
},
markerInfoTitle: {
  fontWeight: 'bold',
  fontSize: 16,
  marginBottom: 4,
},
closeInfoButton: {
  marginTop: 8,
  alignSelf: 'flex-end',
  backgroundColor: '#2196F3',
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 8,
},

});
