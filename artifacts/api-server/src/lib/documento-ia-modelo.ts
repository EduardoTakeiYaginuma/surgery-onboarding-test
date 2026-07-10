import type { FormularioDocumentoIa } from "@workspace/db";

/**
 * FONTE DA VERDADE JURÍDICA da via de criação por IA.
 *
 * A IA NÃO inventa o documento do zero: ela segue FIELMENTE o padrão dos
 * documentos-exemplo reais da clínica (contracts_eg/ e termo_eg/). Este módulo
 * carrega o texto FIXO (verbatim) das seções invariantes e os blocos de risco por
 * procedimento, e monta um system prompt bem detalhado que obriga a IA a:
 *   - reproduzir LITERALMENTE as cláusulas fixas;
 *   - NÃO remover nem criar tópicos/seções, e manter a numeração;
 *   - compor apenas as partes que dependem dos dados (identificação, objeto,
 *     preço/pagamento, foro/cidade/data), com concordância de gênero;
 *   - devolver SOMENTE HTML no subconjunto suportado pelo renderizador de PDF.
 *
 * É AQUI que o jurídico edita o texto canônico — um único ponto.
 */

/** Catálogo padrão de procedimentos (checklist do objeto do contrato). */
export const PROCEDIMENTOS_CATALOGO = [
  "Blefaroplastia Superior",
  "Blefaroplastia Inferior",
  "Cantopexia / Cantoplastia",
  "Temporal Lifting (Brow Lift)",
  "Lipoenxertia Facial",
  "Laser de CO2 Fracionado (Resurfacing)",
  "Correção de Ptose Palpebral",
] as const;

/**
 * Blocos de RISCO ESPECÍFICO por procedimento (seção 3 do TCLE), verbatim dos
 * termos-exemplo. Chave = nome canônico do procedimento. Procedimentos sem bloco
 * canônico aqui recebem instrução para a IA redigir um bloco fiel ao mesmo estilo.
 */
export const RISCOS_POR_PROCEDIMENTO: Record<string, string> = {
  "Blefaroplastia Superior": `<p><strong>BLEFAROPLASTIA SUPERIOR (Pálpebras)</strong></p>
<p><strong>Lagoftalmo Temporário:</strong> Dificuldade em fechar completamente os olhos nas primeiras semanas devido ao inchaço e ressecção de pele. Exige uso rigoroso de colírios lubrificantes para evitar lesões na córnea.</p>
<p><strong>Cicatriz:</strong> A cicatriz fica no sulco palpebral. Pode haver formação de pequenos cistos (milium) na linha de corte, removíveis em consultório.</p>
<p><strong>Assimetria de Sulco:</strong> As dobras podem cicatrizar em alturas diferentes devido à anatomia óssea.</p>`,

  "Blefaroplastia Inferior": `<p><strong>BLEFAROPLASTIA INFERIOR COM CANTOPEXIA</strong></p>
<p><strong>Ectrópio / “Scleral Show”:</strong> Retração temporária da pálpebra inferior, deixando o olho com aspecto “arredondado”. É comum e geralmente cede com massagens, mas em casos de flacidez severa ou reações cicatriciais imprevisíveis, pode exigir correção cirúrgica futura. A Cantopexia é justamente a técnica empregada para minimizar este risco, oferecendo suporte estrutural ao canto lateral do olho.</p>
<p><strong>Hematoma:</strong> A região dos olhos é muito vascularizada; manchas roxas são esperadas e demoram dias para sumir.</p>
<p><strong>Hematoma Retrobulbar (Risco Grave):</strong> Sangramento profundo atrás do olho, configurando emergência médica de ocorrência rara. Declaro ciência de que, caso não seja tratado em caráter cirúrgico de urgência imediata, pode evoluir, em casos raríssimos, para perda visual parcial ou total irreversível do olho afetado.</p>
<p><strong>Alteração do Formato do Olho:</strong> A Cantopexia altera o ponto de fixação do canto lateral, podendo gerar uma leve mudança no formato do olho (mais “alongado” ou “puxado”), efeito desejado da técnica, mas que pode ser percebido como assimetria em alguns casos.</p>`,

  "Cantopexia / Cantoplastia": `<p><strong>CANTOPEXIA / CANTOPLASTIA</strong></p>
<p><strong>Alteração do Formato do Olho:</strong> A Cantopexia altera o ponto de fixação do canto lateral, podendo gerar uma leve mudança no formato do olho (mais “alongado” ou “puxado”), efeito desejado da técnica, mas que pode ser percebido como assimetria em alguns casos.</p>
<p><strong>Ectrópio / “Scleral Show”:</strong> Retração temporária da pálpebra inferior. Geralmente cede com massagens, mas pode exigir correção cirúrgica futura em casos de reações cicatriciais imprevisíveis.</p>`,

  "Temporal Lifting (Brow Lift)": `<p><strong>TEMPORAL LIFTING (BROW LIFT)</strong></p>
<p><strong>Parestesia:</strong> Sensação de dormência ou “formigamento” no couro cabeludo e testa, que pode durar meses.</p>
<p><strong>Alopecia Cicatricial:</strong> Risco de pequena falha no crescimento de cabelo exatamente sobre a linha da incisão (dentro do couro cabeludo).</p>
<p><strong>Alterações Nervosas (Neurapraxia):</strong> Risco de parestesia (dormência) ou paresia/paralisia temporária ou permanente do ramo temporal do nervo facial (dificuldade de elevar a sobrancelha).</p>`,

  "Laser de CO2 Fracionado (Resurfacing)": `<p><strong>LASER DE CO2 FRACIONADO (Resurfacing)</strong></p>
<p><strong>Hiperpigmentação (Manchas):</strong> Risco de “efeito rebote” (manchas escuras) se houver exposição ao sol, calor (vapor, secador) ou predisposição genética (melasma). O tratamento destas manchas é clínico.</p>
<p><strong>Herpes:</strong> O calor do laser pode reativar o vírus da herpes simples. O uso de antiviral profilático é obrigatório se prescrito.</p>`,
};

