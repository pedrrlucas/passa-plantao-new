/* eslint-disable max-len */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {VertexAI} = require("@google-cloud/vertexai");

admin.initializeApp();

const vertexAI = new VertexAI({
  project: process.env.GCLOUD_PROJECT,
  location: "us-central1",
});

const model = "gemini-1.5-flash-001";

/**
 * Função para sugestões de DIAGNÓSTICO.
 */
exports.getVertexDiagnosisSuggestion = functions.https.onCall(async (data) => {
  const {query: userQuery} = data;
  if (!userQuery) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "A consulta (query) é obrigatória.",
    );
  }

  const prompt = `
    Você é um assistente médico especialista em CID-10 e terminologia médica. Sua tarefa é analisar a busca do usuário e retornar um array JSON com até 5 termos de busca (tokens) que sejam clinicamente relevantes e otimizados para uma consulta 'array-contains-any' em um banco de dados Firestore. O campo de busca se chama 'search_tokens_normalized' e contém termos em minúsculas e sem acentos.
    A busca do usuário é: "${userQuery}".

    Siga estas regras estritamente:
    1.  **Nomes Formais (CID):** O banco de dados utiliza os nomes formais das doenças, baseados na classificação CID-10. Dê prioridade máxima aos termos técnicos e formais em vez de gírias ou descrições vagas.
    2.  **Correção de Erros:** Se a busca parecer ter um erro de digitação, inclua o termo corrigido. (Ex: "diabetis" -> "diabetes").
    3.  **Sinônimos e Abreviações:** Inclua sinônimos médicos, abreviações comuns e termos relacionados que levem ao nome formal. (Ex: "IAM" -> "infarto", "agudo", "miocardio", "sindrome", "coronariana").
    4.  **Linguagem Natural:** Se a busca for uma descrição (ex: "dor de barriga forte"), traduza para os termos técnicos mais prováveis. (-> "dor", "abdominal", "aguda", "colica", "gastroenterite").
    5.  **Priorize Relevância:** Os termos mais específicos e importantes devem vir primeiro no array.
    6.  **Formato:** A saída DEVE ser um array JSON de strings.
    7.  **Múltiplos Conceitos:** Se a busca contiver múltiplos conceitos (ex: "fratura de fêmur"), os tokens para ambos os conceitos ("fratura", "femur") devem ser retornados para permitir uma classificação de resultados mais precisa.

    Exemplos:
    -   Busca: "cancer de mama" -> ["neoplasia", "maligna", "mama", "carcinoma", "tumor", "cid", "c50"]
    -   Busca: "Pressão alta" -> ["hipertensao", "arterial", "sistemica", "essencial", "cid", "i10"]
    -   Busca: "dpoc" -> ["doenca", "pulmonar", "obstrutiva", "cronica", "enfisema", "bronquite", "cid", "j44"]
    `;

  try {
    const generativeModel = vertexAI.getGenerativeModel({model});
    const resp = await generativeModel.generateContent(prompt);
    const jsonText = resp.response.candidates[0].content.parts[0].text;

    const match = jsonText.match(/(\[.*\])/s);
    if (match && match[0]) {
      const suggestions = JSON.parse(match[0]);
      return {suggestions};
    }
    return {suggestions: []};
  } catch (error) {
    console.error("Erro na chamada ao Vertex AI para diagnóstico:", error);
    throw new functions.https.HttpsError(
        "internal",
        "Falha ao obter sugestões de diagnóstico.",
    );
  }
});

/**
 * Função para sugestões de MEDICAMENTOS.
 */
