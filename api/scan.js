const Groq = require("groq-sdk");

// Inicializamos el SDK de Groq con la variable de entorno de Vercel
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

module.exports = async function handler(req, res) {
  // RNF-01: Control de método POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    // Extraemos tanto el frente como el reverso enviados por el frontend
    const { imageBase64, reversoBase64 } = req.body; 

    if (!imageBase64) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen base64 del frente' });
    }

    // Construimos dinámicamente el contenido para el mensaje de Groq
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
        5. Devuelve una estimación numérica del porcentaje de legibilidad/certeza en "confianza_estimada" (un entero entre 0 y 100).
        
        ESTRUCTURA JSON REQUERIDA (Usa exactamente estos campos, si no encuentras alguno ponlo como cadena vacía o nulo):
        {
          "apellido_paterno": "RODRIGUEZ",
          "apellido_materno": "LOPEZ",
          "nombres": "JUAN CARLOS",
          "curp": "ROLJ940518HDFRNS03",
          "clave_elector": "ROLJ94051814M300",
          "fecha_nacimiento": "18/05/1994",
          "seccion": 2594,
          "sexo": "H",
          "estado": "JALISCO",
          "direccion": "AV CENTRAL 123 COL CENTRO GUADALAJARA JAL",
          "cic": "14341218",
          "ocr_identificador": "14341218MEX",
          "codigo_barras": "IIMEX2594626880<<2467137073815",
          "confianza_estimada": 83
        }`
      },
      {
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
      }
    ];

    // Si el frontend mandó el reverso, se lo inyectamos al arreglo de imágenes de Groq
    if (reversoBase64) {
      contenidoMensaje.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${reversoBase64}` }
      });
    }

    // Ejecutamos la llamada al modelo de visión de Groq
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

    // Limpiamos posibles bloques de marcado markdown (\`\`\`json ... \`\`\`) que a veces añade el modelo
    const cleanJSON = responseText.replace(/```json/g, "").replace(/```/g, "").trim();

    // Parseamos la respuesta para garantizar que mandamos un objeto estructurado
    const parsedData = JSON.parse(cleanJSON);

    // Retornamos exitosamente los datos limpios al cliente
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Error crítico en el backend /api/scan:", error);
    return res.status(500).json({ 
      error: "Error interno al procesar con Groq", 
      details: error.message 
    });
  }
};