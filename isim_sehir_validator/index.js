const functions = require('@google-cloud/functions-framework');
const { GoogleGenerativeAI } = require('@google/generative-ai');

functions.http('validateWord', async (req, res) => {
  // CORS configuration
  res.set('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Methods', 'POST');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).send('');
  }

  try {
    const { word, category, letter } = req.body;
    
    // Check if word is provided
    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: 'Kelime eksik veya hatalı format.' });
    }

    const cleanWord = word.trim();
    
    // Check if word is longer than 2 characters
    if (cleanWord.length <= 2) {
      return res.status(200).json({ result: 'GEÇERSİZ', reason: 'Kelime 2 harften uzun olmalıdır.' });
    }

    // Check starting letter if provided
    if (letter) {
      const firstLetter = cleanWord.charAt(0).toLocaleLowerCase('tr-TR');
      const targetLetter = letter.toLocaleLowerCase('tr-TR');
      if (firstLetter !== targetLetter) {
        return res.status(200).json({ result: 'GEÇERSİZ', reason: 'İstenen harfle başlamıyor.' });
      }
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API key yapılandırılmamış.' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    
    // The user requested "gemin 3.1 flash lite". As there is no exact match for this name, 
    // we use gemini-1.5-flash which is the standard model that supports Google Search Grounding.
    // In production you could swap this out for gemini-2.0-flash-lite if available.
    const model = genAI.getGenerativeModel({
      model: "gemini-3.1-flash-lite-preview", // Use the flash model for grounding capabilities
      tools: [{
        googleSearch: {} // Enables Google Search grounding to prevent hallucinations
      }]
    });

    const prompt = `
İsim şehir oyununda bir oyuncunun verdiği cevabın geçerli olup olmadığını kontrol eden katı bir hakemsin.
Lütfen aşağıdaki cevabın geçerliliğini Google araması yaparak teyit et. Halüsinasyon yapma, gerçekten böyle bir şey olup olmadığından emin ol.
SADECE "GEÇERLİ" veya "GEÇERSİZ" olarak cevap ver. Ekstra hiçbir kelime veya noktalama işareti kullanma.

Kategori: ${category || 'Bilinmiyor'}
İstenen Başlangıç Harfi: ${letter || 'Bilinmiyor'}
Oyuncunun Cevabı: ${cleanWord}

Kurallar:
1. Eğer kelime gerçek hayatta bu kategoride bulunmuyorsa GEÇERSİZ de.
2. Yazım yanlışları çok ufaksa ve ne olduğu net anlaşılıyorsa GEÇERLİ diyebilirsin ama uydurma kelimelere izin verme.
3. Kategoriyle uyuşmuyorsa GEÇERSİZ de.
4. İstenen harfle başlamıyorsa GEÇERSİZ de.
`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text().trim().toUpperCase();

    // Parse the strict output
    if (responseText.includes('GEÇERLİ') && !responseText.includes('GEÇERSİZ')) {
        return res.status(200).json({ result: 'GEÇERLİ' });
    } else {
        return res.status(200).json({ result: 'GEÇERSİZ' });
    }

  } catch (error) {
    console.error('Error in validation:', error);
    return res.status(500).json({ error: 'Doğrulama sırasında bir hata oluştu.' });
  }
});
