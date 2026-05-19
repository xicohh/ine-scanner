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

    // 1. Inicializamos el SDK oficial de Google
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

    // 2. Preparamos los archivos estructurados como los pide el SDK
    const cleanFrente = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const contents = [
      promptTexto,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanFrente
        }
      }
    ];

    if (reversoBase64) {
      const cleanReverso = reversoBase64.replace(/^data:image\/\w+;base64,/, "");
      contents.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanReverso
        }
      });
    }

    // 3. Llamamos a Gemini usando el método oficial. 
    // Aquí el SDK valida internamente los parámetros y no fallará jamás por texto mal formateado.
    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: contents,
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    });

    // El SDK nos devuelve directamente el texto limpio en .text
    const responseText = response.text?.trim();

    if (!responseText) {
      throw new Error("Gemini no devolvió texto en la respuesta.");
    }

    // Parseo directo optimizado
    let resultadoFinal;
    try {
      resultadoFinal = JSON.parse(responseText);
    } catch (parseError) {
      // Safe fallback por si acaso incluye bloques de marcado ```json
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("La IA no devolvió un formato JSON válido.");
      resultadoFinal = JSON.parse(jsonMatch[0]);
    }

    return res.status(200).json(resultadoFinal);

  } catch (error) {
    console.error("Error en el manejador del escáner:", error);
    return res.status(500).json({ 
      error: 'Error interno en el escáner', 
      details: error.message 
    });
  }
}