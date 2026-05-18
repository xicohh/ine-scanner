import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  // RNF-01: Control de método POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    const { imageBase64 } = req.body; 

    if (!imageBase64) {
      return res.status(400).json({ error: 'No se recibió ninguna imagen base64' });
    }

    // RF-02, RF-03 y Matriz de Trazabilidad: Extracción, segmentación y normalización
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: [
            { 
              type: "text", 
              text: `Actúas como un sistema OCR experto e inteligente en credenciales de elector del INE de México (modelos recientes y anteriores, procesando tanto Anversos como Reversos).
              Analiza la imagen adjunta en busca de texto o zonas de códigos de barras/Machine Readable Zone (MRZ). Extrae los datos disponibles y devuélvelos estrictamente en un formato JSON plano.
              
              REGLAS DE NEGOCIO Y NORMALIZACIÓN: 
              1. Convierte TODOS los textos a MAYÚSCULAS y remueve acentos.
              2. Divide el nombre completo de forma estricta: nombres, apellido_paterno, apellido_materno.
              3. Si es un Reverso, extrae con precisión el Folio, Año de registro y procesa las líneas del código de barras (MRZ).
              4. Calcula un índice de confianza del 1 al 100 basado en la legibilidad de la imagen.

              Devuelve EXCLUSIVAMENTE el objeto JSON sin texto extra, sin formato markdown (\`\`\`json):
              {
                "nombres": "CHRISTIAN JARED",
                "apellido_paterno": "TEJEDA",
                "apellido_materno": "RUVALCABA",
                "curp": "TERC060106HJCJVRA3",
                "clave_elector": "TJRVCR06010614H500",
                "fecha_nacimiento": "06/01/2006",
                "seccion": 2467,
                "estado": "JALISCO",
                "sexo": "H",
                "folio": "06010614341218MEX",
                "codigo_barras": "IIMEX2594626880<<2467137073815",
                "confianza_estimada": 83
              }`
            },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imageBase64}` }
            }
          ]
        }
      ],
      // Usamos el modelo optimizado de visión Llama 3.2 de la plataforma Groq Cloud
      model: "llama-3.2-11b-vision-preview", 
      temperature: 0.1, 
    });

    const responseText = chatCompletion.choices[0].message.content.trim();
    
    // Limpieza de seguridad por si el modelo genera respuestas con marcas de código triple backtick
    const cleanJson = responseText.replace(/```json|```/g, "").trim();
    const dataExtracted = JSON.parse(cleanJson);

    return res.status(200).json(dataExtracted);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error en el procesamiento inteligente de la INE" });
  }
}