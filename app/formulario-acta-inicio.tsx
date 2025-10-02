import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
  SafeAreaView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from './_layout';
import { subirFotoEvidencia, eliminarFotoEvidencia, obtenerUrlFoto } from '../services/evidenciasService';

const COLORS = {
  primary: '#1E3A8A',        // Azul corporativo más elegante
  secondary: '#3B82F6',      // Azul secundario
  success: '#10B981',        // Verde moderno
  warning: '#F59E0B',        // Amarillo profesional
  danger: '#EF4444',         // Rojo moderno
  background: '#F8FAFC',     // Gris muy claro
  surface: '#FFFFFF',        // Blanco puro
  surfaceSecondary: '#F1F5F9', // Gris claro para alternancia
  textPrimary: '#1F2937',    // Gris oscuro
  textSecondary: '#6B7280',  // Gris medio
  border: '#E5E7EB',         // Gris claro para bordes
  borderDark: '#D1D5DB',     // Gris más oscuro para bordes
};

const API_BASE = 'https://operaciones.lavianda.com.co/api';

interface InventarioItem {
  maquinaria_equipo: string;
  cantidad: string;
  descripcion_estado: string;
}

interface FormularioData {
  // Datos generales (automáticos)
  consecutivo: string;
  empresa: string;
  nit_cedula: string;
  direccion: string;
  persona_encargada: string;
  correo: string;
  telefono: string;
  
  // Datos del formulario (fecha y horas automáticas)
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  
  // Datos áreas y condiciones
  areas: {
    [key: string]: {
      cumple: boolean;
      observaciones: string;
      fotos: {
        uri: string;      // URI local temporal
        url: string;      // URL del servidor
        ruta: string;     // Ruta en el servidor para eliminar
      }[];
    };
  };
  
  // Inventario
  inventario: InventarioItem[];
  
  // Observaciones generales
  observaciones_generales: string;
}

const AREAS_PREDEFINIDAS = [
  'CAFETERIA',
  'PARQUEADERO',
  'SOTANO',
  'ESCALERAS',
  'PISOS',
  'ASCENSORES',
  'ALFOMBRAS',
  'BAÑOS',
  'PAREDES Y COLUMNAS',
  'AREAS COMUNES',
  'EQUIPO DE OFICINA',
  'MUEBLES Y ENSERES',
  'CUARTO DE ALMACENAMIENTO DE INSUMOS',
  'RINCONES',
  'VIDRIOS INTERNOS',
  'VIDRIOS EXTERNOS',
  'VIDRIOS ALTOS',
  'CIELO RASO',
  'FACHADAS',
  'AVISOS',
];

