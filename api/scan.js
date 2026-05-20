import Groq from 'groq-sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const { imageBase64, reversoBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No se recibió la imagen del frente' });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Falta la variable de entorno GROQ_API_KEY en Vercel' });
    }

    const groq = new Groq({ apiKey });

    const promptTexto = `Eres un sistema experto OCR automatizado para credenciales INE de México.
Analiza las imágenes adjuntas para extraer la información del documento.

REGLAS DE ORO:
1. Responde ÚNICAMENTE con el objeto JSON solicitado. Sin introducciones, explicaciones ni bloques Markdown.
2. Si un campo no es legible o no viene, devuélvelo como cadena vacía "" (o 0 para sección y confianza).
3. Remueve acentos y convierte todo el texto a MAYÚSCULAS.

Estructura exacta del JSON:
{
  "apellido_paterno": "VALOR",
  "apellido_materno": "VALOR",
  "nombres": "VALOR",
  "curp": "VALOR",
  "clave_elector": "VALOR",
  "seccion": 1234,
  "estado": "ENTIDAD FEDERATIVA (ej: JALISCO)",
  "direccion": "CALLE, NUMERO, COLONIA, MUNICIPIO",
  "estado_revision": "APROBADO/PENDIENTE",
  "confianza": 95
}`;

    // Armamos el array de contenido con las imágenes
    const contentParts = [
      { type: "text", text: promptTexto },
      {
        type: "image_url",
        image_url: { url: imageBase64 }  // Groq acepta data:image/... directamente
      }
    ];

    // Agregamos el reverso si existe
    if (reversoBase64) {
      contentParts.push({
        type: "image_url",
        image_url: { url: reversoBase64 }
      });
    }

    const completion = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: contentParts
        }
      ],
      temperature: 0.1,
      max_tokens: 500,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content?.trim();

    if (!responseText) {
      throw new Error("Groq devolvió una respuesta vacía.");
    }

    // Parseo seguro
    let resultadoFinal;
    try {
      resultadoFinal = JSON.parse(responseText);
    } catch (parseError) {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("La IA no devolvió un formato JSON válido.");
      resultadoFinal = JSON.parse(jsonMatch[0]);
    }

    if (resultadoFinal && resultadoFinal.confianza && !resultadoFinal.indice_confianza) {
      resultadoFinal.indice_confianza = resultadoFinal.confianza;
    }

    return res.status(200).json(resultadoFinal);

  } catch (error) {
    console.error("Error crítico en el backend:", error);
    return res.status(500).json({
      error: 'Error interno en el escáner',
      details: error.message
    });
  }
}