const Groq = require("groq-sdk");

// Inicializamos el SDK de Groq con la variable de entorno de Vercel
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async function handler(req, res) {
  // RNF-01: Control de método POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { imageBase64, reversoBase64 } = req.body; 

    if (!imageBase64) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen base64 del frente' });
    }

    // Construimos el contenido inicial con el Frente
    const contenidoMensaje = [
      { 
        type: "text", 
        text: `Actúas como un sistema OCR experto e inteligente en credenciales de elector del INE de México (modelos recientes y anteriores, procesando tanto Anversos como Reversos).
        Analiza las imágenes adjuntas en busca de texto o zonas de códigos de barras/Machine Readable Zone (MRZ). Extrae los datos disponibles y devuélvelos estrictamente en un formato JSON plano.
        
        REGLAS DE NEGOCIO Y NORMALIZACIÓN: 
        1. Convierte TODOS los textos a MAYÚSCULAS y remueve acentos.
        2. "seccion" debe ser estrictamente un NÚMERO entero (ej: 1234).
        3. Remueve espacios intermedios en CURP y Clave de Elector.
        4. "sexo" debe ser estrictamente una sola letra: "H" o "M".
        
        ESTRUCTURA JSON REQUERIDA:
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

    // Inyectamos el reverso SOLO si el usuario realmente subió un archivo atrás
    if (reversoBase64 && reversoBase64.trim() !== "") {
      contenidoMensaje.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${reversoBase64}` }
      });
    }

    // Llamada al modelo de Groq Cloud
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: contenidoMensaje
        }
      ],
      model: "llama-3.2-11b-vision-preview", 
      temperature: 0.1, 
    });

    const responseText = chatCompletion.choices[0].message.content;

    // Limpiamos marcas de bloques markdown que la IA suele poner automáticamente
    const cleanJSON = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    const parsedData = JSON.parse(cleanJSON);

    // Mandamos la respuesta final estructurada al frontend
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Error crítico en backend:", error);
    return res.status(500).json({ 
      error: "Error interno en el servidor de escaneo", 
      details: error.message 
    });
  }
};