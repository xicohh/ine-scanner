const Groq = require("groq-sdk");

// Inicializamos el SDK de Groq de forma segura
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async function handler(req, res) {
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
        text: `Eres un sistema experto OCR en extraer datos de credenciales INE de México. 
        Analiza las imágenes adjuntas (frente y/o reverso) y extrae la información real del documento.
        
        REGLAS STRICTAS:
        1. Convierte todo el texto a MAYÚSCULAS y quita acentos.
        2. "seccion" debe ser un número entero (ej: 2467). Si no es legible, pon 0.
        3. "sexo" debe ser "H" o "M".
        4. "fecha_nacimiento" debe estar en formato DD/MM/AAAA.
        5. "confianza_estimada" debe ser un número entero entre 0 y 100.

        Devuelve un objeto JSON con esta estructura exacta:
        {
          "apellido_paterno": "VALOR",
          "apellido_materno": "VALOR",
          "nombres": "VALOR",
          "curp": "VALOR",
          "clave_elector": "VALOR",
          "seccion": 0,
          "fecha_nacimiento": "VALOR",
          "sexo": "VALOR",
          "estado": "VALOR",
          "direccion": "VALOR",
          "confianza_estimada": 85
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

    // Forzamos el uso de json_object nativo en Groq para evitar errores de parseo
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: contenidoMensaje }],
      model: "llama-3.2-11b-vision-preview", 
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const responseText = chatCompletion.choices[0].message.content.trim();
    const parsedData = JSON.parse(responseText);
    
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Error crítico en el backend /api/scan:", error);
    return res.status(500).json({ error: "Fallo al procesar con Groq: " + error.message });
  }
};