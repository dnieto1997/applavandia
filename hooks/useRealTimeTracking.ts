import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { getEcho } from '../services/echo';

// --- TIPOS ---
interface UserLocation {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  timestamp: string;
  isOnline: boolean;
  lastActivity: string;
}

type LocationType = 'login' | 'tracking' | 'logout' | 'form_start' | 'form_end';

interface LocationPoint {
  latitude: number;
  longitude: number;
  timestamp: string;
  type: LocationType;
  formId?: number | null;
}

interface SessionRoute {
  id: string;
  userId: number;
  userName: string;
  startTime: string;
  endTime?: string;
  points: LocationPoint[];
  isActive: boolean;
  totalDistance: number;
}

interface FormMarker {
  id: number;
  latitude: number;
  longitude: number;
  consecutivo: string;
  empresa: string;
  timestamp: string;
  userName: string;
  type: 'form_start' | 'form_end';
}

interface TrackingDataResponse {
  success: boolean;
  data: LocationPoint[];
}

interface UseRealTimeTrackingReturn {
  userLocations: UserLocation[];
  sessionRoutes: SessionRoute[];
  formMarkers: FormMarker[];
  selectedUserRoute: LocationPoint[];
  loading: boolean;
  isConnected: boolean;
  refreshData: () => Promise<void>;
  connectWebSocket: () => Promise<void>;
  disconnectWebSocket: () => void;
  fetchUserLocationsByDate: (userId: number, date: string) => Promise<void>;
  fetchFormMarkers: (userId: number, date: string) => Promise<void>;
  startLiveTracking: (userId: number) => Promise<void>;
}

// --- CONFIG ---
const API_BASE = 'https://operaciones.lavianda.com.co/api';

