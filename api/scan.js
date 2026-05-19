const { Groq } = require("groq-sdk");

// Inicializamos el SDK de Groq usando la variable de entorno de Vercel
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

    const contenidoMensaje = [
      { 
        type: "text", 
        text: `Eres un sistema experto OCR automatizado para credenciales INE de México.
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
        }`
      },
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
      }
    ];

    if (reversoBase64 && reversoBase64.trim().length > 10) {
      contenidoMensaje.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${reversoBase64}` }
      });
    }

    // Llamada a la API de Groq usando el modelo Llama Vision
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: contenidoMensaje }],
      model: "llama-3.2-11b-vision-preview", 
      temperature: 0.1
    });

    let responseText = chatCompletion.choices[0].message.content.trim();
    console.log("Respuesta cruda de Groq:", responseText);

    // Filtro Antirrotura Avanzado: Extrae solo lo que esté entre las llaves { ... }
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("La IA no devolvió un formato JSON válido: " + responseText);
    }
    
    const cleanJsonText = jsonMatch[0];
    const parsedData = JSON.parse(cleanJsonText);
    
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Error crítico en el backend /api/scan:", error);
    return res.status(500).json({ error: "Error interno en el escáner: " + error.message });
  }
};