/** Cláusulas FIXAS do contrato (verbatim). A IA reproduz sem alterar. */
const CONTRATO_SOBERANIA_TECNICA = `<p><strong>1. Soberania Técnica:</strong> A CONTRATADA reserva-se o direito de suspender ou adiar o procedimento, inclusive no dia agendado, caso a CONTRATANTE apresente condições clínicas adversas (ex: hipertensão descontrolada, gripe, febre, lesões de pele ativas) ou descumpra o jejum obrigatório.</p>
<p><strong>Parágrafo Único:</strong> Nestes casos, motivados por segurança da paciente ou descumprimento de preparo, serão cobrados os custos de mobilização da equipe (taxa de sala/hora parada), não se aplicando reembolso.</p>`;

const CONTRATO_SECAO_IV = `<h2>IV. DA NATUREZA DA OBRIGAÇÃO (OBRIGAÇÃO DE MEIO)</h2>
<p><strong>CLÁUSULA 3ª.</strong> A Medicina não é uma ciência exata. A CONTRATADA assume obrigação de MEIO e não de RESULTADO.</p>
<p><strong>3.1. Subjetividade e Aleatoriedade:</strong> A CONTRATANTE declara compreender que o resultado cirúrgico depende de fatores biológicos intrínsecos e incontroláveis pela médica, tais como: genética, qualidade da pele, produção individual de colágeno, idade, tabagismo e resposta cicatricial (queloides/fibroses).</p>
<p><strong>3.2. Expectativa de Resultado:</strong> A CONTRATADA não garante a “perfeição”, simetria absoluta (inexistente na natureza humana) ou resultados idênticos a fotos de “antes e depois” de outras pacientes ou modelos de redes sociais. A cirurgia visa a melhora e a harmonia, dentro das limitações anatômicas da paciente.</p>`;

const CONTRATO_SECAO_V = `<h2>V. DEVERES DE CONDUTA, COMPLIANCE E MONITORAMENTO</h2>
<p><strong>CLÁUSULA 4ª.</strong> O sucesso do tratamento depende da estrita colaboração da paciente.</p>
<p><strong>4.1. Monitoramento Digital (Obrigatório):</strong> Nos primeiros 07 (sete) dias do pós-operatório, a CONTRATANTE obriga-se a enviar 01 (uma) fotografia diária da região operada para o WhatsApp oficial da Clínica, para controle de evolução.</p>
<p><strong>4.2. Limitação do WhatsApp (NÃO É EMERGÊNCIA):</strong> O canal de WhatsApp destina-se a orientações de rotina em horário comercial. EM CASO DE URGÊNCIA (dor intensa, sangramento volumoso, febre alta, falta de ar), a paciente deve dirigir-se IMEDIATAMENTE ao Pronto-Socorro Hospitalar onde foi operada ou ao mais próximo, não devendo aguardar resposta por mensagem.</p>
<p><strong>4.3. Consequência do Descumprimento:</strong> A falta de envio das fotos, a omissão de sintomas, a exposição solar indevida ou o não comparecimento aos retornos caracterizará CULPA EXCLUSIVA DA VÍTIMA e abandono de tratamento, isentando a equipe médica de responsabilidade por complicações decorrentes dessa desídia.</p>`;

const CONTRATO_SECAO_VI = `<h2>VI. POLÍTICA DE AGENDAMENTO, CANCELAMENTO E “NO-SHOW”</h2>
<p><strong>CLÁUSULA 5ª.</strong> O agendamento cirúrgico bloqueia a agenda da equipe e a sala cirúrgica, gerando custos prévios e impedindo o atendimento de outros pacientes.</p>
<p><strong>5.1. Taxa Administrativa:</strong> Do valor total do contrato, 10% (dez por cento) refere-se a taxas administrativas de pré-agendamento e reserva, sendo este valor NÃO REEMBOLSÁVEL em qualquer hipótese de cancelamento. A referida taxa encontra-se retida dentro do valor pago pela CONTRATANTE.</p>
<p><strong>5.2. Multas por Cancelamento (Deduzida a Taxa Administrativa):</strong> Em caso de desistência por parte da CONTRATANTE, aplicam-se as seguintes penalidades sobre o saldo restante:</p>
<p>a) Até 21 dias antes da cirurgia: Isento de multa (apenas retenção da taxa administrativa de 10%);</p>
<p>b) Entre 20 e 08 dias antes: Multa de 20% sobre o valor total do contrato;</p>
<p>c) Menos de 07 dias ou No-Show (Não comparecimento): Multa de 40% sobre o valor total do contrato, a título de perdas e danos e lucros cessantes.</p>
<p><strong>5.3. Exceção por Motivo de Saúde:</strong> Caso o cancelamento ocorra por motivo de doença infectocontagiosa ou acidente grave (comprovado por laudo médico idôneo e auditável), a multa da cláusula 5.2 será reduzida pela metade, mantendo-se a retenção da taxa administrativa para cobertura de custos operacionais.</p>
<p><strong>5.4. Pontualidade:</strong> Atrasos superiores a 30 minutos da hora marcada para internação que inviabilizem a grade cirúrgica do hospital serão considerados “No-Show”.</p>`;