export default function FormularioActaInicio() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const [saving, setSaving] = useState(false);
  
  // Variables de modo
  const modo = params?.modo as string || 'crear';
  const formularioId = params?.formularioId as string;
  const esVisualizacion = modo === 'ver';
  const esModoCrear = modo === 'crear';
  const esModoEditar = modo === 'editar';
  const puedeEditar = esModoCrear || esModoEditar;
  
  // Datos iniciales automáticos con áreas predefinidas
  const [formData, setFormData] = useState<FormularioData>({
    consecutivo: '',
    empresa: '',
    nit_cedula: '',
    direccion: '',
    persona_encargada: '',
    correo: '',
    telefono: '',
    fecha: new Date().toISOString().split('T')[0],
    hora_inicio: new Date().toTimeString().slice(0, 5),
    hora_fin: '',
    areas: AREAS_PREDEFINIDAS.reduce((acc, area) => ({
      ...acc,
      [area]: { cumple: false, observaciones: '', fotos: [] }
    }), {}),
    inventario: [
      { maquinaria_equipo: '', cantidad: '', descripcion_estado: '' }
    ],
    observaciones_generales: '',
  });

  // Función para obtener datos del registro y empresa
  const obtenerDatosEmpresa = async (registroId: string) => {
    console.log('🔍 Iniciando obtención de datos para registro:', registroId);
    
    try {
      // Primero intentar usar datos de params si están disponibles
      if (params?.empresa) {
        console.log('📋 Datos disponibles en params:', {
          empresa: params.empresa,
          nit: params.nit || 'No disponible'
        });
        
        setFormData(prev => ({
          ...prev,
          empresa: params.empresa as string,
          nit_cedula: params.nit as string || '',
        }));
        
        // Si no hay NIT en params, consultar API
        if (!params.nit) {
          console.log('🌐 NIT no disponible en params, consultando API...');
          await consultarDatosCompletos(registroId);
        }
        return;
      }

      // Si no hay datos en params, consultar API
      console.log('🌐 Datos no disponibles en params, consultando API...');
      await consultarDatosCompletos(registroId);
      
    } catch (error) {
      console.log('💥 Error general en obtenerDatosEmpresa:', error);
    }
  };

  // Función auxiliar para consultar datos completos de la API
  const consultarDatosCompletos = async (registroId: string) => {
    try {
      // Intentar obtener token del contexto de usuario PRIMERO
      let token = user?.token;
      console.log('🔑 Token del contexto:', token ? 'SÍ EXISTE' : 'NO EXISTE');
      
      // Si no hay token en el contexto, intentar AsyncStorage como fallback
      if (!token) {
        console.log('🔄 Intentando obtener token de AsyncStorage...');
        const storageToken = await AsyncStorage.getItem('authToken');
        token = storageToken || undefined;
        console.log('🔑 Token de AsyncStorage:', token ? 'SÍ EXISTE' : 'NO EXISTE');
      }
      
      if (token) {
        console.log('✅ Token válido encontrado, haciendo llamada a API...');
        try {
          const response = await axios.get(
            `${API_BASE}/registros-clientes/${registroId}`,
            {
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          );
          
          console.log('📦 Respuesta completa de la API:', response.data);
          
          if (response.data?.registro) {
            const registro = response.data.registro;
            console.log('📋 Datos del registro:', registro);
            
            // Verificar si hay información de empresa en el registro
            if (registro.empresa) {
              console.log('🏢 Datos de empresa encontrados:', registro.empresa);
              
              setFormData(prev => ({
                ...prev,
                empresa: registro.empresa.nombre || '',
                nit_cedula: registro.empresa.identificacion || '',
                direccion: registro.empresa.direccion || '',
                persona_encargada: registro.persona_encargada || '',
                correo: registro.correo || '',
                telefono: registro.telefono || '',
              }));
            } else {
              console.log('⚠️ No se encontraron datos de empresa en el registro');
              
              // Usar datos directos del registro si no hay empresa
              setFormData(prev => ({
                ...prev,
                empresa: registro.nombre_empresa || '',
                nit_cedula: registro.identificacion || '',
                direccion: registro.direccion || '',
                persona_encargada: registro.persona_encargada || '',
                correo: registro.correo || '',
                telefono: registro.telefono || '',
              }));
            }
          } else {
            console.log('❌ No se encontraron datos en la respuesta');
          }
          
        } catch (error) {
          console.log('❌ Error en llamada a API:', error);
          if (axios.isAxiosError(error)) {
            console.log('📊 Status:', error.response?.status);
            console.log('📋 Data:', error.response?.data);
          }
        }
      } else {
        console.log('❌ No se pudo obtener token válido');
      }
    } catch (error) {
      console.log('💥 Error en consultarDatosCompletos:', error);
    }
  };

  // Función para generar consecutivo automático
  const generarConsecutivo = async () => {
    try {
      const storageToken = await AsyncStorage.getItem('authToken');
      const token = storageToken || undefined;
      
      if (!token) {
        console.log('⚠️ No hay token, generando consecutivo local');
        generarConsecutivoLocal();
        return;
      }

      console.log('🔄 Solicitando consecutivo al servidor...');
      const response = await axios.get(`${API_BASE}/formularios-acta-inicio/siguiente-consecutivo`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('📋 Respuesta consecutivo:', response.data);

      if (response.data?.consecutivo) {
        console.log('✅ Consecutivo del servidor:', response.data.consecutivo);
        setFormData(prev => ({
          ...prev,
          consecutivo: response.data.consecutivo
        }));
      } else {
        console.log('⚠️ No se recibió consecutivo del servidor, generando local');
        generarConsecutivoLocal();
      }
    } catch (error) {
      console.log('❌ Error generando consecutivo del servidor:', error);
      generarConsecutivoLocal();
    }
  };

  // Función auxiliar para generar consecutivo local
  const generarConsecutivoLocal = () => {
    const fecha = new Date();
    const año = fecha.getFullYear();
    const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
    const dia = fecha.getDate().toString().padStart(2, '0');
    const numeroRandom = Math.floor(Math.random() * 9999) + 1; // 1-9999
    const consecutivo = `${año}${mes}${dia}${numeroRandom.toString().padStart(4, '0')}`;
    
    console.log('🔢 Consecutivo local generado:', consecutivo);
    
    setFormData(prev => ({
      ...prev,
      consecutivo: consecutivo
    }));
  };

  // Función para cargar formulario existente
  const cargarFormularioExistente = async (formularioId: string) => {
    console.log('📖 Cargando formulario existente con ID:', formularioId);
    
    try {
      // Intentar obtener token del contexto de usuario PRIMERO
      let token = user?.token;
      console.log('🔑 Token del contexto para cargar formulario:', token ? 'SÍ EXISTE' : 'NO EXISTE');
      
      // Si no hay token en el contexto, intentar AsyncStorage como fallback
      if (!token) {
        console.log('🔄 Intentando obtener token de AsyncStorage para cargar formulario...');
        const storageToken = await AsyncStorage.getItem('authToken');
        token = storageToken || undefined;
        console.log('🔑 Token de AsyncStorage para cargar formulario:', token ? 'SÍ EXISTE' : 'NO EXISTE');
      }
      
      if (token) {
        console.log('✅ Token válido encontrado, cargando formulario...');
        const response = await axios.get(
          `${API_BASE}/formularios-acta-inicio/${formularioId}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        console.log('📦 Formulario cargado desde servidor:', response.data);
        
        if (response.data?.data) {
          const formulario = response.data.data;
          console.log('📋 Datos del formulario:', formulario);
          
          // Cargar todos los datos del formulario
          setFormData({
            consecutivo: formulario.consecutivo || '',
            empresa: formulario.empresa || '',
            nit_cedula: formulario.nit_cedula || '',
            direccion: formulario.direccion || '',
            persona_encargada: formulario.persona_encargada || '',
            correo: formulario.correo || '',
            telefono: formulario.telefono || '',
            fecha: formulario.fecha || '',
            hora_inicio: formulario.hora_inicio || '',
            hora_fin: formulario.hora_fin || '',
            areas: formulario.areas || AREAS_PREDEFINIDAS.reduce((acc, area) => ({
              ...acc,
              [area]: { cumple: false, observaciones: '', fotos: [] }
            }), {}),
            inventario: formulario.inventario || [
              { maquinaria_equipo: '', cantidad: '', descripcion_estado: '' }
            ],
            observaciones_generales: formulario.observaciones_generales || '',
          });
          
          console.log('✅ Formulario cargado exitosamente');
        } else {
          console.log('❌ No se encontraron datos del formulario');
          Alert.alert('Error', 'No se pudo cargar el formulario');
        }
        
      } else {
        console.log('❌ No se pudo obtener token para cargar formulario');
        Alert.alert('Error', 'No se encontró token de autenticación');
      }
      
    } catch (error) {
      console.log('💥 Error cargando formulario:', error);
      if (axios.isAxiosError(error)) {
        console.log('📊 Status de error:', error.response?.status);
        console.log('📋 Datos de error:', error.response?.data);
      }
      Alert.alert('Error', 'No se pudo cargar el formulario');
    }
  };

  useEffect(() => {
    console.log('🚀 Iniciando formulario con parámetros:', params);
    
    const modo = params?.modo as string;
    const formularioId = params?.formularioId as string;
    
    if ((modo === 'ver' || modo === 'editar') && formularioId) {
      // Modo ver/editar: cargar formulario existente
      console.log(`👁️ Modo ${modo.toUpperCase()} - Cargando formulario existente`);
      cargarFormularioExistente(formularioId);
    } else {
      // Modo crear: configurar nuevo formulario
      console.log('➕ Modo CREAR - Configurando nuevo formulario');
      
      // Generar consecutivo automáticamente
      generarConsecutivo();
      
      // Cargar datos si viene de un registro específico
      if (params?.registroId) {
        console.log('🔍 Intentando obtener NIT y más datos del registro:', params.registroId);
        obtenerDatosEmpresa(params.registroId as string);
      }
      
      // Configurar hora de fin automáticamente (1 hora después de inicio)
      const horaInicio = new Date();
      const horaFin = new Date(horaInicio.getTime() + 60 * 60 * 1000); // +1 hora
      setFormData(prev => ({
        ...prev,
        hora_fin: horaFin.toTimeString().slice(0, 5)
      }));
    }
  }, [params?.registroId, params?.modo, params?.formularioId]);

  // Función para exportar a PDF
  const exportarPDF = async () => {
    if (!formData.consecutivo) {
      Alert.alert('Error', 'No se puede exportar un formulario sin datos');
      return;
    }

    try {
      console.log('📄 Iniciando exportación a PDF...');
      
      // Mostrar confirmación antes de exportar
      Alert.alert(
        'Exportar PDF',
        '¿Desea exportar el formulario a PDF?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Exportar',
            onPress: async () => {
              try {
                console.log('📋 Generando PDF del formulario consecutivo:', formData.consecutivo);
                
                // Crear el contenido HTML para el PDF
                const htmlContent = `
                  <!DOCTYPE html>
                  <html>
                  <head>
                    <meta charset="utf-8">
                    <title>Acta de Inicio - ${formData.consecutivo}</title>
                    <style>
                      body { font-family: Arial, sans-serif; margin: 20px; }
                      .header { text-align: center; margin-bottom: 30px; }
                      .title { font-size: 18px; font-weight: bold; margin-bottom: 10px; }
                      .field { margin-bottom: 15px; }
                      .label { font-weight: bold; color: #333; }
                      .value { margin-top: 5px; padding: 8px; background-color: #f5f5f5; border-radius: 4px; }
                      .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                      .table th, .table td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                      .table th { background-color: #f0f0f0; font-weight: bold; }
                      .section { margin: 30px 0; }
                      .section-title { font-size: 16px; font-weight: bold; color: #8B0000; margin-bottom: 15px; border-bottom: 2px solid #8B0000; padding-bottom: 5px; }
                    </style>
                  </head>
                  <body>
                    <div class="header">
                      <div class="title">ACTA DE INICIO DE OPERACIONES</div>
                      <div>Consecutivo: ${formData.consecutivo}</div>
                    </div>
                    
                    <div class="section">
                      <div class="section-title">INFORMACIÓN GENERAL</div>
                      <div class="field">
                        <div class="label">Empresa:</div>
                        <div class="value">${formData.empresa || 'No especificado'}</div>
                      </div>
                      <div class="field">
                        <div class="label">NIT/Cédula:</div>
                        <div class="value">${formData.nit_cedula || 'No especificado'}</div>
                      </div>
                      <div class="field">
                        <div class="label">Dirección:</div>
                        <div class="value">${formData.direccion || 'No especificado'}</div>
                      </div>
                      <div class="field">
                        <div class="label">Persona Encargada:</div>
                        <div class="value">${formData.persona_encargada || 'No especificado'}</div>
                      </div>
                      <div class="field">
                        <div class="label">Fecha:</div>
                        <div class="value">${formData.fecha || 'No especificado'}</div>
                      </div>
                    </div>

                    <div class="section">
                      <div class="section-title">VERIFICACIÓN DE ÁREAS</div>
                      <table class="table">
                        <thead>
                          <tr>
                            <th>Área</th>
                            <th>Cumple</th>
                            <th>Observaciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${Object.entries(formData.areas).map(([area, datos]) => `
                            <tr>
                              <td>${area}</td>
                              <td>${datos.cumple ? 'SÍ' : 'NO'}</td>
                              <td>${datos.observaciones || 'Sin observaciones'}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>

                    <div class="section">
                      <div class="section-title">INVENTARIO</div>
                      <table class="table">
                        <thead>
                          <tr>
                            <th>Maquinaria/Equipo</th>
                            <th>Cantidad</th>
                            <th>Descripción/Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${formData.inventario.map((item) => `
                            <tr>
                              <td>${item.maquinaria_equipo || 'No especificado'}</td>
                              <td>${item.cantidad || 'No especificado'}</td>
                              <td>${item.descripcion_estado || 'No especificado'}</td>
                            </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>

                    <div class="section">
                      <div class="section-title">OBSERVACIONES GENERALES</div>
                      <div class="value">${formData.observaciones_generales || 'Sin observaciones'}</div>
                    </div>
                  </body>
                  </html>
                `;

                // Generar el PDF
                const { uri } = await Print.printToFileAsync({
                  html: htmlContent,
                  base64: false
                });

                console.log('📁 PDF generado en:', uri);

                // Crear nombre de archivo único
                const fileName = `Acta_Inicio_${formData.consecutivo}_${new Date().getTime()}.pdf`;
                const newUri = `${Paths.document.uri}/${fileName}`;

                // Mover el archivo a la carpeta de documentos
                await FileSystem.moveAsync({
                  from: uri,
                  to: newUri
                });

                console.log('💾 PDF guardado en:', newUri);

                // Mostrar opciones al usuario
                Alert.alert(
                  'PDF Generado',
                  `PDF guardado como: ${fileName}\n\n¿Qué desea hacer?`,
                  [
                    { text: 'Solo Guardar', style: 'default' },
                    {
                      text: 'Compartir',
                      onPress: async () => {
                        if (await Sharing.isAvailableAsync()) {
                          await Sharing.shareAsync(newUri);
                        } else {
                          Alert.alert('Info', 'PDF guardado en la carpeta de documentos de la aplicación');
                        }
                      }
                    }
                  ]
                );

              } catch (error) {
                console.error('❌ Error en generación de PDF:', error);
                Alert.alert('Error', 'No se pudo generar el PDF: ' + (error as Error).message);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('❌ Error al exportar PDF:', error);
      Alert.alert('Error', 'No se pudo exportar el formulario a PDF');
    }
  };

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

  // Función para solicitar permisos de cámara
  const solicitarPermisosCamara = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permisos necesarios',
        'Se necesitan permisos de cámara para tomar fotos'
      );
      return false;
    }
    return true;
  };

  // Función para tomar foto
  const tomarFoto = async (area: string) => {
    try {
      const tienePermiso = await solicitarPermisosCamara();
      if (!tienePermiso) return;

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        await agregarFotoArea(area, uri);
      }
    } catch (error) {
      console.error('Error al tomar foto:', error);
      Alert.alert('Error', 'No se pudo tomar la foto');
    }
  };

  // Función para seleccionar foto de galería
  const seleccionarFotoGaleria = async (area: string) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permisos necesarios',
          'Se necesitan permisos para acceder a la galería'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        await agregarFotoArea(area, uri);
      }
    } catch (error) {
      console.error('Error al seleccionar foto:', error);
      Alert.alert('Error', 'No se pudo seleccionar la foto');
    }
  };

  // Función para agregar foto al área (ahora sube al servidor)
  const agregarFotoArea = async (area: string, uri: string) => {
    try {
      if (!user?.token) {
        Alert.alert('Error', 'No estás autenticado. Por favor inicia sesión.');
        return;
      }

      // Mostrar indicador de carga
      Alert.alert('Subiendo foto', 'Espera un momento...');

      // Subir foto al servidor
      const resultado = await subirFotoEvidencia(uri, user.token, area);

      if (resultado.success && resultado.url && resultado.ruta) {
        // Agregar foto al estado con la URL del servidor
        setFormData(prev => ({
          ...prev,
          areas: {
            ...prev.areas,
            [area]: {
              ...prev.areas[area],
              fotos: [
                ...(prev.areas[area]?.fotos || []),
                {
                  uri: uri,           // URI local temporal
                  url: resultado.url!, // URL del servidor
                  ruta: resultado.ruta! // Ruta para eliminar
                }
              ]
            }
          }
        }));

        Alert.alert('Éxito', 'Foto subida correctamente');
      } else {
        Alert.alert('Error', resultado.error || 'No se pudo subir la foto');
      }
    } catch (error) {
      console.error('Error al agregar foto:', error);
      Alert.alert('Error', 'No se pudo agregar la foto');
    }
  };

  // Función para eliminar foto (ahora elimina del servidor)
  const eliminarFoto = async (area: string, index: number) => {
    Alert.alert(
      'Eliminar foto',
      '¿Estás seguro de eliminar esta foto?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              if (!user?.token) {
                Alert.alert('Error', 'No estás autenticado.');
                return;
              }

              const foto = formData.areas[area].fotos[index];
              
              // Eliminar del servidor si tiene ruta
              if (foto.ruta) {
                const resultado = await eliminarFotoEvidencia(foto.ruta, user.token);
                if (!resultado.success) {
                  console.warn('No se pudo eliminar del servidor:', resultado.error);
                }
              }

              // Eliminar del estado local
              setFormData(prev => ({
                ...prev,
                areas: {
                  ...prev.areas,
                  [area]: {
                    ...prev.areas[area],
                    fotos: prev.areas[area].fotos.filter((_, i) => i !== index)
                  }
                }
              }));

              Alert.alert('Éxito', 'Foto eliminada correctamente');
            } catch (error) {
              console.error('Error al eliminar foto:', error);
              Alert.alert('Error', 'No se pudo eliminar la foto');
            }
          }
        }
      ]
    );
  };

  // Función para mostrar opciones de foto
  const mostrarOpcionesFoto = (area: string) => {
    Alert.alert(
      'Agregar foto',
      'Selecciona una opción',
      [
        {
          text: 'Tomar foto',
          onPress: () => tomarFoto(area)
        },
        {
          text: 'Seleccionar de galería',
          onPress: () => seleccionarFotoGaleria(area)
        },
        {
          text: 'Cancelar',
          style: 'cancel'
        }
      ]
    );
  };

  const handleInventarioChange = (index: number, field: keyof InventarioItem, value: string) => {
    setFormData(prev => ({
      ...prev,
      inventario: prev.inventario.map((item, i) => 
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const agregarItemInventario = () => {
    setFormData(prev => ({
      ...prev,
      inventario: [...prev.inventario, { maquinaria_equipo: '', cantidad: '', descripcion_estado: '' }]
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

  const handleSubmit = async () => {
    console.log('� === INICIO HANDLESUBMIT ===');
    console.log('�💾 Iniciando proceso de guardado...');
    console.log('📱 Estado actual del formulario:', formData);
    
    setSaving(true);
    
    try {
      console.log('🔍 Paso 1: Verificando autenticación...');
      
      // Intentar obtener token del contexto primero
      let token = user?.token;
      console.log('🔑 Token del contexto:', token ? 'SÍ EXISTE' : 'NO EXISTE');
      
      // Si no hay token del contexto, intentar AsyncStorage
      if (!token) {
        console.log('🔄 Intentando obtener token de AsyncStorage...');
        const storageToken = await AsyncStorage.getItem('authToken');
        token = storageToken || undefined;
        console.log('🔑 Token de AsyncStorage:', token ? 'SÍ EXISTE' : 'NO EXISTE');
      }
      
      if (!token) {
        console.log('❌ No se encontró token válido');
        Alert.alert('Error', 'No se encontró token de autenticación');
        return;
      }

      console.log('🔍 Paso 2: Validando datos...');
      
      // Validaciones básicas
      if (!formData.empresa.trim()) {
        console.log('❌ Validación falló: empresa vacía');
        Alert.alert('Error', 'El campo empresa es obligatorio');
        return;
      }

      console.log('� Paso 3: Preparando datos para envío...');
      
      const dataToSend = {
        ...formData,
        registro_cliente_id: params?.registroId || null,
      };

      console.log('📋 Datos completos a enviar:', JSON.stringify(dataToSend, null, 2));
      console.log('🌐 URL del endpoint:', `${API_BASE}/formularios-acta-inicio`);
      console.log('🔑 Token a usar:', token.substring(0, 20) + '...');

      console.log('🔍 Paso 4: Enviando petición...');

      let response;
      
      // Decidir si crear (POST) o actualizar (PUT)
      if (modo === 'editar' && formularioId) {
        console.log('📝 Modo EDITAR: Actualizando formulario existente con ID:', formularioId);
        response = await axios.put(
          `${API_BASE}/formularios-acta-inicio/${formularioId}`,
          dataToSend,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000, // 10 segundos de timeout
          }
        );
      } else {
        console.log('✨ Modo CREAR: Creando nuevo formulario');
        response = await axios.post(
          `${API_BASE}/formularios-acta-inicio`,
          dataToSend,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000, // 10 segundos de timeout
          }
        );
      }

      console.log('✅ Respuesta del servidor exitosa:', response.status);
      console.log('📦 Datos de respuesta:', response.data);

      // Determinar el mensaje según el modo
      const mensaje = modo === 'editar' 
        ? 'Formulario de Acta de Inicio actualizado correctamente'
        : 'Formulario de Acta de Inicio creado correctamente';
      
      console.log('🎉 Mostrando mensaje de éxito:', mensaje);
      
      // Mostrar mensaje de éxito
      Alert.alert(
        'Éxito', 
        mensaje,
        [{ 
          text: 'OK', 
          onPress: () => {
            console.log('👈 Regresando a pantalla anterior...');
            router.back();
          }
        }]
      );

    } catch (error) {
      console.log('💥 === ERROR EN HANDLESUBMIT ===');
      console.log('❌ Error guardando formulario:', error);
      
      if (axios.isAxiosError(error)) {
        console.log('🌐 Es un error de Axios');
        console.log('📊 Status de error:', error.response?.status);
        console.log('📋 Datos de error:', JSON.stringify(error.response?.data, null, 2));
        console.log('🌐 URL:', error.config?.url);
        console.log('📝 Método:', error.config?.method);
        console.log('🔗 Headers enviados:', error.config?.headers);
        
        // Mostrar error específico del servidor
        const errorMessage = error.response?.data?.message || 
                           error.response?.data?.error || 
                           `Error del servidor (${error.response?.status})`;
        Alert.alert('Error', errorMessage);
      } else {
        if (error instanceof Error) {
          console.log('💥 Error no relacionado con Axios:', error.message);
        } else {
          console.log('💥 Error no relacionado con Axios:', error);
        }
        Alert.alert('Error', 'Error de conexión o configuración');
      }
    } finally {
      console.log('🏁 Finalizando handleSubmit...');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.surface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {esVisualizacion ? 'Ver Acta de Inicio' : 'Crear Acta de Inicio'}
        </Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Información General */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Información General</Text>
          
          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Consecutivo</Text>
              <TextInput
                style={[styles.input, styles.readOnlyInput]}
                value={formData.consecutivo}
                editable={false}
                placeholder="Generado automáticamente"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Fecha</Text>
              <TextInput
                style={[styles.input, styles.readOnlyInput]}
                value={formData.fecha}
                editable={false}
                placeholder="Fecha actual"
                placeholderTextColor={COLORS.textSecondary}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Empresa *</Text>
            <TextInput
              style={[styles.input, esVisualizacion && styles.readOnlyInput]}
              value={formData.empresa}
              onChangeText={esVisualizacion ? undefined : (text) => setFormData(prev => ({ ...prev, empresa: text }))}
              placeholder="Nombre de la empresa"
              placeholderTextColor={COLORS.textSecondary}
              editable={!esVisualizacion}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>NIT / Cédula</Text>
            <TextInput
              style={styles.input}
              value={formData.nit_cedula}
              onChangeText={(text) => setFormData(prev => ({ ...prev, nit_cedula: text }))}
              placeholder="Número de identificación"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dirección</Text>
            <TextInput
              style={styles.input}
              value={formData.direccion}
              onChangeText={(text) => setFormData(prev => ({ ...prev, direccion: text }))}
              placeholder="Dirección de la empresa"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Persona Encargada</Text>
            <TextInput
              style={styles.input}
              value={formData.persona_encargada}
              onChangeText={(text) => setFormData(prev => ({ ...prev, persona_encargada: text }))}
              placeholder="Nombre del encargado"
              placeholderTextColor={COLORS.textSecondary}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Correo</Text>
              <TextInput
                style={styles.input}
                value={formData.correo}
                onChangeText={(text) => setFormData(prev => ({ ...prev, correo: text }))}
                placeholder="correo@empresa.com"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="email-address"
              />
            </View>
            <View style={styles.halfInput}>
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={styles.input}
                value={formData.telefono}
                onChangeText={(text) => setFormData(prev => ({ ...prev, telefono: text }))}
                placeholder="300 123 4567"
                placeholderTextColor={COLORS.textSecondary}
                keyboardType="phone-pad"
              />
            </View>
          </View>
        </View>

        {/* Áreas y Condiciones */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DESCRIPCION DE LAS AREAS</Text>
          <Text style={styles.sectionSubtitle}>Marque las áreas que cumplen con las condiciones requeridas</Text>
          
          {AREAS_PREDEFINIDAS.map((area) => (
            <View key={area} style={styles.areaItem}>
              <View style={styles.areaHeader}>
                <Text style={styles.areaTitle}>{area}</Text>
                <View style={styles.toggleContainer}>
                  <TouchableOpacity
                    style={[
                      styles.toggleButton,
                      formData.areas[area]?.cumple 
                        ? [styles.toggleButtonActive, { backgroundColor: COLORS.success }]
                        : styles.toggleButtonInactive,
                      esVisualizacion && styles.disabledButton
                    ]}
                    onPress={esVisualizacion ? undefined : () => handleAreaChange(area, 'cumple', !formData.areas[area]?.cumple)}
                    disabled={esVisualizacion}
                  >
                    <Text style={[
                      styles.toggleButtonText,
                      formData.areas[area]?.cumple ? styles.toggleButtonTextActive : styles.toggleButtonTextInactive
                    ]}>
                      {formData.areas[area]?.cumple ? 'SÍ' : 'NO'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              
              <TextInput
                style={styles.observacionesInput}
                value={formData.areas[area]?.observaciones || ''}
                onChangeText={(text) => handleAreaChange(area, 'observaciones', text)}
                placeholder="Observaciones (opcional)"
                placeholderTextColor={COLORS.textSecondary}
                multiline
                numberOfLines={2}
                editable={!esVisualizacion}
              />

              {/* Botón para agregar fotos */}
              {!esVisualizacion && (
                <TouchableOpacity
                  style={styles.addPhotoButton}
                  onPress={() => mostrarOpcionesFoto(area)}
                >
                  <Ionicons name="camera" size={20} color={COLORS.primary} />
                  <Text style={styles.addPhotoButtonText}>Agregar foto evidencia</Text>
                </TouchableOpacity>
              )}

              {/* Mostrar fotos capturadas */}
              {formData.areas[area]?.fotos && formData.areas[area].fotos.length > 0 && (
                <View style={styles.fotosContainer}>
                  <Text style={styles.fotosLabel}>
                    📷 Fotos ({formData.areas[area].fotos.length})
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fotosScroll}>
                    {formData.areas[area].fotos.map((foto, index) => (
                      <View key={index} style={styles.fotoItem}>
                        <Image 
                          source={{ uri: foto.url || foto.uri }} 
                          style={styles.fotoPreview} 
                        />
                        {!esVisualizacion && (
                          <TouchableOpacity
                            style={styles.deleteFotoButton}
                            onPress={() => eliminarFoto(area, index)}
                          >
                            <Ionicons name="close-circle" size={24} color={COLORS.danger} />
                          </TouchableOpacity>
                        )}
                      </View>
                    ))}
                  </ScrollView>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Inventario de Maquinaria y Equipos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INVENTARIO DE MAQUINARIA Y/O EQUIPO</Text>
          {!esVisualizacion && (
            <View style={styles.addButtonContainer}>
              <TouchableOpacity onPress={agregarItemInventario} style={styles.addButton}>
                <Ionicons name="add-circle" size={20} color={COLORS.primary} />
                <Text style={styles.addButtonText}>Agregar</Text>
              </TouchableOpacity>
            </View>
          )}

          {formData.inventario.map((item, index) => (
            <View key={index} style={styles.inventarioItem}>
              <View style={styles.inventarioHeader}>
                <Text style={styles.inventarioTitle}>Item {index + 1}</Text>
                {formData.inventario.length > 1 && (
                  <TouchableOpacity
                    onPress={() => eliminarItemInventario(index)}
                    style={styles.deleteButton}
                  >
                    <Ionicons name="trash-outline" size={16} color={COLORS.danger} />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Maquinaria/Equipo</Text>
                <TextInput
                  style={styles.input}
                  value={item.maquinaria_equipo}
                  onChangeText={(text) => handleInventarioChange(index, 'maquinaria_equipo', text)}
                  placeholder="Nombre del equipo o maquinaria"
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>

              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <Text style={styles.label}>Cantidad</Text>
                  <TextInput
                    style={styles.input}
                    value={item.cantidad}
                    onChangeText={(text) => handleInventarioChange(index, 'cantidad', text)}
                    placeholder="0"
                    placeholderTextColor={COLORS.textSecondary}
                    keyboardType="numeric"
                  />
                </View>
                <View style={styles.halfInput}>
                  <Text style={styles.label}>Estado</Text>
                  <TextInput
                    style={styles.input}
                    value={item.descripcion_estado}
                    onChangeText={(text) => handleInventarioChange(index, 'descripcion_estado', text)}
                    placeholder="Bueno, Regular, Malo"
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>
              </View>
            </View>
          ))}
        </View>

        {/* Observaciones Generales */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 Observaciones Generales</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.observaciones_generales}
            onChangeText={(text) => setFormData(prev => ({ ...prev, observaciones_generales: text }))}
            placeholder="Observaciones generales del acta de inicio..."
            placeholderTextColor={COLORS.textSecondary}
            multiline
            numberOfLines={4}
          />
        </View>

        {/* Botones de acción */}
        {esVisualizacion ? (
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.actionButton, styles.exportButton]}
              onPress={exportarPDF}
            >
              <Ionicons name="document-outline" size={20} color={COLORS.surface} />
              <Text style={styles.actionButtonText}>Exportar PDF</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.actionButton, styles.editButton]}
              onPress={() => router.push({
                pathname: '/formulario-acta-inicio',
                params: { 
                  ...params,
                  modo: 'editar'
                }
              })}
            >
              <Ionicons name="create-outline" size={20} color={COLORS.surface} />
              <Text style={styles.actionButtonText}>Editar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={saving}
          >
            <Text style={styles.submitButtonText}>
              {saving ? 'Guardando...' : 'Guardar Acta de Inicio'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>
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
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.primary,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.surface,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: 16,
    flex: 1,
    marginRight: 10,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
  },
  readOnlyInput: {
    backgroundColor: COLORS.surfaceSecondary,
    color: COLORS.textSecondary,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  areaItem: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  areaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  areaTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: COLORS.textPrimary,
    flex: 1,
  },
  toggleContainer: {
    marginLeft: 12,
  },
  toggleButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  toggleButtonActive: {
    borderColor: COLORS.success,
  },
  toggleButtonInactive: {
    backgroundColor: COLORS.border,
    borderColor: COLORS.borderDark,
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  toggleButtonTextActive: {
    color: COLORS.surface,
  },
  toggleButtonTextInactive: {
    color: COLORS.textSecondary,
  },
  observacionesInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface,
    textAlignVertical: 'top',
  },
  addButtonContainer: {
    alignItems: 'flex-end',
    marginBottom: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    flexShrink: 0,
    minWidth: 100,
  },
  addButtonText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
  },
  inventarioItem: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  inventarioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  inventarioTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
  },
  deleteButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: COLORS.surface,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.textSecondary,
  },
  submitButtonText: {
    color: COLORS.surface,
    fontSize: 18,
    fontWeight: '600',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    gap: 8,
  },
  exportButton: {
    backgroundColor: COLORS.warning,
  },
  editButton: {
    backgroundColor: COLORS.primary,
  },
  actionButtonText: {
    color: COLORS.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
  bottomPadding: {
    height: 40,
  },
  // Estilos para fotos
  addPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addPhotoButtonText: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.primary,
  },
  fotosContainer: {
    marginTop: 12,
  },
  fotosLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  fotosScroll: {
    flexDirection: 'row',
  },
  fotoItem: {
    position: 'relative',
    marginRight: 12,
  },
  fotoPreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
    backgroundColor: COLORS.border,
  },
  deleteFotoButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
});