export const useRealTimeTracking = (): UseRealTimeTrackingReturn => {
  const [userLocations, setUserLocations] = useState<UserLocation[]>([]);
  const [sessionRoutes, setSessionRoutes] = useState<SessionRoute[]>([]);
  const [formMarkers, setFormMarkers] = useState<FormMarker[]>([]);
  const [selectedUserRoute, setSelectedUserRoute] = useState<LocationPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  // --- TOKEN ---
  const initToken = useCallback(async () => {
    if (!token) {
      const storedToken = await AsyncStorage.getItem('authToken');
      setToken(storedToken);
    }
  }, [token]);

  // --- API CALLS ---
  const fetchActiveUsers = useCallback(async () => {
    await initToken();
    if (!token) return;

    try {
      const { data } = await axios.get(`${API_BASE}/admin/active-users-locations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data?.success) setUserLocations(data.users || []);
    } catch (err) {
      console.error('❌ fetchActiveUsers', err);
    }
  }, [token, initToken]);

  const fetchSessionRoutes = useCallback(async () => {
    await initToken();
    if (!token) return;

    try {
      const { data } = await axios.get(`${API_BASE}/admin/tracking/active-sessions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data?.success) setSessionRoutes(data.sessions || []);
    } catch (err) {
      console.error('❌ fetchSessionRoutes', err);
    }
  }, [token, initToken]);

  const fetchFormMarkers = useCallback(async (userId: number, date: string) => {
    await initToken();
    if (!token) return;

    try {
      const { data } = await axios.get(`${API_BASE}/admin/forms-locations?user_id=${userId}&date=${date}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (data?.success) setFormMarkers(data.forms || []);
    } catch (err) {
      console.error('❌ fetchFormMarkers', err);
    }
  }, [token, initToken]);

  const fetchUserLocationsByDate = useCallback(async (userId: number, date: string) => {
    await initToken();
    if (!token) return;

    try {
      const { data } = await axios.get<TrackingDataResponse>(
        `${API_BASE}/locations?user_id=${userId}&date=${date}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
       console.log(data)
      if (data?.success) {
       
        const points: LocationPoint[] = data.data.map(item => ({
          latitude: item.latitude,
          longitude: item.longitude,
          timestamp: item.timestamp,
          type: item.type,
          formId: item.formId ?? null,
        }));
        setSelectedUserRoute(points);
      } else {
        setSelectedUserRoute([]);
      }
    } catch (err) {
      console.error('❌ fetchUserLocationsByDate', err);
      setSelectedUserRoute([]);
    }
  }, [token, initToken]);

  const refreshData = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchActiveUsers(), fetchSessionRoutes()]);
    } finally {
      setLoading(false);
    }
  }, [fetchActiveUsers, fetchSessionRoutes]);

  // --- WEBSOCKET ---
  const connectWebSocket = useCallback(async () => {
    await initToken();
    if (!token) return;

    try {
      const echo = await getEcho();
      if (!echo) return;

      const trackingChannel = echo.channel('tracking');
      trackingChannel.listen('.location.updated', (data: any) => {
        setUserLocations(prev => {
          const idx = prev.findIndex(u => u.id === data.userId);
          const updatedUser: UserLocation = {
            id: data.userId,
            name: data.userName,
            latitude: data.latitude,
            longitude: data.longitude,
            accuracy: data.accuracy,
            speed: data.speed,
            heading: data.heading,
            timestamp: data.timestamp,
            isOnline: true,
            lastActivity: data.timestamp,
          };
          return idx >= 0
            ? prev.map(u => (u.id === data.userId ? updatedUser : u))
            : [...prev, updatedUser];
        });

        // --- actualizar ruta activa ---
        setSessionRoutes(prev => {
          let session = prev.find(s => s.userId === data.userId && s.isActive);
          if (!session) {
            session = {
              id: data.sessionId || `${data.userId}_${Date.now()}`,
              userId: data.userId,
              userName: data.userName,
              startTime: data.timestamp,
              points: [],
              isActive: true,
              totalDistance: 0,
            };
            prev.push(session);
          }
          session.points.push({
            latitude: data.latitude,
            longitude: data.longitude,
            timestamp: data.timestamp,
            type: 'tracking',
          });
          return [...prev];
        });
      });

      setIsConnected(true);
      console.log('✅ WebSocket conectado');
    } catch (err) {
      console.error('❌ connectWebSocket', err);
      setIsConnected(false);
    }
  }, [token, initToken]);

  const disconnectWebSocket = useCallback(async () => {
    try {
      const echo = await getEcho();
      echo?.leave('tracking');
      setIsConnected(false);
      console.log('📡 WebSocket desconectado');
    } catch (err) {
      console.error('❌ disconnectWebSocket', err);
    }
  }, []);

  const startLiveTracking = useCallback(async (userId: number) => {
    const echo = await getEcho();
    if (!echo) return;

    echo.leave(`user.${userId}`);
    const channel = echo.channel(`user.${userId}`);
    channel.listen('.location.updated', (data: any) => {
      const newPoint: LocationPoint = {
        latitude: data.latitude,
        longitude: data.longitude,
        timestamp: data.timestamp || new Date().toISOString(),
        type: 'tracking',
      };

      setSelectedUserRoute(prev => [...prev, newPoint]);

      setUserLocations(prev =>
        prev.map(u =>
          u.id === userId
            ? { ...u, latitude: data.latitude, longitude: data.longitude, lastActivity: newPoint.timestamp, isOnline: true }
            : u
        )
      );
    });
  }, []);

  // --- EFECTOS ---
useEffect(() => {
  const init = async () => {
    await refreshData();
    await connectWebSocket();
  };

  init();

  return () => {
    disconnectWebSocket();
  };
}, [refreshData, connectWebSocket, disconnectWebSocket]);

  return {
    userLocations,
    sessionRoutes,
    formMarkers,
    selectedUserRoute,
    loading,
    isConnected,
    refreshData,
    connectWebSocket,
    disconnectWebSocket,
    fetchUserLocationsByDate,
    fetchFormMarkers,
    startLiveTracking,
  };
};