exports.getVertexMedicationSuggestion = functions.https.onCall(async (data) => {
  const {query: userQuery} = data;
  if (!userQuery) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "A consulta (query) é obrigatória.",
    );
  }

  const prompt = `
    Você é um farmacêutico especialista. Sua tarefa é analisar a busca do usuário por um medicamento e retornar um array JSON com até 5 nomes de princípios ativos.
    A busca do usuário é: "${userQuery}".

    Siga estas regras estritamente:
    1.  **Correção de Erros:** Corrija erros de digitação comuns. (Ex: "dipiron" -> "dipirona").
    2.  **Princípio Ativo:** Se o usuário digitar um nome comercial, inclua o princípio ativo. (Ex: "Tylenol" -> "paracetamol").
    3.  **Busca por Doença:** Se o usuário digitar uma condição (ex: "remédio para febre"), sugira os medicamentos mais comuns para essa condição.
    4.  **Priorize Genéricos:** Dê preferência a princípios ativos (nomes genéricos) nas sugestões.
    5.  **Formato:** A saída DEVE ser um array JSON de strings, sem nenhum texto adicional.

    Exemplos:
    -   Busca: "remedio pra dor de cabeça" -> ["dipirona", "paracetamol", "ibuprofeno", "dorflex", "cefaliv"]
    -   Busca: "aas" -> ["acido acetilsalicilico", "aspirina"]
    -   Busca: "amoxilina" -> ["amoxicilina"]
    `;

  try {
    const generativeModel = vertexAI.getGenerativeModel({model});
    const resp = await generativeModel.generateContent(prompt);
    const jsonText = resp.response.candidates[0].content.parts[0].text;

    const match = jsonText.match(/(\[.*\])/s);
    if (match && match[0]) {
      const suggestions = JSON.parse(match[0]);
      return {suggestions};
    }
    return {suggestions: []};
  } catch (error) {
    console.error("Erro na chamada ao Vertex AI para medicamentos:", error);
    throw new functions.https.HttpsError(
        "internal",
        "Falha ao obter sugestões de medicamentos.",
    );
  }
});

/**
 * Função para a PASSAGEM DE PLANTÃO POR VOZ.
 */