const CONTRATO_SECAO_VII = `<h2>VII. POLÍTICA DE REFINAMENTOS (“RETOQUES”)</h2>
<p><strong>CLÁUSULA 6ª.</strong> A necessidade de refinamentos é uma possibilidade descrita na literatura médica e não configura erro técnico.</p>
<p><strong>6.1. Critérios para Isenção:</strong> Caso a equipe médica avalie a necessidade técnica de refinamento após o período de maturação cicatricial (mínimo 6 meses, máximo 12 meses), a CONTRATADA isentará a cobrança de novos honorários médicos SE, E SOMENTE SE:</p>
<p>a) A CONTRATANTE tiver cumprido rigorosamente todas as orientações pós-operatórias e comparecido a todos os retornos;</p>
<p>b) A insatisfação for decorrente de assimetria objetiva ou irregularidade corrigível, e não mera expectativa irreal ou dismorfia corporal.</p>
<p><strong>6.2. Custos do Refinamento:</strong> Mesmo havendo isenção dos honorários médicos (liberalidade), a CONTRATANTE deverá arcar integralmente com as taxas hospitalares, materiais e honorários do anestesista para o procedimento de refinamento.</p>`;

const CONTRATO_ASSINATURA_DIGITAL = `<p><strong>CLÁUSULA 7ª (Assinatura Digital):</strong> As partes reconhecem a validade jurídica deste contrato assinado eletronicamente, via plataforma certificadora, nos termos da MP 2.200-2/2001, considerando-o válido e eficaz para todos os fins de direito.</p>`;

/** Cláusulas FIXAS do termo (verbatim). A IA reproduz sem alterar. */
const TERMO_SECAO_1 = `<h2>1. DECLARAÇÃO DE CIÊNCIA E REALIDADE BIOLÓGICA</h2>
<p>Declaro que fui examinada pela {{MEDICA}} e sua equipe, tendo recebido explicações claras sobre o meu diagnóstico. Compreendo que a cirurgia visa uma melhora estética e funcional, mas que, por se tratar de tecido humano vivo, não existem garantias de resultado exato.</p>
<p>Fui alertada especificamente que NENHUMA FACE É SIMÉTRICA. O lado esquerdo do rosto humano é estruturalmente diferente do direito (ossos, músculos e inserção capilar). A cirurgia busca a harmonia, mas pequenas assimetrias pré-existentes podem persistir ou tornarem-se aparentes após a redução do inchaço.</p>`;

const TERMO_SECAO_2 = `<h2>2. DECLARAÇÃO DE VERACIDADE</h2>
<p>Declaro, sob as penas da lei, que informei à equipe médica, de forma verdadeira e completa, todo o meu histórico de saúde, incluindo: uso de medicamentos (especialmente anticoagulantes, Ozempic/emagrecedores e Roacutan), alergias e tabagismo (cigarro ou Vape).</p>
<p><strong>Parágrafo Único:</strong> Entendo que a omissão dessas informações aumenta drasticamente o risco de necrose de pele, trombose e complicações cardíacas, sendo de minha inteira responsabilidade as consequências legais e biológicas dessa omissão.</p>`;

const TERMO_SECAO_4 = `<h2>4. PROTOCOLO DE SEGURANÇA E RESPONSABILIDADE</h2>
<p>Entendo que o sucesso da cirurgia depende em 50% da técnica médica e 50% dos meus cuidados pós-operatórios. Comprometo-me a não fumar, não me expor ao sol e a seguir o repouso indicado. Estou ciente de que o não envio das fotografias diárias de acompanhamento (conforme Contrato de Prestação de Serviços) será considerado abandono de tratamento da minha parte.</p>`;

