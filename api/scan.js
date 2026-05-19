const Groq = require("groq-sdk");

// Inicializamos el SDK de Groq de forma segura
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async function handler(req, res) {
  // Asegurar método POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { imageBase64, reversoBase64 } = req.body; 

    if (!imageBase64) {
      return res.status(400).json({ error: 'No se recibió la imagen del frente' });
    }

    // Configuración base del mensaje para Groq
    const contenidoMensaje = [
      { 
        type: "text", 
        text: `Eres un sistema experto en extraer datos de credenciales INE de México. 
        Analiza las imágenes adjuntas y devuelve los datos estrictamente en un formato JSON plano, sin explicaciones ni markdown.
        
        REGLAS:
        1. Convierte todo a MAYÚSCULAS y quita acentos.
        2. "seccion" debe ser un número entero o null.
        3. "sexo" debe ser "H" o "M".
        
        FORMATO JSON REQUERIDO:
        {
          "apellido_paterno": "VALOR",
          "apellido_materno": "VALOR",
          "nombres": "VALOR",
          "curp": "VALOR",
          "clave_elector": "VALOR",
          "fecha_nacimiento": "VALOR",
          "seccion": 1234,
          "sexo": "M",
          "estado": "VALOR",
          "direccion": "VALOR"
        }`
      },
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
      }
    ];

    // Adjuntar reverso solo si existe una cadena real y no vacía
    if (reversoBase64 && reversoBase64.trim().length > 10) {
      contenidoMensaje.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${reversoBase64}` }
      });
    }

    // Llamada al modelo de visión de Groq
    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: "user", content: contenidoMensaje }],
      model: "llama-3.2-11b-vision-preview", 
      temperature: 0.1, 
    });

    let responseText = chatCompletion.choices[0].message.content.trim();

    // FILTRO ANTIRROTURA: Extrae solo lo que esté dentro de las llaves {} por si la IA escribe texto extra
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("La IA no devolvió un formato JSON válido: " + responseText);
    }
    
    const cleanJSON = jsonMatch[0];
    const parsedData = JSON.parse(cleanJSON);

    // Responder con éxito al cliente
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Error en scan.js:", error);
    return res.status(500).json({ 
      error: "Error interno en el backend", 
      details: error.message 
    });
  }
};