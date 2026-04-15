export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { fileName, fileBase64 } = req.body;

  if (!fileName || !fileBase64) {
    return res.status(400).json({ error: 'Arquivo não recebido corretamente' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Chave de API não configurada.' });
  }

  const systemPrompt = `Você é um extrator especializado de dados imobiliários de teasers de crédito NPL do Banco do Brasil.

Analise o teaser e extraia TODOS os imóveis mencionados, seja como garantia (hipoteca, penhor de imóvel, alienação fiduciária de bem imóvel) ou como busca patrimonial/informações patrimoniais.

Regras de extração:
1. Garantia = imóvel dado explicitamente como garantia da operação de crédito (hipoteca, AF, penhor imobiliário).
2. Busca = imóvel encontrado em pesquisa patrimonial dos devedores/avalistas, não necessariamente dado em garantia.
3. Área: para imóveis urbanos, use a área construída (não o terreno), exceto quando o terreno for muito grande e a área construída muito pequena. Para rurais, use a área total em hectares.
4. Unidade: "ha" para rurais, "m²" para urbanos.
5. Tipo de imóvel: classifique como "Lote Rural", "Lote Urbano", "Apartamento", "Casa", "Vaga de Garagem", "Sala Comercial", "Loja" ou outro tipo adequado. Se não houver informação suficiente, use "-".
6. Para Município e UF, extraia da descrição do imóvel. Se não informado, use "-".
7. Matrícula: extraia o número exato. Se não informado, use "-".
8. Não duplique entradas: se a mesma matrícula aparecer mais de uma vez com as mesmas informações, inclua apenas uma vez.
9. Ofício: extraia o número do ofício ou cartório mencionado junto à matrícula. Use o formato com dois dígitos seguido de grau, por exemplo: 01, 02, 06. Formate sempre como "01º", "02º", "06º". Se não houver menção ao ofício, use "01º".
10. Se não houver nenhum imóvel no teaser, retorne um único objeto com todos os campos preenchidos com "-".

Retorne SOMENTE um JSON válido, sem markdown, sem texto adicional, neste formato exato:
{"imoveis": [{"tipo": "Garantia ou Busca ou -", "matricula": "...", "area": numero_ou_traco, "unidade": "ha ou m² ou -", "municipio": "...", "uf": "XX ou -", "tipo_imovel": "...", "oficio": "01º ou 02º etc"}]}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: fileBase64
                }
              },
              {
                type: 'text',
                text: 'Extraia todos os imóveis deste teaser conforme as instruções.'
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Erro na API Anthropic:', errBody);
      return res.status(502).json({ error: 'Erro ao consultar o Claude. Tente novamente.' });
    }

    const data = await response.json();
    const text = data.content.map(c => c.text || '').join('');
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Erro interno:', err);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
}