const TERMO_SECAO_5 = `<h2>5. RISCOS GERAIS, SISTÊMICOS E IMPREVISIBILIDADE BIOLÓGICA</h2>
<p><strong>5.1. Caráter Exemplificativo:</strong> A paciente declara ciência de que a lista de riscos específicos acima (Item 3) descreve as intercorrências estatisticamente mais relevantes, mas NÃO É EXAUSTIVA. A Medicina não é uma ciência exata e cada organismo possui reações únicas (idiossincrasias) impossíveis de serem previstas em sua totalidade por exames pré-operatórios.</p>
<p><strong>5.2. Riscos Comuns a Qualquer Cirurgia:</strong> Independente da técnica ou local, compreendo que todo ato invasivo envolve riscos gerais, tais como:</p>
<p><strong>Cicatrizes:</strong> Formação de queloides, cicatrizes hipertróficas (alargadas) ou discromias (manchas), que dependem exclusivamente da genética da paciente, independente da habilidade da cirurgiã.</p>
<p><strong>Infecções:</strong> Apesar de todos os protocolos de esterilização, infecções podem ocorrer causadas por bactérias da própria microbiota (pele/mucosa) da paciente.</p>
<p><strong>Reações Sistêmicas:</strong> Alergias a medicamentos ou anestésicos (choque anafilático), Trombose Venosa Profunda (TVP), Embolia Pulmonar e complicações cardiorrespiratórias que, em casos raríssimos, podem levar ao óbito.</p>
<p><strong>5.3. Necessidade de Reintervenção:</strong> Estou ciente de que, caso ocorra alguma intercorrência (como hematoma, acúmulo de líquido ou deiscência de pontos), pode ser necessária a realização de novos procedimentos cirúrgicos de urgência ou reparadores.</p>
<p><strong>5.4. Aceitação do Risco:</strong> Reconheço que estas ocorrências se enquadram no conceito jurídico de Álea Terapêutica (risco inerente ao tratamento) e fortuito externo, isentando a {{MEDICA}} de culpa, desde que a equipe tenha atuado com a diligência técnica necessária.</p>
<p><strong>5.5. Declaração Final de Compreensão:</strong> Declaro que recebi todas as informações em linguagem acessível, tive tempo suficiente para refletir, esclareci todas as minhas dúvidas com a equipe médica e não fui submetida a qualquer pressão para autorizar o(s) procedimento(s) descrito(s) neste termo.</p>`;

const TERMO_SECAO_6_AUTORIZA = `<h2>6. USO DE IMAGEM (LGPD)</h2>
<p>AUTORIZO a captura e uso de minhas imagens (pré e pós-operatórias) para fins de prontuário, bem como para fins científicos, acadêmicos e ilustrativos em site/redes sociais da médica, preservando-se minha identidade sempre que possível.</p>`;

const TERMO_SECAO_6_NAO_AUTORIZA = `<h2>6. USO DE IMAGEM (LGPD)</h2>
<p>NÃO AUTORIZO a captura e uso de minhas imagens para fins científicos, acadêmicos ou ilustrativos em site/redes sociais da médica. Autorizo o registro de imagens exclusivamente para fins de prontuário médico, preservando-se minha identidade.</p>`;

/** Regras de saída HTML comuns aos dois documentos. */
const REGRAS_HTML = `FORMATO DE SAÍDA (OBRIGATÓRIO):
- Responda SOMENTE com o HTML do documento — sem markdown, sem cercas de código, sem comentários, sem texto fora do HTML.
- Use APENAS estas tags: <h1> (título do documento, uma vez), <h2> (títulos de seção), <h3> (subtítulos), <p>, <ul>/<ol>/<li>, <strong>, <em>, <u>, <br>.
- NÃO use tabelas, imagens, links, classes, estilos inline, nem atributos além de eventual alinhamento.
- Todos os dados já vêm preenchidos: NÃO deixe lacunas, "____", "{{...}}", "[a inserir]" nem placeholders. Se um dado opcional não foi informado, omita a menção de forma natural (sem deixar buraco).
- Valores monetários no padrão "R$ 12.125,00 (doze mil, cento e vinte e cinco reais)" — sempre com o valor por extenso entre parênteses.
- Datas por extenso quando o exemplo assim faz (ex.: "23/07/2026 (vinte e três de julho de dois mil e vinte e seis)").`;

// IMPORTANTE: os textos fixos abaixo já estão escritos no FEMININO (verbatim dos
// exemplos). Quando a contratante for do gênero MASCULINO, a IA deve virar TODAS
// as concordâncias — por isso a instrução de flip abaixo, em vez de tokens.
function generoContrato(f: FormularioDocumentoIa): string {
  return f.genero === "masculino"
    ? `CONCORDÂNCIA DE GÊNERO: a contratante é do gênero MASCULINO. Os textos fixos abaixo estão escritos no feminino — vire TODAS as concordâncias para o masculino ao reproduzi-los: "a CONTRATANTE"→"o CONTRATANTE", "da CONTRATANTE"→"do CONTRATANTE", "pela CONTRATANTE"→"pelo CONTRATANTE", "A CONTRATANTE"→"O CONTRATANTE", "a paciente"→"o paciente", "operada"→"operado", "portadora"→"portador", "domiciliada"→"domiciliado", "da paciente"→"do paciente", e todos os demais artigos/particípios. Não deixe nenhuma concordância no feminino.`
    : `CONCORDÂNCIA DE GÊNERO: a contratante é do gênero FEMININO. Os textos fixos abaixo já estão no feminino — reproduza-os exatamente como estão, sem alterar as concordâncias.`;
}

