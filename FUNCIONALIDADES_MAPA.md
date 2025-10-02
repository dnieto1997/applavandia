# 🗺️ Documentación del Sistema de Mapas - Tracking de Empleados

## 📋 Índice
1. [Visión General](#visión-general)
2. [Arquitectura](#arquitectura)
3. [Funcionalidades Principales](#funcionalidades-principales)
4. [Componentes](#componentes)
5. [Flujo de Datos](#flujo-de-datos)
6. [Configuración](#configuración)

---

## 🎯 Visión General

El sistema de mapas permite a los **administradores** visualizar en tiempo real y de forma histórica los **recorridos de los empleados**, con información detallada sobre sesiones de tracking, formularios completados, distancias recorridas y más.

### Características Clave:
- ✅ **Visualización multiplataforma** (Web con Google Maps, Mobile con react-native-maps)
- ✅ **Tracking en tiempo real** con actualización cada 30 segundos
- ✅ **Sesiones de recorrido** con inicio/fin automático
- ✅ **Filtrado avanzado** por usuario, fecha y sesión
- ✅ **Estadísticas detalladas** (distancia, duración, formularios)
- ✅ **Exportación de rutas** a formato GPX
- ✅ **Compatible con Expo Go** (vista informativa)

---

## 🏗️ Arquitectura

### Componentes Principales:

```
app/(tabs)/admin-map.tsx          → Pantalla principal (lógica)
├── AdminMapWeb.tsx               → Mapa para web (Google Maps JS API)
└── AdminMapMobile.tsx            → Mapa para Android/iOS (react-native-maps)
```

### Flujo de Plataforma:

```
┌─────────────────┐
│  Platform.OS    │
└────────┬────────┘
         │
    ┌────┴────┐
    │   web?  │
    └────┬────┘
         │
    ┌────┴──────────────────┐
    │                       │
   YES                     NO
    │                       │
    v                       v
AdminMapWeb.tsx      AdminMapMobile.tsx
    │                       │
    │                  ┌────┴────┐
    │                  │ Expo Go?│
    │                  └────┬────┘
    │                       │
    │                  ┌────┴────────┐
    │                  │             │
    │                 YES           NO
    │                  │             │
    │                  v             v
    │          Vista Informativa   Mapa Nativo
    │          (no maps)         (react-native-maps)
    │                  │             │
    └──────────────────┴─────────────┘
                       │
                Renderiza Mapa
```

---

## 🎨 Funcionalidades Principales

### 1. **Visualización de Recorridos**

#### **Mapa Web (`AdminMapWeb.tsx`)**
```typescript
- Google Maps JavaScript API
- Marcadores circulares con colores por tipo
- Polilíneas para mostrar rutas
- Zoom dinámico basado en datos
- Centro automático en primera ubicación
```

**Características:**
- 🟢 **Verde**: Punto de login/inicio
- 🔴 **Rojo**: Punto de logout/fin
- 🔵 **Azul**: Puntos de tracking normales
- 📏 **Polilínea azul**: Ruta completa del recorrido

#### **Mapa Mobile (`AdminMapMobile.tsx`)**
```typescript
// Para builds nativos (APK/IPA)
- react-native-maps con Google Maps
- Marcadores tipo pin con colores
- Animaciones de rutas
- Seguimiento de ubicación del usuario

// Para Expo Go
- Vista informativa con:
  • Coordenadas centrales
  • Número de sesiones
  • Puntos de ubicación por sesión
  • Timestamps de inicio/fin
```

---

### 2. **Panel de Control Avanzado**

#### **Selector de Fecha**
```typescript
- Input de fecha (YYYY-MM-DD)
- Actualización automática de datos
- Vista histórica completa
```

#### **Filtrado de Usuarios**
```typescript
- Barra de búsqueda en tiempo real
- Botones horizontales por usuario
- Estadísticas por usuario:
  • Número de sesiones
  • Distancia total recorrida
  • Estado activo/inactivo
```

#### **Modos de Vista**
```typescript
1. "Todos" → Muestra todas las sesiones simultáneamente
2. "Individual" → Enfoca una sesión específica
3. "Comparar" → Compara múltiples sesiones (próximamente)
```

#### **Opciones de Visualización**
- **Animación de Ruta**: Reproduce el recorrido con animación
- **Destacar Formularios**: Marca puntos donde se completaron formularios

---

### 3. **Información de Sesiones de Tracking**

#### **Datos por Sesión:**
```typescript
interface TrackingSession {
  session_id: string;           // ID único de sesión
  user_id: number;              // ID del usuario
  user_name: string;            // Nombre del empleado
  start_time: string;           // Hora de inicio
  end_time?: string;            // Hora de fin (si terminó)
  points_count: number;         // Cantidad de puntos
  total_distance: number;       // Distancia en metros
  total_duration: number;       // Duración en segundos
  forms_completed: number;      // Formularios completados
  breaks_taken: number;         // Pausas tomadas
  status: 'active' | 'completed' | 'interrupted';
  tracking_date: string;        // Fecha del tracking
  locations: LocationPoint[];   // Array de ubicaciones
}
```

#### **Datos por Punto de Ubicación:**
```typescript
interface LocationPoint {
  latitude: number;             // Latitud GPS
  longitude: number;            // Longitud GPS
  type: string;                 // 'login', 'logout', 'tracking', etc.
  user_id?: number;
  user_name?: string;
  timestamp?: string;           // Marca de tiempo ISO
  session_id?: string;
  accuracy?: number;            // Precisión GPS en metros
  speed?: number;               // Velocidad en m/s
  heading?: number;             // Dirección en grados
  altitude?: number;            // Altitud en metros
  battery_level?: number;       // Nivel de batería %
  is_background?: boolean;      // Si se capturó en segundo plano
  form_id?: number;             // ID de formulario si aplica
  notes?: string;               // Notas adicionales
  distance_from_previous?: number; // Distancia desde punto anterior
}
```

---

### 4. **Lista de Sesiones**

#### **Tarjetas de Sesión:**
```typescript
Cada sesión muestra:
- 👤 Nombre del usuario
- 🕐 Hora inicio → Hora fin
- 📍 Número de puntos de tracking
- 📏 Distancia recorrida (km)
- ⏱️ Duración total
- 📄 Formularios completados
- ☕ Pausas tomadas
- 🔴/🟢 Estado (activa/completada)
```

#### **Acciones por Sesión:**
- **Ver en mapa**: Enfoca y centra la sesión
- **Exportar GPX**: Descarga archivo para GPS externos
- **Ver detalles**: Modal con información completa

---

### 5. **Actualización en Tiempo Real**

#### **Polling Automático:**
```typescript
- Refresco cada 30 segundos si fecha = HOY
- Se detiene automáticamente si cambias de pantalla
- Se reactiva al volver a la pantalla
- No hace polling en fechas históricas
```

#### **Botón de Refresco Manual:**
- Icono de refresh
- Fuerza actualización inmediata
- Muestra loader mientras carga

---

### 6. **Compatibilidad con Expo Go**

Cuando se ejecuta en **Expo Go** (sin build nativo):

```typescript
📱 Vista Informativa Incluye:
┌─────────────────────────────┐
│       🗺️ Icono de mapa      │
│  "Vista de Tracking"        │
│  "Mapas nativos no disp."   │
├─────────────────────────────┤
│  📍 Ubicación Central:      │
│     Lat: XX.XXXXXX          │
│     Lon: YY.YYYYYY          │
├─────────────────────────────┤
│  📊 Datos de Tracking:      │
│     • N sesión(es) activa(s)│
│                             │
│  Sesión 1: abc123...        │
│     • N puntos ubicación    │
│     • Inicio: HH:MM:SS      │
│     • Último: HH:MM:SS      │
├─────────────────────────────┤
│  💡 Para ver mapa real:     │
│     • Versión web ('w')     │
│     • O compilar APK        │
└─────────────────────────────┘
```

---

## 🔧 Configuración

### **Google Maps API Keys:**

#### Web (`AdminMapWeb.tsx`):
```typescript
const GOOGLE_MAPS_API_KEY = 'AIzaSyAVBHloPPrI1Vniwac7IKFmgNYQTpmvqY0';
```

#### Mobile/Android (`app.json`):
```json
{
  "android": {
    "config": {
      "googleMaps": {
        "apiKey": "AIzaSyBrbXX5PmDsDY2O6COmRmevJj1R1IC1L7E"
      }
    }
  }
}
```

#### iOS (`app.json`):
```json
{
  "ios": {
    "config": {
      "googleMapsApiKey": "AIzaSyBrbXX5PmDsDY2O6COmRmevJj1R1IC1L7E"
    }
  }
}
```

---

### **Endpoints del Backend:**

```typescript
// Obtener todas las sesiones
GET /api/locations/admin/sessions
Headers: Authorization: Bearer {token}
Params: 
  - date: YYYY-MM-DD
  - user_id: (opcional)
  - include_locations: true

// Exportar sesión a GPX
GET /api/tracking/sessions/{session_id}/export
Headers: Authorization: Bearer {token}
Params:
  - format: 'gpx' | 'kml' | 'geojson'
```

---

## 📊 Flujo de Datos

```
┌──────────────┐
│   Usuario    │
│ Administrador│
└──────┬───────┘
       │
       v
┌──────────────────┐
│  admin-map.tsx   │ ← Pantalla principal
│                  │
│ • useState       │
│ • useEffect      │
│ • useFocusEffect │
└──────┬───────────┘
       │
       v
┌──────────────────┐
│ fetchUserSessions│ ← Función principal de datos
│                  │
│ axios.get(...)   │
└──────┬───────────┘
       │
       v
┌────────────────────────────┐
│ Backend Laravel API        │
│ /locations/admin/sessions  │
└──────┬─────────────────────┘
       │
       v
┌──────────────────┐
│ Procesar Datos   │
│                  │
│ TrackingSession[]│
└──────┬───────────┘
       │
       v
┌──────────────────┐
│   Renderizar:    │
│                  │
│ • AdminMapWeb    │ (si Platform.OS === 'web')
│ • AdminMapMobile │ (si no web)
│   ├─ Expo Go?    │
│   │   └─ Vista Info
│   └─ Native Build
│       └─ react-native-maps
└──────────────────┘
```

---

## 🎯 Casos de Uso

### **1. Ver recorrido de un empleado específico hoy:**
```
1. Abrir pantalla "Mapa Admin"
2. La fecha ya es HOY por defecto
3. Click en botón del empleado deseado
4. Ver rutas en mapa en tiempo real
5. Se actualiza cada 30 segundos automáticamente
```

### **2. Revisar recorrido histórico:**
```
1. Click en icono de filtros (⚙️)
2. Cambiar fecha a día anterior
3. Seleccionar empleado
4. Ver todas sus sesiones de ese día
5. Click en sesión específica para detalles
```

### **3. Exportar ruta para análisis externo:**
```
1. Seleccionar sesión deseada
2. Click en "Exportar"
3. Seleccionar formato (GPX)
4. Descargar archivo
5. Abrir en Google Earth, GPS, etc.
```

### **4. Comparar recorridos (próximamente):**
```
1. Cambiar modo a "Comparar"
2. Seleccionar múltiples sesiones
3. Ver rutas sobrepuestas con diferentes colores
4. Analizar diferencias en recorridos
```

---

## 🐛 Resolución de Problemas

### **Mapa no carga en Android:**
```
✅ Verificar que app.json tenga la API key correcta
✅ Verificar que el dispositivo tenga Google Play Services
✅ Revisar permisos de ubicación en AndroidManifest.xml
```

### **Mapa en blanco en web:**
```
✅ Verificar que GOOGLE_MAPS_API_KEY sea válida
✅ Abrir consola del navegador para ver errores
✅ Verificar que API key tenga Maps JavaScript API habilitada
```

### **Expo Go no muestra mapas:**
```
✅ ESTO ES NORMAL - Expo Go no soporta react-native-maps
✅ Se muestra vista informativa con datos
✅ Para ver mapas: usar web (presionar 'w') o compilar APK
```

### **Actualización en tiempo real no funciona:**
```
✅ Verificar que la fecha sea HOY
✅ Confirmar que hay sesiones activas
✅ Revisar console.log para ver si polling está activo
✅ Verificar conexión a internet
```

---

## 📈 Estadísticas Disponibles

### **Por Usuario:**
- Total de sesiones en el día
- Distancia total recorrida (km)
- Tiempo total trabajado
- Formularios completados
- Promedio de puntos por sesión

### **Por Sesión:**
- Duración exacta
- Distancia recorrida
- Velocidad promedio
- Pausas tomadas
- Ubicaciones visitadas
- Precisión GPS promedio

---

## 🔮 Funcionalidades Futuras

### **En Desarrollo:**
- [ ] Modo comparación de rutas
- [ ] Alertas de geofencing (alertar si sale de zona)
- [ ] Heatmap de zonas más visitadas
- [ ] Reportes PDF automáticos
- [ ] Notificaciones push en tiempo real
- [ ] Compartir ubicación en vivo
- [ ] Integración con calendario
- [ ] Análisis de eficiencia de rutas

---

## 📚 Dependencias Principales

```json
{
  "react-native-maps": "1.20.1",
  "@react-google-maps/api": "^2.x",
  "expo-location": "~18.x",
  "expo-constants": "~17.x",
  "axios": "^1.x"
}
```

---

## 👨‍💻 Mantenimiento

### **Actualizar API Keys:**
1. Editar `AdminMapWeb.tsx` para web
2. Editar `app.json` para Android/iOS
3. Regenerar APK si es necesario

### **Agregar nuevos tipos de marcadores:**
1. Modificar `getMarkerColor()` en AdminMapWeb
2. Agregar case en switch para nuevo tipo
3. Actualizar backend para enviar nuevo tipo

### **Cambiar intervalo de polling:**
```typescript
// En admin-map.tsx, línea ~196
const intervalId = setInterval(() => {
  fetchUserSessions();
}, 30000); // ← Cambiar aquí (milisegundos)
```

---

## 📞 Soporte

Para dudas o problemas:
- Revisar logs en consola (`console.log`)
- Verificar respuestas del backend en Network tab
- Consultar documentación de react-native-maps
- Revisar Google Maps API console

---

**Última actualización:** 1 de octubre de 2025
**Versión:** 2.0
**Autor:** Sistema de Tracking La Vianda
