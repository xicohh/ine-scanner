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

    // Adaptamos el Prompt para que coincida exactamente con las IDs de tu index.html
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
      "indice_confianza": 95
    }`;

    const cleanFrente = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    
    // Construcción del payload nativo compatible con la API REST v1 de Google
    const contents = [
      {
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

    if (reversoBase64) {
      const cleanReverso = reversoBase64.replace(/^data:image\/\w+;base64,/, "");
      contents[0].parts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanReverso
        }
      });
    }

    // Endpoint nativo v1 estable
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
          responseMimeType: "application/json" // <-- Formato correcto validado por la API REST
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(400).json({ error: `Google API Error: ${errorText}` });
    }

    const resData = await response.json();
    const responseText = resData.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!responseText) {
      return res.status(500).json({ error: "Gemini no devolvió texto en la respuesta." });
    }

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: "La IA no devolvió un formato JSON válido." });
    }

    const resultadoFinal = JSON.parse(jsonMatch[0]);
    return res.status(200).json(resultadoFinal);

  } catch (error) {
    console.error("Error en el manejador del escáner:", error);
    return res.status(500).json({ 
      error: 'Error interno en el escáner', 
      details: error.message 
    });
  }
}