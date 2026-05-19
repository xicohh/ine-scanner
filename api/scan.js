import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export default async function handler(req, res) {
  // RNF-01: Control de método POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  try {
    // CORRECCIÓN: Extraemos tanto el frente como el reverso enviados por el nuevo frontend
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
        2. "seccion" debe ser estrictamente un NÚMERO entero (ej: 2467). Si no viene o no es legible, pon 0.
        3. "sexo" debe ser una sola letra: "H" o "M".
        4. "fecha_nacimiento" debe estar en formato estricto DD/MM/AAAA.
        5. "confianza_estimada" debe ser un número entero entre 0 y 100 evaluando la legibilidad.
        6. Si una imagen corresponde al reverso (atrás), lee detenidamente las líneas del código MRZ (tipo pasaporte) y los códigos de barras para cruzar información de los apellidos, nombres o sección si el frente estuviera borroso.

        Devuelve ÚNICAMENTE el objeto JSON extraído de la credencial, sin texto extra, sin formato markdown (\`\`\`json):
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
    ];

    // SI EL USUARIO SUBIÓ EL REVERSO, SE LO INYECTAMOS AL ARREGLO DE IMÁGENES DE GROQ
    if (reversoBase64) {
      contenidoMensaje.push({
        type: "image_url",
        image_url: { url: `data:image/jpeg;base64,${reversoBase64}` }
      });
    }

    // RF-02, RF-03 y Matriz de Trazabilidad: Extracción, segmentación y normalización
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: contenidoMensaje
        }
      ],
      // Usamos el modelo optimizado de visión Llama 3.2 de la plataforma Groq Cloud
      model: "llama-3.2-11b-vision-preview", 
      temperature: 0.1, 
    });

    const responseText = chatCompletion.choices[0].message.content.trim();

    // Limpieza de posibles marcas de markdown que ponga la IA por error
    const cleanJson = responseText.replace(/```json/g, "").replace(/```/g, "").trim();
    
    const parsedData = JSON.parse(cleanJson);
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error("Error crítico en el backend /api/scan:", error);
    return res.status(500).json({ error: "Fallo al procesar la imagen con Groq: " + error.message });
  }
}