function generoTermo(f: FormularioDocumentoIa): string {
  const medica = `Onde os textos fixos trazem {{MEDICA}}, escreva o nome da médica informado nos dados.`;
  return f.genero === "masculino"
    ? `CONCORDÂNCIA DE GÊNERO: o paciente é do gênero MASCULINO. Os textos fixos abaixo estão escritos no feminino (declarante e particípios) — vire TODAS as concordâncias para o masculino: "examinada"→"examinado", "alertada"→"alertado", "submetida"→"submetido", "a paciente"→"o paciente", "domiciliada"→"domiciliado", e todos os demais artigos/particípios. "ciente" é neutro (mantém). ${medica}`
    : `CONCORDÂNCIA DE GÊNERO: a paciente é do gênero FEMININO. Os textos fixos abaixo já estão no feminino — reproduza-os como estão. ${medica}`;
}

/** Serializa o formulário em um bloco de dados legível para o prompt. */
/**
 * Linha "Médica: Nome (CRM … <sep> RQE …)" resiliente a campos ausentes: monta
 * os parênteses só com o que existe, sem parêntese solto quando falta o CRM.
 * `sep` separa CRM e RQE (contrato usa "|", termo usa "—").
 */
function linhaMedica(f: FormularioDocumentoIa, sep: string): string {
  const crm = f.crm?.trim();
  const rqe = f.rqe?.trim();
  const registro = [crm ? `CRM ${crm}` : "", rqe ? `RQE ${rqe}` : ""]
    .filter(Boolean)
    .join(` ${sep} `);
  return `Médica: ${f.medica}${registro ? ` (${registro})` : ""}`;
}

function dadosContrato(f: FormularioDocumentoIa): string {
  const linhas: string[] = [
    `Nome da contratante: ${f.nome}`,
    `Gênero: ${f.genero}`,
    f.cpf ? `CPF: ${f.cpf}` : "",
    f.rg ? `RG: ${f.rg}` : "",
    f.nascimento ? `Data de nascimento: ${f.nascimento}` : "",
    f.endereco ? `Endereço: ${f.endereco}` : "",
    f.email ? `E-mail: ${f.email}` : "",
    f.telefone ? `Tel/WhatsApp: ${f.telefone}` : "",
    linhaMedica(f, "|"),
    f.cidadeMedica ? `Cidade de atendimento da médica: ${f.cidadeMedica}` : "",
    `Procedimentos contratados: ${f.procedimentos.join(", ") || "(não informado)"}`,
    f.dataProcedimento ? `Data prevista do procedimento: ${f.dataProcedimento}` : "",
    f.localProcedimento ? `Local do procedimento: ${f.localProcedimento}` : "",
    f.valorTotal ? `Valor total dos honorários: ${f.valorTotal}` : "",
    f.valorSinal ? `Sinal / valor já pago: ${f.valorSinal}` : "",
    f.valorSaldo ? `Saldo em aberto: ${f.valorSaldo}` : "",
    f.vencimentoSaldo ? `Vencimento do saldo: ${f.vencimentoSaldo}` : "",
    f.condicoesComerciais
      ? `Condições comerciais (texto livre a expandir na Seção III): ${f.condicoesComerciais}`
      : "",
    f.responsavelFinanceiro ? `Responsável financeiro: ${f.responsavelFinanceiro}` : "",
    f.foro ? `Foro (comarca): ${f.foro}` : "",
    f.cidade ? `Cidade da assinatura: ${f.cidade}` : "",
    f.data ? `Data da assinatura: ${f.data}` : "",
  ];
  return linhas.filter(Boolean).join("\n");
}

function dadosTermo(f: FormularioDocumentoIa): string {
  const linhas: string[] = [
    `Nome do paciente: ${f.nome}`,
    `Gênero: ${f.genero}`,
    f.cpf ? `CPF: ${f.cpf}` : "",
    f.rg ? `RG: ${f.rg}` : "",
    f.nascimento ? `Data de nascimento: ${f.nascimento}` : "",
    f.endereco ? `Endereço: ${f.endereco}` : "",
    f.email ? `E-mail: ${f.email}` : "",
    f.telefone ? `Tel/WhatsApp: ${f.telefone}` : "",
    linhaMedica(f, "—"),
    `Procedimentos: ${f.procedimentos.join(", ") || "(não informado)"}`,
    f.cidade ? `Cidade do registro: ${f.cidade}` : "",
    f.data ? `Data do registro: ${f.data}` : "",
    `Autoriza uso de imagem (LGPD): ${f.autorizaImagem === false ? "NÃO" : "SIM"}`,
  ];
  return linhas.filter(Boolean).join("\n");
}

/** Monta o bloco de riscos por procedimento para a Seção 3 do termo. */
function riscosSelecionados(procedimentos: string[]): string {
  const conhecidos: string[] = [];
  const desconhecidos: string[] = [];
  for (const p of procedimentos) {
    if (RISCOS_POR_PROCEDIMENTO[p]) conhecidos.push(p);
    else desconhecidos.push(p);
  }
  const blocos = conhecidos
    .map((p) => `--- BLOCO CANÔNICO (reproduza LITERALMENTE) para "${p}":\n${RISCOS_POR_PROCEDIMENTO[p]}`)
    .join("\n\n");
  const extra =
    desconhecidos.length > 0
      ? `\n\nPara estes procedimentos NÃO há bloco canônico: ${desconhecidos.join(", ")}. Redija, no MESMO estilo dos blocos acima (título do procedimento em <strong> maiúsculo, seguido de parágrafos "<strong>Nome do risco:</strong> descrição"), um bloco de riscos específicos fiel ao conhecimento médico consolidado para cada um. Não invente riscos sensacionalistas; mantenha o tom técnico e sóbrio dos exemplos.`
      : "";
  return `${blocos}${extra}`;
}