exports.getStructuredDataFromVoice = functions.https.onCall(async (data) => {
  // Esta lógica extrai o texto, não importa como ele chegue.
  const text = data.text;

  if (!text) {
    // Adiciona um log para depuração futura, caso o erro ocorra novamente
    console.error("Erro: O campo 'text' não foi encontrado no payload recebido.", data);
    throw new functions.https.HttpsError(
        "invalid-argument", "O texto transcrito é obrigatório.",
    );
  }
  const today = new Date().toLocaleDateString("pt-BR", {weekday: "long", year: "numeric", month: "long", day: "numeric"});
  const standardDevices = ["AVP MSE", "AVP MSD", "PICC", "CVC", "CDL", "SNE", "GTT", "SVD", "Monitor"];

  const prompt = `
      Você é um assistente de IA para enfermagem, especialista em processar passagens de plantão faladas e alinhá-las com os formulários do sistema.
      Analise o texto a seguir e extraia as informações para um objeto JSON. A data de hoje é ${today}.

      REGRAS CRÍTICAS DE FORMATAÇÃO E EXTRAÇÃO:
      1.  **Horários (HH:mm):** Interprete horários em linguagem natural e converta para o formato "HH:mm". Ex: "meio-dia" -> "12:00", "duas e quinze da tarde" -> "14:15".
      2.  **Datas e Horas (AAAA-MM-DD HH:mm):** Para exames, converta a data e hora para o formato "AAAA-MM-DD HH:mm".
      3.  **Dispositivos (IMPORTANTE):** A chave "dispositivos" deve ser um array de objetos. Para cada dispositivo mencionado no texto:
          a.  Crie um objeto com a chave "transcribed" contendo o texto exato que o usuário falou (já capitalizado).
          b.  Compare o texto "transcribed" com a lista de dispositivos padrão: ${JSON.stringify(standardDevices)}.
          c.  Se encontrar uma correspondência provável (mesmo que com erro de digitação ou abreviação), adicione uma chave "suggestion" com o nome EXATO do dispositivo padrão. Se não houver correspondência, omita a chave "suggestion".
      4.  **Recomendações de Riscos e Cuidados:** Analise o texto e encontre a correspondência MAIS PRÓXIMA nas OPÇÕES PARA SUGESTÕES abaixo. A saída para "sugestoesRiscos" e "sugestoesCuidados" deve ser um array de objetos, cada um com "categoria" (o título do módulo) e "recomendacao" (o texto exato da opção).
      5.  **Texto Livre (IMPORTANTE):** Se um cuidado descrito NÃO se encaixa nas OPÇÕES PARA SUGESTÕES, analise seu conteúdo. Se for uma precaução (ex: "precaução de contato", "precaução respiratória"), adicione à chave "precaucoes". Caso contrário, adicione o texto na chave "observacoes". NÃO USE A CHAVE "cuidados".
      6.  **Omissão:** OMITA qualquer chave do JSON final se a informação não for encontrada no texto.
      7.  **Sinais Vitais**: Use exclusivamente as chaves abreviadas definidas na estrutura do JSON: "pa" para Pressão Arterial, "fc" para Frequência Cardíaca, "fr" para Frequência Respiratória, "temp" para Temperatura, "sat" para Saturação e "glicemia" para Glicemia Capilar.

      OPÇÕES PARA SUGESTÕES DE RISCOS:
      - Risco de LPP: ["Sem Risco Aparente", "Risco Baixo (Braden 15-18)", "Risco Moderado (Braden 13-14)", "Risco Alto (Braden 10-12)", "Risco Muito Alto (Braden ≤9)"]
      - Risco de Quedas: ["Sem Risco Aparente", "Risco Baixo (Morse 0-24)", "Risco Médio (Morse 25-44)", "Risco Alto (Morse ≥45)"]
      - Risco de Broncoaspiração: ["Sem Risco Aparente", "Risco Baixo (Alerta, deambula, deglute bem)", "Risco Moderado (Sonolento, disfagia leve, tosse)", "Risco Alto (SNG/GTT, rebaixamento de consciência)"]
      - Risco de IRAS: ["Sem Fatores de Risco", "Uso de Dispositivo Invasivo (AVP, CVC, SVD, etc.)", "Paciente Imunossuprimido", "Colonização por MRO (Bactéria Multirresistente)", "Sítio Cirúrgico / Ferida Operatória"]

      OPÇÕES PARA SUGESTÕES DE CUIDADOS (FUGULIN):
      - Cuidado Corporal / Pele: ["Autossuficiente", "Ajuda no banho / em partes do corpo", "Banho no leito, higiene oral", "Incontinente, com lesões, curativos complexos"]
      - Motilidade / Movimentação: ["Ativo, movimenta-se sozinho", "Requer mudança de decúbito programada", "Necessita de ajuda para se movimentar", "Totalmente restrito ao leito"]
      - Deambulação: ["Deambula sozinho, sem ajuda", "Requer auxílio para deambular", "Ajuda para transferência (leito-cadeira)", "Totalmente acamado"]
      - Alimentação / Hidratação: ["Alimenta-se sozinho", "Requer ajuda parcial / estímulo", "Alimentação por sonda (SNE/GTT)", "Nutrição Parenteral Total (NPT)"]
      - Cuidado com Eliminações: ["Independente, controle esfincteriano", "Uso de comadre / auxílio no banheiro", "Sonda Vesical de Demora (SVD)", "Incontinência, evacuação no leito, ostomias"]
              
      CHAVES POSSÍVEIS PARA EXTRAÇÃO:
      - "diagnostico", "comorbidades", "alergias", "sinaisVitais", "usoO2", "outrosMonitoramento", "medicamentos", "dispositivos", "exames", "observacoes", "cuidados" (para texto livre), "sugestoesRiscos", "sugestoesCuidados".
              
      Exemplo de texto: "paciente com pneumonia, fez dipirona meio-dia. tem um acesso venoso periférico. paciente com alto risco de lesão por pressão, e necessita de ajuda para o banho."
      Exemplo de JSON de saída:
      {
        "diagnostico": "Pneumonia",
        "medicamentos": [{ "nome": "Dipirona", "horario": "12:00" }],
        "dispositivos": "Acesso Venoso Periférico",
        "sugestoesRiscos": [{ "categoria": "Risco de LPP", "recomendacao": "Risco Alto (Braden 10-12)" }],
        "sugestoesCuidados": [{ "categoria": "Cuidado Corporal / Pele", "recomendacao": "Ajuda no banho / em partes do corpo" }]
      }
      Exemplo de texto: "paciente com acesso venoso no membro superior direito e um cateter central inserido."
      Exemplo de JSON de saída:
      {
        "dispositivos": [
          { "transcribed": "Acesso Venoso no Membro Superior Direito", "suggestion": "AVP MSD" },
          { "transcribed": "Um Cateter Central", "suggestion": "CVC" }
        ]
      }

      Texto para análise: "${text}"
      `;

  try {
    const generativeModel = vertexAI.getGenerativeModel({model});
    const resp = await generativeModel.generateContent(prompt);
    const jsonText = resp.response.candidates[0].content.parts[0].text
        .replace(/```json/g, "").replace(/```/g, "").trim();

    const structuredData = JSON.parse(jsonText);
    return {data: structuredData};
  } catch (error) {
    console.error("Erro na chamada ao Vertex AI para voz:", error);
    throw new functions.https.HttpsError(
        "internal", "Falha ao processar a passagem de plantão por voz.",
    );
  }
});
