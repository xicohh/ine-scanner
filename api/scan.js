import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
  // Asegurar método POST
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
      return res.status(500).json({ error: 'Falta la variable de entorno GEMINI_API_KEY en Vercel' });
    }

    // Inicializamos el SDK oficial moderno
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
      "seccion": 1234,
      "estado_revision": "APROBADO/PENDIENTE",
      "confianza": 95
    }`;

    // --- PROCESAMIENTO DEL FRENTE ---
    // Extraemos el tipo MIME (ej. image/jpeg) de la cadena completa
    const matchFrente = imageBase64.match(/^data:(image\/\w+);base64,/);
    const mimeFrente = matchFrente ? matchFrente[1] : "image/jpeg";
    // Limpiamos el prefijo para dejarle a Gemini solo los bytes puros
    const cleanFrente = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const contents = [
      promptTexto,
      {
        inlineData: {
          mimeType: mimeFrente,
          data: cleanFrente
        }
      }
    ];

    // --- PROCESAMIENTO DEL REVERSO (SI EXISTE) ---
    if (reversoBase64) {
      const matchReverso = reversoBase64.match(/^data:(image\/\w+);base64,/);
      const mimeReverso = matchReverso ? matchReverso[1] : "image/jpeg";
      const cleanReverso = reversoBase64.replace(/^data:image\/\w+;base64,/, "");
      
      contents.push({
        inlineData: {
          mimeType: mimeReverso,
          data: cleanReverso
        }
      });
    }

    // Llamada al modelo con la sintaxis correcta del nuevo SDK
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: contents,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    });

    // CORRECCIÓN SDK: response.text es un string directo, no una función
    const responseText = response.text ? response.text.trim() : "";

    if (!responseText) {
      throw new Error("Gemini devolvió una respuesta vacía.");
    }

    // Intentar parsear el JSON de forma segura
    let resultadoFinal;
    try {
      resultadoFinal = JSON.parse(responseText);
    } catch (parseError) {
      // Fallback por si la IA llegó a meter triple comilla (```json ... ```)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("La IA no devolvió un formato JSON válido.");
      resultadoFinal = JSON.parse(jsonMatch[0]);
    }

    // Mapeo de compatibilidad para el índice de confianza que espera tu index.html
    if (resultadoFinal && resultadoFinal.confianza && !resultadoFinal.indice_confianza) {
      resultadoFinal.indice_confianza = resultadoFinal.confianza;
    }

    return res.status(200).json(resultadoFinal);

  } catch (error) {
    console.error("Error en el servidor:", error);
    return res.status(500).json({ 
      error: 'Error interno en el escáner', 
      details: error.message 
    });
  }
}