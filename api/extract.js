import pdf from 'pdf-parse';

// A chave da API DEVE ser definida como uma variável de ambiente no Vercel.
// Isso impede que a chave seja exposta publicamente no código do frontend,
// garantindo a segurança da sua conta.
const API_KEY = process.env.GEMINI_API_KEY; 

export default async function handler(req, res) {
  // Apenas aceita requisições POST para processamento de arquivos.
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    const { pdfData, additionalPrompt } = req.body;

    if (!pdfData) {
      return res.status(400).json({ error: 'Nenhum dado de PDF foi fornecido.' });
    }

    // Convertendo o base64 de volta para um Buffer para o pdf-parse.
    const pdfBuffer = Buffer.from(pdfData, 'base64');
    
    // Processa o PDF para extrair o texto usando pdf-parse.
    const data = await pdf(pdfBuffer);
    const fullText = data.text;

    // Monta o prompt para a IA da Gemini com o texto extraído e as instruções adicionais.
    const prompt = `
      Extraia os dados de produtos do texto abaixo e formate-os em uma planilha com as seguintes colunas:
      - Produto: O código do produto.
      - Descricao: A descrição completa do produto.
      - UM: A unidade de medida.
      - Quantidade: A quantidade.
      - Preco Venda: O preço de venda.
      - Total: O preço total.
      ${additionalPrompt ? `Instruções adicionais do usuário: ${additionalPrompt}` : ''}

      TEXTO DO PDF:
      "${fullText}"
      
      A resposta deve ser um array de objetos JSON, onde cada objeto representa uma linha da tabela, seguindo a estrutura:
      {
        "produto": "string",
        "descricao": "string",
        "um": "string",
        "quantidade": "string",
        "precoVenda": "string",
        "total": "string"
      }
    `;

    const payload = {
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
            type: "ARRAY",
            items: {
                type: "OBJECT",
                properties: {
                    "produto": { "type": "STRING" },
                    "descricao": { "type": "STRING" },
                    "um": { "type": "STRING" },
                    "quantidade": { "type": "STRING" },
                    "precoVenda": { "type": "STRING" },
                    "total": { "type": "STRING" }
                },
                "propertyOrdering": ["produto", "descricao", "um", "quantidade", "precoVenda", "total"]
            }
        }
      }
    };
    
    // Chamada à API da Gemini usando a chave de ambiente segura.
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Erro na API Gemini: ${response.status} - ${await response.text()}`);
    }

    const result = await response.json();
    const jsonString = result.candidates[0].content.parts[0].text;
    const parsedData = JSON.parse(jsonString);

    // Adiciona a contagem de linhas no servidor, em vez do cliente.
    const dataWithItemCount = parsedData.map((row, index) => ({
      item: (index + 1).toString(),
      ...row
    }));
    
    return res.status(200).json(dataWithItemCount);
  } catch (error) {
    console.error('Erro na função serverless:', error);
    // Retorna uma resposta JSON consistente, mesmo em caso de erro,
    // para que o frontend não falhe ao tentar fazer o parse.
    return res.status(500).json({ error: error.message });
  }
}
