// --- START OF FILE app/(tabs)/_layout.tsx (Versión Limpia con Safe Area) ---

import { Tabs } from 'expo-router';
import React from 'react';
import { useAuth } from '../_layout';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();

  const userRole = user?.userData?.role;
  const isAdmin = userRole === 'admin' || userRole === 'root';
  const isEmployee = userRole === 'empleado';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#C62828',
        tabBarInactiveTintColor: '#757575',
        headerShown: false,
        // ✅ APLICAMOS LOS ESTILOS GLOBALMENTE AQUÍ
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 1,
          borderTopColor: '#e0e0e0',
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 5,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ 
          title: 'Inicio', 
          tabBarIcon: ({ color, size = 24 }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="profile"
        options={{ 
          title: 'Perfil', 
          tabBarIcon: ({ color, size = 24 }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="operaciones"
        options={{ 
          title: 'Operaciones',
          tabBarIcon: ({ color, size = 24 }) => (
            <Ionicons name="business-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="dashboard"
        options={{ 
          title: 'Dashboard',
          href: isAdmin ? '/dashboard' : null,
          tabBarIcon: ({ color, size = 24 }) => (
            <Ionicons name="analytics-outline" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="admin-map"
        options={{ 
          title: 'Mapa',
          href: isAdmin ? '/admin-map' : null,
          tabBarIcon: ({ color, size = 24 }) => (
            <Ionicons name="map-outline" size={size} color={color} />
          ),
        }}
      />
      
      <Tabs.Screen
        name="admin-users"
        options={{ 
          title: 'Usuarios',
          href: isAdmin ? '/admin-users' : null,
          tabBarIcon: ({ color, size = 24 }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />

      {/* Ocultar admin-map-new del menú de tabs */}
      <Tabs.Screen
        name="admin-map-new"
        options={{ 
          href: null, // Ocultar completamente del menú
        }}
      />
    </Tabs>
  );
}