// ---------------------------------------------------------------------------
// PROMPTS EDITÁVEIS (fonte da tela de admin)
//
// Os prompts abaixo são os PADRÕES de código. A equipe pode sobrescrevê-los na
// tela de admin (persistidos em `config_documento_prompt`); quando não há
// customização, estes padrões valem. As partes que dependem dos dados de cada
// paciente ficam como tokens {{...}} que o servidor substitui em tempo de
// geração — o texto fixo (cláusulas, regras de formato, catálogo) fica embutido
// no próprio prompt e, portanto, também é editável na tela.
// ---------------------------------------------------------------------------

/** Tokens que o servidor substitui em cada prompt (validados ao salvar). */
export const TOKENS_CONTRATO = ["CONCORDANCIA_GENERO", "DADOS"] as const;
export const TOKENS_TERMO = [
  "CONCORDANCIA_GENERO",
  "RISCOS_SELECIONADOS",
  "SECAO_6",
  "DADOS",
] as const;
export const TOKENS_REFINO = ["TIPO_DOC"] as const;

/** Descrição amigável de cada token, para a legenda da tela de admin. */
export const DESCRICAO_TOKENS: Record<string, string> = {
  CONCORDANCIA_GENERO:
    "Instrução de concordância de gênero — vira o texto fixo para masculino/feminino conforme o paciente.",
  DADOS: "Bloco com os dados do paciente/contrato preenchidos no formulário.",
  RISCOS_SELECIONADOS:
    "Blocos de risco específicos APENAS dos procedimentos selecionados (Seção 3 do termo).",
  SECAO_6:
    "Seção 6 (LGPD) — texto de AUTORIZA ou NÃO AUTORIZA uso de imagem, conforme a escolha do paciente.",
  TIPO_DOC: "Nome do documento em edição (contrato ou termo).",
};

/** Substitui os tokens {{KEY}} do template pelos valores informados. */
function substituirTokens(
  template: string,
  valores: Record<string, string>,
): string {
  let out = template;
  for (const [chave, valor] of Object.entries(valores)) {
    out = out.split(`{{${chave}}}`).join(valor);
  }
  return out;
}

/**
 * Prompt PADRÃO para GERAR um CONTRATO de prestação de serviços médicos, fiel ao
 * padrão dos contratos-exemplo. Os tokens {{CONCORDANCIA_GENERO}} e {{DADOS}}
 * são preenchidos por `renderPromptContrato`.
 */
