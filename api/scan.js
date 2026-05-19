import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { imageBase64, reversoBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No se recibió la imagen del frente' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Falta la variable de entorno GEMINI_API_KEY en el servidor' });
    }

    // Inicializamos el SDK oficial de Google Gen AI con tu llave
    const ai = new GoogleGenAI({ apiKey: apiKey });

    const promptTexto = `Eres un sistema experto OCR automatizado para credenciales INE de México.
    Analiza las imágenes adjuntas para extraer la información del documento.
    
    REGLAS DE ORO:
    1. Responde ÚNICAMENTE con el objeto JSON solicitado. No agregues introducciones, explicaciones ni bloques Markdown.
    2. Si un campo no es legible o no viene, devuélvelo como una cadena vacía "" (o 0 para la sección).
    3. Remueve acentos y convierte todo el texto a MAYÚSCULAS.

    Estructura exacta del JSON que debes devolver:
    {
      "apellido_paterno": "VALOR",
      "apellido_materno": "VALOR",
      "nombres": "VALOR",
      "curp": "VALOR",
      "clave_elector": "VALOR",
      "seccion": 0,
      "indice_confianza": 85
    }`;

    // Limpiamos los prefijos Base64 para enviar la cadena de bytes pura que espera el SDK
    const cleanFrente = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    // Configuramos el contenido inline de la imagen según las especificaciones del SDK
    const partesContenido = [
      promptTexto,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanFrente
        }
      }
    ];

    // Si se subió el reverso del INE, lo limpiamos y lo agregamos al análisis
    if (reversoBase64 && reversoBase64.trim().length > 10) {
      const cleanReverso = reversoBase64.replace(/^data:image\/\w+;base64,/, "");
      partesContenido.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanReverso
        }
      });
    }

    // Llamada oficial usando el método estructurado del SDK de Google
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: partesContenido,
      config: {
        temperature: 0.1,
        responseMimeType: "application/json" // Forzamos formato JSON nativo
      }
    });

    const responseText = response.text?.trim();
    console.log("Respuesta cruda de Gemini SDK:", responseText);

    if (!responseText) {
      throw new Error("Gemini no devolvió texto en la respuesta.");
    }

    // Filtro para aislar de forma segura el objeto JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("La IA no devolvió un formato JSON válido: " + responseText);
    }
    
    const parsedData = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Error crítico en el backend /api/scan:", error);
    return res.status(500).json({ error: "Error interno en el escáner: " + error.message });
  }
}