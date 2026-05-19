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

    // Estructuramos el prompt para Gemini
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

    // Configuramos los contenidos multimedia para la API de Gemini
    const contents = [
      {
        role: "user",
        parts: [
          { text: promptTexto },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64
            }
          }
        ]
      }
    ];

    // Si viene la imagen de atrás, la agregamos al arreglo de partes
    if (reversoBase64 && reversoBase64.trim().length > 10) {
      contents[0].parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: reversoBase64
        }
      });
    }

    // Llamada directa vía fetch a la API de Gemini (evita problemas de dependencias en Vercel)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json" // Obliga a Gemini a responder en JSON puro
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error: ${errorText}`);
    }

    const resData = await response.json();
    
    // Extraemos el texto de la respuesta de Gemini
    const responseText = resData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    console.log("Respuesta cruda de Gemini:", responseText);

    if (!responseText) {
      throw new Error("Gemini no devolvió texto en la respuesta.");
    }

    // Filtro de seguridad para aislar el objeto JSON
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