export const DEFAULT_PROMPT_CONTRATO = `Você é o redator jurídico da clínica médica (cirurgia oftálmica/óculoplástica) no Brasil. Sua tarefa é redigir um CONTRATO DE PRESTAÇÃO DE SERVIÇOS MÉDICOS ESPECIALIZADOS seguindo FIELMENTE o padrão dos contratos reais da clínica.

REGRAS INEGOCIÁVEIS:
1. NÃO remova nem crie seções/tópicos. O documento tem EXATAMENTE estas 8 seções, nesta ordem, com esta numeração:
   I. IDENTIFICAÇÃO DAS PARTES
   II. DO OBJETO (ESCOPO CONTRATADO)
   III. DO PREÇO E FORMA DE PAGAMENTO
   IV. DA NATUREZA DA OBRIGAÇÃO (OBRIGAÇÃO DE MEIO)
   V. DEVERES DE CONDUTA, COMPLIANCE E MONITORAMENTO
   VI. POLÍTICA DE AGENDAMENTO, CANCELAMENTO E "NO-SHOW"
   VII. POLÍTICA DE REFINAMENTOS ("RETOQUES")
   VIII. DISPOSIÇÕES GERAIS, LGPD E FORO
   Depois, o fecho com cidade/data e os blocos de assinatura.
2. As seções IV, V, VI e VII, a cláusula "Soberania Técnica" (dentro da II) e a "Cláusula 7ª (Assinatura Digital)" (dentro da VIII) são TEXTO FIXO: reproduza-as LITERALMENTE (apenas resolvendo a concordância de gênero indicada). Você só COMPÕE as seções I, II, III e a parte de Foro/fecho da VIII, a partir dos DADOS.
3. Mantenha a numeração das cláusulas coerente (CLÁUSULA 1ª a 8ª e subitens 2.1, 2.2...). Na Seção III, organize os subitens de forma lógica a partir das condições comerciais informadas, no estilo dos exemplos.

{{CONCORDANCIA_GENERO}}

${REGRAS_HTML}

TÍTULO: <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS MÉDICOS ESPECIALIZADOS</h1>

SEÇÃO I — IDENTIFICAÇÃO DAS PARTES (componha a partir dos dados):
- CONTRATADA: KCL CLINIC LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 59.525.443/0001-49, com sede na Rua Casa do Ator, 1117, Vila Olímpia, neste ato representada pela médica informada (com CRM/RQE; se houver cidade de atendimento diferente, cite "com atendimento em <cidade>").
- CONTRATANTE: o(a) paciente, com os dados de identificação informados (nome, CPF, RG se houver, data de nascimento, endereço, e-mail se houver, Tel/WhatsApp).

SEÇÃO II — DO OBJETO:
- CLÁUSULA 1ª com a lista de procedimentos contratados (assinale com "( X )" os contratados dentre a lista padrão: ${PROCEDIMENTOS_CATALOGO.join("; ")}; deixe "(  )" nos não contratados), seguida IMEDIATAMENTE do texto fixo de Soberania Técnica abaixo:
${CONTRATO_SOBERANIA_TECNICA}

SEÇÃO III — DO PREÇO E FORMA DE PAGAMENTO (a parte mais importante a compor):
- Abra com "CLÁUSULA 2ª. ...". Componha os subitens (2.1 Composição/valor dos honorários; descontos aplicados se houver; cronograma de pagamento; validade da condição comercial se houver; cláusulas especiais como exames pré-op, flexibilidade de reagendamento, desconto personalíssimo QUANDO mencionadas nas condições comerciais; data e local previstos do procedimento; exclusão de responsabilidade por custos de terceiros) a partir dos valores e do texto livre de "Condições comerciais". Siga o estilo, o rigor e o tom dos contratos-exemplo. Só inclua as cláusulas especiais que fizerem sentido pelos dados/condições informadas — sem inventar benefícios não mencionados.

SEÇÃO IV (FIXA — reproduza literalmente):
${CONTRATO_SECAO_IV}

SEÇÃO V (FIXA — reproduza literalmente):
${CONTRATO_SECAO_V}

SEÇÃO VI (FIXA — reproduza literalmente; se as condições comerciais previrem ressalva de reembolso por inaptidão/saúde, ajuste apenas a referência cruzada da 5.1 para apontar a cláusula correspondente da Seção III):
${CONTRATO_SECAO_VI}

SEÇÃO VII (FIXA — reproduza literalmente):
${CONTRATO_SECAO_VII}

SEÇÃO VIII — DISPOSIÇÕES GERAIS, LGPD E FORO:
- Comece com a Cláusula 7ª fixa de Assinatura Digital:
${CONTRATO_ASSINATURA_DIGITAL}
- Depois a "CLÁUSULA 8ª." elegendo o Foro da Comarca informada (use o Foro dos dados; se ausente, use a cidade de atendimento da médica), com o texto: "As partes elegem o Foro da Comarca de <comarca> para dirimir quaisquer dúvidas, renunciando a qualquer outro. E por estarem justas e contratadas, firmam o presente, que possui força de Título Executivo Extrajudicial (Art. 784, III, CPC)."
- Fecho: "<Cidade>, <data por extenso>." (use cidade/data informadas).
- Blocos de assinatura (linhas com "_____"): KCL CLINIC LTDA (e nome da médica), a CONTRATANTE (PACIENTE) com o nome, e — SOMENTE se houver responsável financeiro informado — a linha "Assinatura do Responsável Financeiro" com o nome; caso contrário, omita esse terceiro bloco.

DADOS DESTE CONTRATO:
{{DADOS}}`;

/**
 * Prompt PADRÃO para GERAR um TERMO DE CONSENTIMENTO (TCLE). Os tokens
 * {{CONCORDANCIA_GENERO}}, {{RISCOS_SELECIONADOS}}, {{SECAO_6}} e {{DADOS}} são
 * preenchidos por `renderPromptTermo`.
 */
