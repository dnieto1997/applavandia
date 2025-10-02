import axios from 'axios';

const API_BASE = 'https://operaciones.lavianda.com.co/api';

/**
 * Servicio para manejar fotos de evidencia
 */

/**
 * Subir una foto de evidencia al servidor
 */
export const subirFotoEvidencia = async (
  uri: string,
  token: string,
  area?: string,
  formularioId?: number
): Promise<{ success: boolean; url?: string; ruta?: string; error?: string }> => {
  try {
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    // Crear FormData
    const formData = new FormData();
    
    // Agregar la foto
    const filename = uri.split('/').pop() || 'photo.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';
    
    formData.append('foto', {
      uri,
      name: filename,
      type,
    } as any);

    // Agregar metadatos opcionales
    if (area) {
      formData.append('area', area);
    }
    if (formularioId) {
      formData.append('formulario_id', formularioId.toString());
    }

    console.log('📤 Subiendo foto al servidor:', { uri, area, formularioId });

    // Hacer la petición
    const response = await axios.post(
      `${API_BASE}/evidencias/subir-foto`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        timeout: 30000, // 30 segundos
      }
    );

    console.log('✅ Foto subida exitosamente:', response.data);

    return {
      success: true,
      url: response.data.url,
      ruta: response.data.ruta,
    };
  } catch (error: any) {
    console.error('❌ Error al subir foto:', error);
    
    let errorMessage = 'Error al subir la foto';
    if (error.response) {
      errorMessage = error.response.data?.message || errorMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Eliminar una foto de evidencia del servidor
 */
export const eliminarFotoEvidencia = async (
  ruta: string,
  token: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    if (!token) {
      throw new Error('No hay token de autenticación');
    }

    console.log('🗑️ Eliminando foto del servidor:', ruta);

    const response = await axios.delete(
      `${API_BASE}/evidencias/eliminar-foto`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: { ruta },
      }
    );

    console.log('✅ Foto eliminada exitosamente');

    return {
      success: true,
    };
  } catch (error: any) {
    console.error('❌ Error al eliminar foto:', error);
    
    let errorMessage = 'Error al eliminar la foto';
    if (error.response) {
      errorMessage = error.response.data?.message || errorMessage;
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Obtener la URL completa de una foto
 */
export const obtenerUrlFoto = (ruta: string): string => {
  // Si ya es una URL completa, devolverla
  if (ruta.startsWith('http://') || ruta.startsWith('https://')) {
    return ruta;
  }
  
  // Construir URL completa
  return `https://operaciones.lavianda.com.co/storage/${ruta}`;
};
