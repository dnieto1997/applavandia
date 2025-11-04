/**
 * 📋 INFORME DE SUPERVISIÓN SIMPLIFICADO
 * Estructura idéntica al formulario de acta de inicio que funciona correctamente
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Image,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from './_layout';
import { subirFotoEvidencia, eliminarFotoEvidencia } from '../services/evidenciasService';
import SimpleSignaturePad from '../components/SimpleSignaturePad';
import { getSecureItem } from '../utils/secureStorage';
import { useLocation } from '@/contexts/LocationContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


const API_BASE = 'https://operaciones.lavianda.com.co/api';

const COLORS = {
  primary: '#1E3A8A',
  secondary: '#3B82F6',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  textPrimary: '#1F2937',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
};

// Áreas de inspección (igual estructura que acta de inicio)
const AREAS_INSPECCION = [
  'Uniforme y presentación personal',
  'Uso de elementos de protección',
  'Limpieza de áreas asignadas',
  'Organización del espacio',
  'Calidad del servicio',
  'Atención al cliente',
  'Manejo de productos e insumos',
  'Cumplimiento de horarios',
  'Uso adecuado de maquinaria',
];

interface AreaData {
  cumple: boolean;
  observaciones: string;
  fotos: string[];
}

interface InventarioItem {
  item: string;
  cantidad: string;
  estado: string;
}

interface FormData {
  cliente: string;
  direccion: string;
  ciudad: string;
  supervisor: string;
  fecha: string;
  areas: Record<string, AreaData>;
  inventario: InventarioItem[];
  observaciones_generales: string;
  firma_supervisor: string;
}

export default function FormularioSupervisionSimple() {
  const router = useRouter();
  
    const { user } = useAuth() as { user: any | null };
  const params = useLocalSearchParams();
  const signatureRef = useRef<any>(null);
  const { startTracking, startBackgroundTracking } = useLocation();
   const insets = useSafeAreaInsets();



  const [loading, setLoading] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    cliente: Array.isArray(params.empresaNombre) ? params.empresaNombre[0] : (params.empresaNombre || ''),
    direccion: '',
    ciudad: '',
    supervisor: user?.name || '',
    fecha: new Date().toISOString().split('T')[0],
    areas: AREAS_INSPECCION.reduce((acc, area) => ({
      ...acc,
      [area]: { cumple: false, observaciones: '', fotos: [] }
    }), {}),
    inventario: [
      { item: '', cantidad: '', estado: '' }
    ],
    observaciones_generales: '',
    firma_supervisor: '',
  });

  const [currentPhotoArea, setCurrentPhotoArea] = useState<string | null>(null);

  // Función para cambiar áreas (igual que handleAreaChange en acta)
  const handleAreaChange = (area: string, field: 'cumple' | 'observaciones', value: boolean | string) => {
    setFormData(prev => ({
      ...prev,
      areas: {
        ...prev.areas,
        [area]: {
          ...prev.areas[area],
          [field]: value
        }
      }
    }));
  };

  // Función para manejar fotos
  const agregarFoto = async (area: string) => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permisos', 'Se necesitan permisos de cámara');
        return;
      }

      Alert.alert(
        'Agregar Foto',
        'Selecciona una opción',
        [
          { text: 'Tomar foto', onPress: () => tomarFoto(area) },
          { text: 'Galería', onPress: () => seleccionarDeGaleria(area) },
          { text: 'Cancelar', style: 'cancel' }
        ]
      );
    } catch (error) {
      console.error('Error agregando foto:', error);
    }
  };

  const tomarFoto = async (area: string) => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        await procesarFoto(area, result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error tomando foto:', error);
    }
  };

  const seleccionarDeGaleria = async (area: string) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        quality: 0.7,
      });

      if (!result.canceled && result.assets[0]) {
        await procesarFoto(area, result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error seleccionando foto:', error);
    }
  };

  const procesarFoto = async (area: string, uri: string) => {
    try {
      setLoading(true);
   
      const token = user.token;
      console.log('Token obtenido para subir foto:', token);
      
      if (!token) {
        Alert.alert('Error', 'No se encontró token de autenticación');
        return;
      }

      const resultado = await subirFotoEvidencia(uri, user.token);
      const urlFoto = typeof resultado === 'string' ? resultado : resultado.url || resultado.ruta || '';
      
      if (!urlFoto) {
        Alert.alert('Error', 'No se pudo obtener la URL de la foto');
        return;
      }
      
      setFormData(prev => ({
        ...prev,
        areas: {
          ...prev.areas,
          [area]: {
            ...prev.areas[area],
            fotos: [...(prev.areas[area].fotos || []), urlFoto]
          }
        }
      }));

      Alert.alert('Éxito', 'Foto agregada correctamente');
    } catch (error) {
      console.error('Error procesando foto:', error);
      Alert.alert('Error', 'No se pudo subir la foto');
    } finally {
      setLoading(false);
    }
  };

  const eliminarFoto = async (area: string, url: string) => {
    try {
      const fileName = url.split('/').pop() || '';
      await eliminarFotoEvidencia(fileName, url);
      
      setFormData(prev => ({
        ...prev,
        areas: {
          ...prev.areas,
          [area]: {
            ...prev.areas[area],
            fotos: prev.areas[area].fotos.filter(f => f !== url)
          }
        }
      }));

      Alert.alert('Éxito', 'Foto eliminada');
    } catch (error) {
      console.error('Error eliminando foto:', error);
      Alert.alert('Error', 'No se pudo eliminar la foto');
    }
  };

  // Manejo de inventario
  const agregarItemInventario = () => {
    setFormData(prev => ({
      ...prev,
      inventario: [...prev.inventario, { item: '', cantidad: '', estado: '' }]
    }));
  };

  const actualizarInventario = (index: number, field: keyof InventarioItem, value: string) => {
    setFormData(prev => ({
      ...prev,
      inventario: prev.inventario.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      )
    }));
  };

  const eliminarItemInventario = (index: number) => {
    if (formData.inventario.length > 1) {
      setFormData(prev => ({
        ...prev,
        inventario: prev.inventario.filter((_, i) => i !== index)
      }));
    }
  };

  // Validación
  const validarFormulario = (): boolean => {
    if (!formData.cliente.trim()) {
      Alert.alert('Error', 'Ingrese el nombre del cliente');
      return false;
    }
    if (!formData.direccion.trim()) {
      Alert.alert('Error', 'Ingrese la dirección');
      return false;
    }
    if (!formData.supervisor.trim()) {
      Alert.alert('Error', 'Ingrese el nombre del supervisor');
      return false;
    }
    if (signatureRef.current?.isEmpty()) {
      Alert.alert('Error', 'Debe firmar el documento');
      return false;
    }
    return true;
  };

  // Enviar formulario
 const enviarFormulario = async () => {
  if (!validarFormulario()) return;

  try {
    setGuardando(true);

    const signatureData = signatureRef.current?.toDataURL();
    if (!signatureData) {
      Alert.alert('Error', 'No se pudo capturar la firma');
      return;
    }

    const token = user.token
    if (!token) {
      Alert.alert('Error', 'No se encontró token de autenticación. Inicia sesión nuevamente.');
      router.replace('/login');
      return;
    }

    // 📍 --- TRACKING FORM_START ---
    try {
      console.log('🛰️ Iniciando tracking para form_start...');
      await startTracking(token, 'form_start');
      console.log('✅ Punto de form_start enviado correctamente.');

      const sessionId = `form_${Date.now()}`;
      await startBackgroundTracking(token, sessionId);
      console.log('🎯 Tracking en background iniciado para form_start');
    } catch (trackingError) {
      console.error('⚠️ Error durante el tracking del formulario:', trackingError);
    }

    // --- Preparar datos del formulario ---
    const areasInspeccionadas = Object.keys(formData.areas).map(area => ({
      area,
      cumple: formData.areas[area].cumple,
      observaciones: formData.areas[area].observaciones || '',
      fotos: formData.areas[area].fotos || []
    }));

    const payload = {
      registro_id: params.registroId,
      cliente: formData.cliente,
      direccion: formData.direccion,
      ciudad: formData.ciudad,
      supervisor: formData.supervisor,
      fecha_supervision: formData.fecha,
      areas_inspeccionadas: areasInspeccionadas,
      inventario: formData.inventario.filter(item => item.item.trim()),
      observaciones_generales: formData.observaciones_generales,
      firma_supervisor: signatureData,
    };

    console.log('📤 Enviando informe de supervisión...');

    const response = await axios.post(
      `${API_BASE}/formularios/supervision`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );


    Alert.alert(
      'Éxito',
      'Informe de supervisión guardado correctamente',
      [{ text: 'OK', onPress: () => router.back() }]
    );

  } catch (error) {
    console.log(error)
    console.error('❌ Error enviando formulario:', error);
    if (axios.isAxiosError(error)) {
      Alert.alert('Error', error.response?.data?.message || 'Error al guardar el informe');
    } else {
      Alert.alert('Error', 'No se pudo guardar el informe');
    }
  } finally {
    setGuardando(false);
  }
};

  return (
    <SafeAreaView  style={[
        styles.container,
        {
          paddingTop: Platform.OS === 'android' ? insets.top + 10 : insets.top,
          paddingBottom: insets.bottom,
        },
      ]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.surface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>INFORME DE SUPERVISIÓN</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* DATOS GENERALES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Datos Generales</Text>
          
          <View style={styles.field}>
            <Text style={styles.label}>Cliente / Empresa *</Text>
            <TextInput
              style={styles.input}
              value={formData.cliente}
              onChangeText={(text) => setFormData(prev => ({ ...prev, cliente: text }))}
              placeholder="Nombre del cliente"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Dirección *</Text>
            <TextInput
              style={styles.input}
              value={formData.direccion}
              onChangeText={(text) => setFormData(prev => ({ ...prev, direccion: text }))}
              placeholder="Dirección del servicio"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Ciudad</Text>
            <TextInput
              style={styles.input}
              value={formData.ciudad}
              onChangeText={(text) => setFormData(prev => ({ ...prev, ciudad: text }))}
              placeholder="Ciudad"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Supervisor *</Text>
            <TextInput
              style={styles.input}
              value={formData.supervisor}
              onChangeText={(text) => setFormData(prev => ({ ...prev, supervisor: text }))}
              placeholder="Nombre del supervisor"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Fecha de Supervisión *</Text>
            <TextInput
              style={styles.input}
              value={formData.fecha}
              onChangeText={(text) => setFormData(prev => ({ ...prev, fecha: text }))}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </View>

        {/* ÁREAS DE INSPECCIÓN */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✅ Áreas de Inspección</Text>
          
          {AREAS_INSPECCION.map(area => (
            <View key={area} style={styles.areaCard}>
              <View style={styles.areaHeader}>
                <Text style={styles.areaTitle}>{area}</Text>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    formData.areas[area]?.cumple && styles.toggleButtonActive
                  ]}
                  onPress={() => handleAreaChange(area, 'cumple', !formData.areas[area]?.cumple)}
                >
                  <Text style={[
                    styles.toggleButtonText,
                    formData.areas[area]?.cumple && styles.toggleButtonTextActive
                  ]}>
                    {formData.areas[area]?.cumple ? 'SÍ' : 'NO'}
                  </Text>
                </TouchableOpacity>
              </View>

              <TextInput
                style={styles.observacionesInput}
                value={formData.areas[area]?.observaciones || ''}
                onChangeText={(text) => handleAreaChange(area, 'observaciones', text)}
                placeholder="Observaciones (opcional)"
                placeholderTextColor={COLORS.textSecondary}
                multiline
                numberOfLines={2}
              />

              <TouchableOpacity
                style={styles.addPhotoButton}
                onPress={() => agregarFoto(area)}
              >
                <Ionicons name="camera" size={20} color={COLORS.primary} />
                <Text style={styles.addPhotoText}>Agregar Foto</Text>
              </TouchableOpacity>

              {formData.areas[area]?.fotos?.length > 0 && (
                <View style={styles.photosContainer}>
                  {formData.areas[area].fotos.map((foto, index) => (
                    <View key={index} style={styles.photoItem}>
                      <Image source={{ uri: foto }} style={styles.photoThumbnail} />
                      <TouchableOpacity
                        style={styles.deletePhotoButton}
                        onPress={() => eliminarFoto(area, foto)}
                      >
                        <Ionicons name="close-circle" size={24} color={COLORS.danger} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        {/* INVENTARIO */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📦 Inventario de Insumos/Maquinaria</Text>
          
          {formData.inventario.map((item, index) => (
            <View key={index} style={styles.inventarioItem}>
              <View style={styles.inventarioRow}>
                <TextInput
                  style={[styles.input, { flex: 2 }]}
                  value={item.item}
                  onChangeText={(text) => actualizarInventario(index, 'item', text)}
                  placeholder="Item"
                />
                <TextInput
                  style={[styles.input, { flex: 1, marginLeft: 8 }]}
                  value={item.cantidad}
                  onChangeText={(text) => actualizarInventario(index, 'cantidad', text)}
                  placeholder="Cant."
                  keyboardType="numeric"
                />
              </View>
              <TextInput
                style={styles.input}
                value={item.estado}
                onChangeText={(text) => actualizarInventario(index, 'estado', text)}
                placeholder="Estado"
              />
              {formData.inventario.length > 1 && (
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => eliminarItemInventario(index)}
                >
                  <Ionicons name="trash" size={20} color={COLORS.danger} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          <TouchableOpacity style={styles.addButton} onPress={agregarItemInventario}>
            <Ionicons name="add-circle" size={24} color={COLORS.primary} />
            <Text style={styles.addButtonText}>Agregar Item</Text>
          </TouchableOpacity>
        </View>

        {/* OBSERVACIONES GENERALES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 Observaciones Generales</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.observaciones_generales}
            onChangeText={(text) => setFormData(prev => ({ ...prev, observaciones_generales: text }))}
            placeholder="Observaciones generales del informe..."
            placeholderTextColor={COLORS.textSecondary}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* FIRMA */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>✍️ Firma del Supervisor</Text>
          <View style={styles.signatureContainer}>
            <SimpleSignaturePad
              ref={signatureRef}
            />
          </View>
        </View>

        {/* BOTÓN GUARDAR */}
        <TouchableOpacity
          style={[styles.submitButton, guardando && styles.submitButtonDisabled]}
          onPress={enviarFormulario}
          disabled={guardando}
        >
          {guardando ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <>
              <Ionicons name="save" size={24} color={COLORS.surface} />
              <Text style={styles.submitButtonText}>Guardar Informe</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.surface,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: COLORS.surface,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  areaCard: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  areaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  areaTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
    flex: 1,
  },
  toggleButton: {
    backgroundColor: COLORS.danger,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: COLORS.success,
  },
  toggleButtonText: {
    color: COLORS.surface,
    fontWeight: 'bold',
    fontSize: 14,
  },
  toggleButtonTextActive: {
    color: COLORS.surface,
  },
  observacionesInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: COLORS.surface,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  addPhotoText: {
    color: COLORS.primary,
    fontWeight: '600',
    marginLeft: 8,
  },
  photosContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 8,
  },
  photoItem: {
    position: 'relative',
  },
  photoThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  deletePhotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
  },
  inventarioItem: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: COLORS.background,
    borderRadius: 8,
  },
  inventarioRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  deleteButton: {
    alignSelf: 'flex-end',
    padding: 8,
    marginTop: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  addButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
    marginLeft: 8,
  },
  signatureContainer: {
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  submitButton: {
    backgroundColor: COLORS.success,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.textSecondary,
  },
  submitButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