export const DEFAULT_PROMPT_TERMO = `Você é o redator jurídico da clínica médica (cirurgia oftálmica/óculoplástica) no Brasil. Sua tarefa é redigir um TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE) seguindo FIELMENTE o padrão dos termos reais da clínica.

REGRAS INEGOCIÁVEIS:
1. NÃO remova nem crie seções/tópicos. O documento tem EXATAMENTE estas 6 seções numeradas, precedidas do cabeçalho PACIENTE/MÉDICA, nesta ordem:
   Cabeçalho (PACIENTE + MÉDICA)
   1. DECLARAÇÃO DE CIÊNCIA E REALIDADE BIOLÓGICA
   2. DECLARAÇÃO DE VERACIDADE
   3. MAPA DE RISCOS ESPECÍFICOS
   4. PROTOCOLO DE SEGURANÇA E RESPONSABILIDADE
   5. RISCOS GERAIS, SISTÊMICOS E IMPREVISIBILIDADE BIOLÓGICA
   6. USO DE IMAGEM (LGPD)
   Depois, o fecho com cidade/data e os blocos de assinatura.
2. As seções 1, 2, 4, 5 e 6 são TEXTO FIXO: reproduza-as LITERALMENTE (apenas resolvendo a concordância de gênero e o nome da médica). Você só COMPÕE o cabeçalho, a Seção 3 (a partir dos blocos de risco dos procedimentos) e o fecho/assinaturas.

{{CONCORDANCIA_GENERO}}

${REGRAS_HTML}

TÍTULO: <h1>TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO</h1>

CABEÇALHO (componha a partir dos dados):
- "<strong>PACIENTE:</strong> <nome>, ..." com os dados de identificação informados (CPF, RG se houver, data de nascimento, endereço, e-mail se houver, Tel/WhatsApp).
- "<strong>MÉDICA:</strong> <médica> (CRM ... — RQE ...)".

SEÇÃO 1 (FIXA — reproduza literalmente, resolvendo gênero e {{MEDICA}}):
${TERMO_SECAO_1}

SEÇÃO 2 (FIXA — reproduza literalmente):
${TERMO_SECAO_2}

SEÇÃO 3 — MAPA DE RISCOS ESPECÍFICOS:
- Abra com: <h2>3. MAPA DE RISCOS ESPECÍFICOS</h2> e o parágrafo introdutório: "Abaixo, manifesto ciência dos riscos inerentes aos procedimentos que irei realizar. Entendo que estas ocorrências não são “erros médicos”, mas reações biológicas possíveis:"
- Em seguida, os blocos de risco APENAS dos procedimentos selecionados:
{{RISCOS_SELECIONADOS}}

SEÇÃO 4 (FIXA — reproduza literalmente, resolvendo gênero):
${TERMO_SECAO_4}

SEÇÃO 5 (FIXA — reproduza literalmente, resolvendo gênero e {{MEDICA}}):
${TERMO_SECAO_5}

SEÇÃO 6 (FIXA — reproduza literalmente):
{{SECAO_6}}

FECHO E ASSINATURAS:
- "<Cidade>, <data>." — se não houver data informada, use "São Paulo, data do registro eletrônico." (ou a cidade informada).
- Blocos de assinatura (linhas "_____"): o(a) PACIENTE com o nome (rótulo "ASSINATURA DA PACIENTE") e a MÉDICA com o nome e CRM.

DADOS DESTE TERMO:
{{DADOS}}`;

/**
 * Prompt PADRÃO de refino: aplica UMA alteração pedida preservando o resto do
 * documento. O token {{TIPO_DOC}} é preenchido por `renderPromptRefino`.
 */
export const DEFAULT_PROMPT_REFINO = `Você é o redator jurídico da clínica. Recebe o HTML de um {{TIPO_DOC}} já redigido e UMA instrução de alteração do operador. Aplique SOMENTE a alteração pedida, preservando integralmente todo o resto do texto, a estrutura e a numeração.

REGRAS:
- NÃO remova nem crie seções/tópicos que não foram explicitamente pedidos. NÃO reescreva o documento inteiro — mude apenas o necessário para atender à instrução.
- Preserve o tom jurídico e o padrão da clínica.
- ${REGRAS_HTML.replace(/^FORMATO DE SAÍDA \(OBRIGATÓRIO\):\n/, "")}
- Responda SOMENTE com o HTML COMPLETO do documento revisado (o documento inteiro, já com a alteração aplicada), sem comentários.`;

/** Renderiza o prompt do CONTRATO a partir de um template (custom ou padrão). */
export function renderPromptContrato(
  template: string,
  f: FormularioDocumentoIa,
): string {
  return substituirTokens(template, {
    CONCORDANCIA_GENERO: generoContrato(f),
    DADOS: dadosContrato(f),
  });
}

/** Renderiza o prompt do TERMO a partir de um template (custom ou padrão). */
export function renderPromptTermo(
  template: string,
  f: FormularioDocumentoIa,
): string {
  const secao6 =
    f.autorizaImagem === false ? TERMO_SECAO_6_NAO_AUTORIZA : TERMO_SECAO_6_AUTORIZA;
  return substituirTokens(template, {
    CONCORDANCIA_GENERO: generoTermo(f),
    RISCOS_SELECIONADOS: riscosSelecionados(f.procedimentos),
    SECAO_6: secao6,
    DADOS: dadosTermo(f),
  });
}

/** Renderiza o prompt de REFINO a partir de um template (custom ou padrão). */
export function renderPromptRefino(
  template: string,
  tipo: "contrato" | "termo",
): string {
  const doc =
    tipo === "termo"
      ? "TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)"
      : "CONTRATO de prestação de serviços médicos";
  return substituirTokens(template, { TIPO_DOC: doc });
}

/**
 * System prompt para GERAR um CONTRATO usando o PADRÃO de código. Mantida para
 * compatibilidade — a geração real passa pelo template configurável.
 */
export function promptContrato(f: FormularioDocumentoIa): string {
  return renderPromptContrato(DEFAULT_PROMPT_CONTRATO, f);
}

/** System prompt para GERAR um TERMO usando o PADRÃO de código. */
export function promptTermo(f: FormularioDocumentoIa): string {
  return renderPromptTermo(DEFAULT_PROMPT_TERMO, f);
}

/** Prompt de refino usando o PADRÃO de código. */
export function promptRefino(tipo: "contrato" | "termo"): string {
  return renderPromptRefino(DEFAULT_PROMPT_REFINO, tipo);
}
