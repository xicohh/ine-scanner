export default async function handler(req, res) {
  // Asegurar que solo acepte peticiones POST
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

    // Limpieza estricta de metadatos Base64 para enviar solo la cadena de bytes pura
    const cleanFrente = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const contents = [
      {
        role: "user",
        parts: [
          { text: promptTexto },
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: cleanFrente
            }
          }
        ]
      }
    ];

    if (reversoBase64 && reversoBase64.trim().length > 10) {
      const cleanReverso = reversoBase64.replace(/^data:image\/\w+;base64,/, "");
      contents[0].parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanReverso
        }
      });
    }

    // Endpoint de producción v1 estable
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: contents,
        generationConfig: {
          temperature: 0.1,
          response_mime_type: "application/json" // <--- CORREGIDO AQUÍ (guion bajo para API nativa)
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google API v1 Error: ${errorText}`);
    }

    const resData = await response.json();
    const responseText = resData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!responseText) {
      throw new Error("Gemini no devolvió texto en la respuesta.");
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("La IA no devolvió un formato JSON válido.");
    }
    
    const parsedData = JSON.parse(jsonMatch[0]);
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Error en /api/scan:", error);
    return res.status(500).json({ error: "Error interno en el escáner: " + error.message });
  }
}