import type { DocumentoTipo } from "@workspace/db";

/**
 * Modelos-base ÚNICOS de CONTRATO e de TERMO (TCLE) — semente de fábrica.
 *
 * Há um único modelo-base por tipo (não mais um par por procedimento). Os corpos
 * usam variáveis `{{chave}}` (catálogo em `contrato-geracao.ts`), preenchidas com
 * os dados da paciente na hora de gerar. O conteúdo clínico (natureza/riscos/
 * cuidados/alternativas) NÃO é mais embutido por procedimento na semente: ele é
 * COMBINADO em tempo de geração a partir de TODOS os procedimentos da paciente
 * (variáveis `{{naturezaProcedimentos}}`, `{{riscosProcedimentos}}`, etc., que
 * agrupam e identificam cada procedimento). Procedimentos fora do catálogo caem
 * no conteúdo genérico. Assim a vendedora só marca os procedimentos — sem
 * escolher modelo — e o sistema monta as cláusulas clínicas automaticamente.
 *
 * É um PONTO DE PARTIDA jurídico revisável, não um parecer fechado: o modelo-base
 * nasce NÃO vigente e a equipe edita, marca como vigente e sempre aprova antes do
 * envio. `garantirPadrao` (contrato-modelos-repo) é não-sobrescritivo
 * (onConflictDoNothing por tipo+procedimento): NUNCA reescreve o modelo-base que
 * a equipe já editou/marcou como vigente.
 */

/**
 * Procedimento "guarda-chuva" do modelo-base único — não é um procedimento real,
 * mas a chave fixa (tipo, procedimento) sob a qual vive o modelo-base de cada
 * tipo. A rota de geração resolve o modelo por (PROCEDIMENTO_BASE, tipo, vigente).
 */
export const PROCEDIMENTO_BASE = "Todos os procedimentos";

// ---------------------------------------------------------------------------
// Helpers de composição do HTML canônico dos modelos de fábrica.
// O HTML é o formato único compartilhado por editor, geração, revisão e PDF.
// As `{{variáveis}}` são escritas literalmente (NÃO escapadas) para sobreviver à
// substituição — inclusive as cláusulas clínicas combinadas, que já chegam como
// HTML pronto (ver CHAVES_HTML_CONTRATO em contrato-geracao.ts).
// ---------------------------------------------------------------------------

/** Título centralizado em caixa-alta (h1). */
function titulo(texto: string): string {
  return `<h1 style="text-align: center">${texto}</h1>`;
}

/** Subtítulo de cláusula/seção (h2). */
function secao(texto: string): string {
  return `<h2>${texto}</h2>`;
}

/** Parágrafo de corpo (justificado por padrão). */
function par(conteudo: string, align: "justify" | "left" | "center" = "justify"): string {
  return `<p style="text-align: ${align}">${conteudo}</p>`;
}

/** Parágrafo de destaque (cláusula limitativa) — todo em negrito (CDC art. 54). */
function atencao(conteudo: string): string {
  return `<p style="text-align: justify"><strong>${conteudo}</strong></p>`;
}

// ---------------------------------------------------------------------------
// Helpers do MOTOR DE CLÁUSULAS (regiões tipadas). O `<span data-num>` recebe a
// numeração computada na geração (ver contrato-regioes.ts) — o "N" é só um
// placeholder no template. Os `<div data-regiao>` são transparentes no PDF
// (o conversor desce em divs genéricas e ignora atributos desconhecidos).
// ---------------------------------------------------------------------------

/** Cabeçalho de cláusula com número AUTOMÁTICO (renumerado na geração). */
function clausula(rotulo: string): string {
  return `<h2>CLÁUSULA <span data-num="clausula">N</span>ª — ${rotulo}</h2>`;
}

/** Bloco `variante`: o operador/inferência escolhe 1 das opções. */
function variante(
  id: string,
  rotulo: string,
  inferir: string,
  opcoes: { valor: string; label: string; html: string }[],
): string {
  const filhos = opcoes
    .map(
      (o) =>
        `<div data-opcao data-valor="${o.valor}" data-label="${o.label}">${o.html}</div>`,
    )
    .join("");
  return `<div data-regiao="variante" data-id="${id}" data-rotulo="${rotulo}" data-inferir="${inferir}">${filhos}</div>`;
}

/** Bloco `opcional`: incluído ou omitido (renumera o que vem depois). */
function opcional(
  id: string,
  rotulo: string,
  inner: string,
  opts: { inferir?: string; padrao?: "on" | "off" } = {},
): string {
  const attrs = [
    `data-id="${id}"`,
    `data-rotulo="${rotulo}"`,
    opts.inferir ? `data-inferir="${opts.inferir}"` : "",
    opts.padrao ? `data-padrao="${opts.padrao}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<div data-regiao="opcional" ${attrs}>${inner}</div>`;
}

/** Cabeçalho de SEÇÃO romana (I., II., …) — número fixo (as seções não desandam). */
function sec(romano: string, t: string): string {
  return `<h2>${romano}. ${t}</h2>`;
}

/** Cláusula com número AUTOMÁTICO no lead (ex.: "CLÁUSULA 2ª. ..."). */
function clausulaLead(n: string, t: string): string {
  return `<p style="text-align: justify"><strong>CLÁUSULA <span data-num="clausula">${n}</span>ª.</strong> ${t}</p>`;
}

/** Subitem numerado automático (ex.: "2.1. ..."). */
function sub(n: string, t: string): string {
  return `<p style="text-align: justify"><span data-num="sub">${n}</span>. ${t}</p>`;
}

/** Sub-subitem numerado automático (ex.: "2.4.3. ..."). */
function subsub(n: string, t: string): string {
  return `<p style="text-align: justify"><span data-num="subsub">${n}</span>. ${t}</p>`;
}

// ---------------------------------------------------------------------------
// CONTRATO de prestação de serviços médicos — modelo-base fiel ao formato real
// da clínica (transcrito dos contratos KCL de exemplo). As regiões tipadas
// (variantes/opcionais/gênero) e a numeração automática permitem gerar cada
// contrato sem reescrever o boilerplate. É um PONTO DE PARTIDA revisável: nasce
// NÃO vigente e a equipe/jurídico revisa e marca como vigente antes de usar.
// ---------------------------------------------------------------------------

function corpoContratoBase(): string {
  return [
    titulo("CONTRATO DE PRESTAÇÃO DE SERVIÇOS MÉDICOS ESPECIALIZADOS"),

    sec("I", "IDENTIFICAÇÃO DAS PARTES"),
    par(
      "CONTRATADA: KCL CLINIC LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 59.525.443/0001-49, com sede na Rua Casa do Ator, 1117, Vila Olímpia, São Paulo/SP, neste ato representada por {{medica}} (CRM {{crm}} | RQE {{rqe}}).",
      "left",
    ),
    par(
      "CONTRATANTE: {{nome}}, CPF nº {{cpf}}, {{portador}} do RG sob o nº ____________________, DATA DE NASCIMENTO: ____/____/________, residente e {{domiciliada}} à ______________________________________________, E-MAIL: {{email}}, Tel/WhatsApp: {{telefone}}.",
      "left",
    ),

    sec("II", "DO OBJETO (ESCOPO CONTRATADO)"),
    clausulaLead(
      "1",
      "O presente contrato tem por objeto a prestação de serviços médicos especializados (honorários de cirurgião principal e equipe auxiliar direta) para a realização estrita e exclusiva do(s) procedimento(s): {{procedimentos}}.",
    ),
    par(
      "<strong>1. Soberania Técnica:</strong> A CONTRATADA reserva-se o direito de suspender ou adiar o procedimento, inclusive no dia agendado, caso {{contratante}} apresente condições clínicas adversas (ex.: hipertensão descontrolada, gripe, febre, lesões de pele ativas) ou descumpra o jejum obrigatório.",
    ),
    par(
      "<strong>Parágrafo Único:</strong> Nestes casos, motivados por segurança {{da}} ou descumprimento de preparo, serão cobrados os custos de mobilização da equipe (taxa de sala/hora parada), não se aplicando reembolso.",
    ),

    sec("III", "DO PREÇO E FORMA DE PAGAMENTO"),
    clausulaLead(
      "2",
      "Pelos serviços profissionais médicos (honorários da cirurgiã e auxiliares diretos), {{contratante}} pagará o valor líquido e certo, conforme as condições comerciais abaixo:",
    ),
    sub(
      "2.1",
      "<strong>Composição e valor dos honorários médicos.</strong> Os honorários referem-se ao(s) procedimento(s): {{procedimentos}}. VALOR ORIGINAL DOS HONORÁRIOS MÉDICOS: R$ ____________. Após os descontos aplicados (ex.: pagamento à vista e/ou reembolso da consulta), o VALOR FINAL DOS HONORÁRIOS MÉDICOS é de R$ ____________.",
    ),
    sub(
      "2.2",
      "<strong>Cronograma de pagamento.</strong> {{contratante}} pagará: (a) a título de sinal, {{valorPago}} na presente data, condição para a reserva e o agendamento do procedimento; e (b) o saldo restante de {{valorPendente}}, a ser pago até {{dataPagamento}}, via PIX ou cartão de crédito.",
    ),
    subsub(
      "2.2.1",
      "Em caso de pagamento por cartão de crédito, eventuais taxas operacionais cobradas pela administradora são de responsabilidade exclusiva {{da}}. A falta de pagamento de qualquer parcela junto à operadora não exime {{contratante}} da quitação perante a CONTRATADA, aplicando-se multa de 2% (dois por cento) e juros de 1% (um por cento) ao mês, além do vencimento antecipado das parcelas vincendas.",
    ),
    subsub(
      "2.2.2",
      "A falta de pagamento do saldo restante no prazo previsto implicará a possibilidade de suspensão ou cancelamento do procedimento cirúrgico, sem prejuízo das penalidades da Cláusula 5ª.",
    ),
    opcional(
      "exames",
      "Exames pré-operatórios (devolução por inaptidão)",
      sub(
        "2.3",
        "<strong>Cláusula especial — exames pré-operatórios.</strong> {{contratante}} realizará exames pré-operatórios, conforme indicação médica, como condição de segurança para a realização do procedimento cirúrgico.",
      ) +
        subsub(
          "2.3.1",
          "<strong>Devolução integral por inaptidão clínica.</strong> Caso os exames apontem qualquer condição que contraindique ou inviabilize o procedimento, comprovada por LAUDO MÉDICO IDÔNEO, a CONTRATADA DEVOLVERÁ INTEGRALMENTE os valores pagos, incluindo a taxa administrativa de 10% prevista na Cláusula 5.1, em caráter excepcional e exclusivamente nesta hipótese, no prazo de até 7 (sete) dias úteis a contar da apresentação do laudo.",
        ) +
        subsub(
          "2.3.2",
          "<strong>Reagendamento por inaptidão temporária — sem prejuízo.</strong> Sendo a inaptidão temporária e passível de tratamento prévio, as partes poderão optar, em comum acordo, pelo REAGENDAMENTO da cirurgia, SEM QUALQUER PREJUÍZO FINANCEIRO {{ao}} e sem perda das condições comerciais pactuadas.",
        ),
      { inferir: "examesPadrao", padrao: "on" },
    ),
    opcional(
      "flexReagendamento",
      "Flexibilidade de reagendamento / cancelamento por saúde",
      sub(
        "2.4",
        "<strong>Flexibilidade de reagendamento — sem prejuízo.</strong> Em caráter excepcional, {{contratante}} poderá solicitar o REAGENDAMENTO da data cirúrgica em razão de compromissos pessoais ou profissionais supervenientes, SEM QUALQUER PREJUÍZO FINANCEIRO ou perda das condições comerciais, observada a disponibilidade do centro cirúrgico e da agenda da equipe médica.",
      ) +
        sub(
          "2.5",
          "<strong>Cancelamento ou reagendamento por motivo de saúde — sem prejuízo.</strong> Caso {{contratante}} apresente problema de saúde que o impeça de realizar o procedimento na data agendada, comprovado por LAUDO MÉDICO IDÔNEO, poderá reagendar ou CANCELAR com direito à DEVOLUÇÃO INTEGRAL dos valores pagos, incluindo a taxa administrativa de 10% prevista na Cláusula 5.1.",
        ),
      { inferir: "flexPadraoOff", padrao: "off" },
    ),
    sub(
      "2.6",
      "<strong>Data e horário previstos para o procedimento.</strong> A data prevista para a realização do procedimento é {{data}}, às {{horario}}, no {{local}}, SUJEITA À DISPONIBILIDADE do centro cirúrgico e da agenda da equipe médica da {{medica}}. Eventual reagendamento por indisponibilidade do centro cirúrgico ou da equipe será comunicado com a maior antecedência possível, sem prejuízo financeiro nem perda das condições comerciais.",
    ),
    sub(
      "2.7",
      "O orçamento ora pactuado, no que se refere aos honorários médicos, NÃO sofrerá reajustes até a data efetiva de realização do procedimento.",
    ),
    sub(
      "2.8",
      "<strong>Exclusão de responsabilidade — custos de terceiros.</strong> {{contratante}} declara ciência inequívoca de que o valor pactuado refere-se EXCLUSIVAMENTE aos honorários da equipe médica. Custos hospitalares e de terceiros devem ser pagos DIRETAMENTE aos respectivos prestadores, isentando a CONTRATADA de qualquer gestão, tributação ou responsabilidade sobre:",
    ) +
      "<ul>" +
      "<li>Hospital/Clínica Dia: taxas de sala, pernoite, materiais, fios e medicamentos;</li>" +
      "<li>Anestesiologia: honorários pagos diretamente ao médico anestesista (contrato autônomo);</li>" +
      "<li>Pós-operatório: medicamentos domiciliares, cintas, malhas, drenagens linfáticas e exames pré e pós-operatórios.</li>" +
      "</ul>",

    sec("IV", "DA NATUREZA DA OBRIGAÇÃO (OBRIGAÇÃO DE MEIO)"),
    clausulaLead(
      "3",
      "A Medicina não é uma ciência exata. A CONTRATADA assume obrigação de MEIO e não de RESULTADO.",
    ),
    sub(
      "3.1",
      "<strong>Subjetividade e aleatoriedade.</strong> {{contratante}} declara compreender que o resultado cirúrgico depende de fatores biológicos intrínsecos e incontroláveis pela médica, tais como genética, qualidade da pele, produção individual de colágeno, idade, tabagismo e resposta cicatricial (queloides/fibroses).",
    ),
    sub(
      "3.2",
      "<strong>Expectativa de resultado.</strong> A CONTRATADA não garante a “perfeição”, a simetria absoluta (inexistente na natureza humana) ou resultados idênticos a fotos de “antes e depois” de outras pacientes ou de modelos de redes sociais. A cirurgia visa à melhora e à harmonia, dentro das limitações anatômicas {{da}}.",
    ),

    sec("V", "DEVERES DE CONDUTA, COMPLIANCE E MONITORAMENTO"),
    clausulaLead("4", "O sucesso do tratamento depende da estrita colaboração {{da}}."),
    sub(
      "4.1",
      "<strong>Monitoramento digital (obrigatório).</strong> Nos primeiros 07 (sete) dias do pós-operatório, {{contratante}} obriga-se a enviar 01 (uma) fotografia diária da região operada para o WhatsApp oficial da Clínica, para controle de evolução.",
    ),
    sub(
      "4.2",
      "<strong>Limitação do WhatsApp (NÃO É EMERGÊNCIA).</strong> O canal de WhatsApp destina-se a orientações de rotina em horário comercial. EM CASO DE URGÊNCIA (dor intensa, sangramento volumoso, febre alta, falta de ar), {{contratante}} deve dirigir-se IMEDIATAMENTE ao Pronto-Socorro Hospitalar onde foi {{operada}} ou ao mais próximo, não devendo aguardar resposta por mensagem.",
    ),
    sub(
      "4.3",
      "<strong>Consequência do descumprimento.</strong> A falta de envio das fotos, a omissão de sintomas, a exposição solar indevida ou o não comparecimento aos retornos caracterizará CULPA EXCLUSIVA DA VÍTIMA e abandono de tratamento, isentando a equipe médica de responsabilidade por complicações decorrentes dessa desídia.",
    ),

    sec("VI", "POLÍTICA DE AGENDAMENTO, CANCELAMENTO E “NO-SHOW”"),
    clausulaLead(
      "5",
      "O agendamento cirúrgico bloqueia a agenda da equipe e a sala cirúrgica, gerando custos prévios e impedindo o atendimento de outros pacientes.",
    ),
    variante("clausula51", "Cláusula 5.1 — Taxa administrativa", "taxaAdmin51", [
      {
        valor: "inaptidao",
        label: "Ressalva de inaptidão clínica",
        html: sub(
          "5.1",
          "<strong>Taxa administrativa.</strong> Do valor total do contrato, 10% (dez por cento) refere-se a taxas administrativas de pré-agendamento e reserva, sendo este valor NÃO REEMBOLSÁVEL em qualquer hipótese de cancelamento, RESSALVADA EXCLUSIVAMENTE a hipótese de inaptidão clínica comprovada por exames pré-operatórios. A referida taxa encontra-se retida dentro do valor já pago.",
        ),
      },
      {
        valor: "saude",
        label: "Ressalva de saúde (cancelamento definitivo)",
        html: sub(
          "5.1",
          "<strong>Taxa administrativa.</strong> Do valor total do contrato, 10% (dez por cento) refere-se a taxas administrativas de pré-agendamento e reserva, sendo este valor NÃO REEMBOLSÁVEL em qualquer hipótese de cancelamento definitivo, RESSALVADA EXCLUSIVAMENTE a hipótese de cancelamento por motivo de saúde comprovado por laudo médico idôneo. A referida taxa encontra-se retida dentro do valor já pago.",
        ),
      },
      {
        valor: "sem-ressalva",
        label: "Sem ressalva (retida no sinal)",
        html: sub(
          "5.1",
          "<strong>Taxa administrativa.</strong> Do valor total do contrato, 10% (dez por cento) refere-se a taxas administrativas de pré-agendamento e reserva, sendo este valor NÃO REEMBOLSÁVEL em qualquer hipótese de cancelamento. A referida taxa encontra-se retida dentro do sinal pago.",
        ),
      },
    ]),
    sub(
      "5.2",
      "<strong>Multas por cancelamento (deduzida a taxa administrativa).</strong> Em caso de desistência por parte {{da}}, aplicam-se as seguintes penalidades sobre o saldo restante:",
    ) +
      "<ul>" +
      "<li>Até 21 dias antes da cirurgia: isento de multa (apenas retenção da taxa administrativa de 10%);</li>" +
      "<li>Entre 20 e 08 dias antes: multa de 20% sobre o valor total do contrato;</li>" +
      "<li>Menos de 07 dias ou No-Show (não comparecimento): multa de 40% sobre o valor total do contrato, a título de perdas e danos e lucros cessantes.</li>" +
      "</ul>",
    sub(
      "5.3",
      "<strong>Exceção por motivo de saúde.</strong> Caso o cancelamento ocorra por motivo de doença infectocontagiosa ou acidente grave (comprovado por laudo médico idôneo e auditável), a multa acima será reduzida pela metade, mantendo-se a retenção da taxa administrativa para cobertura de custos operacionais.",
    ),
    sub(
      "5.4",
      "<strong>Pontualidade.</strong> Atrasos superiores a 30 minutos da hora marcada para internação que inviabilizem a grade cirúrgica do hospital serão considerados “No-Show”.",
    ),

    sec("VII", "POLÍTICA DE REFINAMENTOS (“RETOQUES”)"),
    clausulaLead(
      "6",
      "A necessidade de refinamentos é uma possibilidade descrita na literatura médica e não configura erro técnico.",
    ),
    sub(
      "6.1",
      "<strong>Critérios para isenção.</strong> Caso a equipe médica avalie a necessidade técnica de refinamento após o período de maturação cicatricial (mínimo 6 meses, máximo 12 meses), a CONTRATADA isentará a cobrança de novos honorários médicos SE, E SOMENTE SE: (a) {{contratante}} tiver cumprido rigorosamente todas as orientações pós-operatórias e comparecido a todos os retornos; e (b) a insatisfação for decorrente de assimetria objetiva ou irregularidade corrigível, e não de mera expectativa irreal ou dismorfia corporal.",
    ),
    sub(
      "6.2",
      "<strong>Custos do refinamento.</strong> Mesmo havendo isenção dos honorários médicos (liberalidade), {{contratante}} deverá arcar integralmente com as taxas hospitalares, materiais e honorários do anestesista para o procedimento de refinamento.",
    ),

    sec("VIII", "DISPOSIÇÕES GERAIS, LGPD E FORO"),
    clausulaLead(
      "7",
      "<strong>(Assinatura Digital)</strong> As partes reconhecem a validade jurídica deste contrato assinado eletronicamente, via plataforma certificadora, nos termos da MP 2.200-2/2001, considerando-o válido e eficaz para todos os fins de direito.",
    ),
    variante("foro", "Foro", "foroPorMedica", [
      {
        valor: "sao-paulo",
        label: "São Paulo/SP",
        html: clausulaLead(
          "8",
          "As partes elegem o Foro da Comarca de São Paulo/SP para dirimir quaisquer dúvidas, renunciando a qualquer outro. E por estarem justas e contratadas, firmam o presente, que possui força de Título Executivo Extrajudicial (Art. 784, III, CPC).",
        ),
      },
      {
        valor: "campinas",
        label: "Campinas/SP",
        html: clausulaLead(
          "8",
          "As partes elegem o Foro da Comarca de Campinas/SP para dirimir quaisquer dúvidas, renunciando a qualquer outro. E por estarem justas e contratadas, firmam o presente, que possui força de Título Executivo Extrajudicial (Art. 784, III, CPC).",
        ),
      },
    ]),
    par(
      "______________________, ______ de ____________________ de ________.",
      "left",
    ),
    par("_______________________________________________", "left"),
    par("KCL CLINIC LTDA — {{medica}}", "left"),
    par("_______________________________________________", "left"),
    par("{{nome}} — CONTRATANTE (PACIENTE)", "left"),
    par("_______________________________________________", "left"),
    par("Assinatura do Responsável Financeiro (se houver)", "left"),
  ].join("");
}

// ---------------------------------------------------------------------------
// TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)
// ---------------------------------------------------------------------------

function corpoTermoBase(): string {
  return [
    titulo("TERMO DE CONSENTIMENTO LIVRE E ESCLARECIDO (TCLE)"),
    par("PACIENTE: {{nome}}, inscrita no CPF sob o n\u00ba {{cpf}}.", "left"),
    par(
      "REPRESENTANTE LEGAL (quando aplic\u00e1vel): ____________________________ \u2014 preencher nome, CPF e grau de parentesco/representa\u00e7\u00e3o quando a paciente for menor de idade ou legalmente incapaz. Nesse caso, o consentimento \u00e9 manifestado pelo(a) representante legal, sem preju\u00edzo do assentimento da paciente sempre que poss\u00edvel.",
    ),
    par("M\u00c9DICA RESPONS\u00c1VEL: {{medica}} (CRM {{crm}} \u00b7 RQE {{rqe}}), {{clinica}}.", "left"),
    par("PROCEDIMENTO(S): {{procedimentos}}, previsto(s) para {{data}}, \u00e0s {{horario}}, no {{local}}.", "left"),
    secao("1. NATUREZA E OBJETIVO DO PROCEDIMENTO"),
    "{{naturezaProcedimentos}}",
    par(
      "Declaro que a m\u00e9dica me explicou, em linguagem acess\u00edvel, em que consiste o procedimento, sua finalidade e o que esperar dele.",
    ),
    secao("2. T\u00c9CNICA, DURA\u00c7\u00c3O E ANESTESIA"),
    par(
      "O procedimento \u00e9 realizado em ambiente cir\u00fargico adequado, com a t\u00e9cnica cir\u00fargica indicada para o meu caso, conforme me foi explicado. A dura\u00e7\u00e3o estimada e o tipo de anestesia (local, seda\u00e7\u00e3o e/ou geral) variam de acordo com o caso e podem ser ajustados durante o ato. A anestesia \u00e9 conduzida por equipe especializada ({{equipe}}) e possui riscos pr\u00f3prios, incluindo rea\u00e7\u00f5es a medicamentos e, raramente, complica\u00e7\u00f5es graves, detalhados em TERMO DE ANESTESIA espec\u00edfico, fornecido pela respectiva equipe. Fui orientada a relatar alergias, doen\u00e7as e medicamentos em uso.",
    ),
    secao("3. RISCOS E COMPLICA\u00c7\u00d5ES POSS\u00cdVEIS"),
    par(
      "Estou ciente de que todo ato cir\u00fargico envolve riscos. No caso deste(s) procedimento(s), os principais riscos incluem, sem se limitar a:",
    ),
    "{{riscosProcedimentos}}",
    par(
      "Compreendo que complica\u00e7\u00f5es podem exigir tratamentos adicionais, nova cirurgia e que, em casos raros, podem ser graves. Os riscos pr\u00f3prios da anestesia constam do termo de anestesia espec\u00edfico, fornecido pela respectiva equipe.",
    ),
    secao("4. ALTERNATIVAS DE TRATAMENTO"),
    par("Fui informada das alternativas ao procedimento proposto, incluindo:"),
    "{{alternativasProcedimentos}}",
    secao("5. BENEF\u00cdCIOS ESPERADOS E EXPECTATIVAS"),
    par(
      "Compreendo os benef\u00edcios esperados do procedimento e que eles correspondem a uma EXPECTATIVA REALISTA, e n\u00e3o a uma promessa. A medicina \u00e9 uma OBRIGA\u00c7\u00c3O DE MEIO, e n\u00e3o de resultado: a equipe empregar\u00e1 os melhores esfor\u00e7os t\u00e9cnicos, sem garantia de um resultado est\u00e9tico ou funcional espec\u00edfico. Os resultados variam conforme as caracter\u00edsticas individuais e a cicatriza\u00e7\u00e3o de cada pessoa. Declaro estar ciente de que eventuais fotos, imagens ou simula\u00e7\u00f5es que me tenham sido apresentadas s\u00e3o meramente ILUSTRATIVAS e n\u00e3o constituem promessa ou garantia de resultado.",
    ),
    secao("6. CUIDADOS PR\u00c9 E P\u00d3S-OPERAT\u00d3RIOS"),
    par("Comprometo-me a seguir as orienta\u00e7\u00f5es, em especial:"),
    "{{cuidadosProcedimentos}}",
    secao("7. D\u00daVIDAS E ESCLARECIMENTOS"),
    par(
      "Tive a oportunidade de registrar minhas d\u00favidas e de receb\u00ea-las esclarecidas. Espa\u00e7o aberto para d\u00favidas e respectivos esclarecimentos:",
    ),
    par("____________________________________________________________________", "left"),
    par("____________________________________________________________________", "left"),
    atencao(
      'ATEN\u00c7\u00c3O: Os campos acima devem ser preenchidos \u2014 ou expressamente assinalados como "sem d\u00favidas" \u2014 antes da assinatura. Um termo com os campos de d\u00favidas em branco, sem essa indica\u00e7\u00e3o, pode ser considerado inv\u00e1lido por falta de esclarecimento efetivo.',
    ),
    secao("8. AUTORIZA\u00c7\u00c3O DE IMAGEM (OPCIONAL)"),
    par(
      "A capta\u00e7\u00e3o de imagens para o prontu\u00e1rio e o acompanhamento cl\u00ednico faz parte do cuidado. O uso de imagens para fins cient\u00edficos, educacionais ou de divulga\u00e7\u00e3o \u00e9 OPCIONAL, depende da minha autoriza\u00e7\u00e3o e pode ser revogado a qualquer tempo. Assinale:",
    ),
    par("( ) AUTORIZO o uso de imagens, preservado o anonimato sempre que poss\u00edvel.", "left"),
    par("( ) N\u00c3O AUTORIZO o uso de imagens para fins de divulga\u00e7\u00e3o.", "left"),
    secao("9. PROTE\u00c7\u00c3O DE DADOS (LGPD)"),
    par(
      "Meus dados pessoais e de sa\u00fade ser\u00e3o tratados com sigilo, exclusivamente para a finalidade do meu cuidado e o cumprimento de obriga\u00e7\u00f5es legais, nos termos da Lei n\u00ba 13.709/2018 (LGPD), tendo como base legal a tutela da sa\u00fade por profissional de sa\u00fade. O uso para finalidade secund\u00e1ria (ex.: marketing) depende de consentimento espec\u00edfico e destacado.",
    ),
    secao("10. DECLARA\u00c7\u00c3O DE CONSENTIMENTO LIVRE E ESCLARECIDO"),
    par(
      "Declaro que li (ou me foi lido) este termo, que tive a oportunidade de fazer perguntas e que todas foram respondidas de forma satisfat\u00f3ria. Declaro ainda que CONSINTO LIVREMENTE com a realiza\u00e7\u00e3o do(s) procedimento(s) e que estou ciente de que posso RETIRAR este consentimento a qualquer momento antes do procedimento, sem preju\u00edzo do meu atendimento.",
    ),
    secao("RUBRICA E DATA POR P\u00c1GINA"),
    par(
      "Para garantir a leitura integral, este termo deve ser rubricado em todas as p\u00e1ginas e datado pela paciente (ou pelo representante legal):",
    ),
    par("Rubrica: __________________     Data: ____/____/______", "left"),
    par(
      "NOTA OPERACIONAL (uso da equipe \u2014 n\u00e3o substitui o esclarecimento \u00e0 paciente): entregar este termo com ANTECED\u00caNCIA, garantindo tempo para leitura e reflex\u00e3o, NUNCA na v\u00e9spera ou no momento da cirurgia. Registrar no prontu\u00e1rio que o esclarecimento verbal tamb\u00e9m foi prestado, com data e respons\u00e1vel.",
    ),
    par("Assinatura eletr\u00f4nica (com validade jur\u00eddica e identifica\u00e7\u00e3o por CPF/e-mail):", "left"),
    par("{{nome}} \u2014 CPF {{cpf}}", "left"),
    par("{{medica}} \u2014 CRM {{crm}} \u00b7 RQE {{rqe}}", "left"),
  ].join("");
}

export interface ModeloPadrao {
  tipo: DocumentoTipo;
  procedimento: string;
  titulo: string;
  corpo: string;
}

/**
 * Semente: um único modelo-base de CONTRATO e um de TERMO, ambos sob o
 * procedimento "guarda-chuva" {@link PROCEDIMENTO_BASE}. As cláusulas clínicas
 * são combinadas em tempo de geração a partir dos procedimentos da paciente, de
 * modo que não há mais um par por procedimento. Semeados como NÃO vigentes — a
 * equipe revisa o conteúdo e marca como vigente antes de poder gerar documentos
 * (a rota de geração recusa modelos não vigentes), garantindo a etapa humana já
 * na origem.
 */
export const MODELOS_PADRAO: ModeloPadrao[] = [
  {
    tipo: "contrato",
    procedimento: PROCEDIMENTO_BASE,
    titulo: "Contrato de prestação de serviços médicos",
    corpo: corpoContratoBase(),
  },
  {
    tipo: "termo",
    procedimento: PROCEDIMENTO_BASE,
    titulo: "Termo de Consentimento Livre e Esclarecido (TCLE)",
    corpo: corpoTermoBase(),
  },
];

/**
 * Texto de fábrica ATUAL para um (tipo, procedimento). Usado para "restaurar ao
 * modelo de fábrica" o modelo-base já semeado: como `garantirPadrao` é
 * não-sobrescritivo, esta é a única forma de adotar reforços jurídicos sem
 * copiar o texto à mão. Retorna `undefined` para procedimentos sem par de
 * fábrica (apenas {@link PROCEDIMENTO_BASE} tem).
 */
export function obterModeloPadrao(
  tipo: DocumentoTipo,
  procedimento: string,
): ModeloPadrao | undefined {
  const alvo = procedimento.trim();
  return MODELOS_PADRAO.find(
    (m) => m.tipo === tipo && m.procedimento === alvo,
  );
}

/**
 * Como o texto atual de um modelo se compara ao de fábrica ATUAL:
 * - `null`: sem par de fábrica (procedimento criado manualmente) — não há o que
 *   comparar nem restaurar (a rota de restaurar responde 422 nesses casos);
 * - `"igual"`: título e corpo idênticos à fábrica;
 * - `"desatualizado"`: difere da fábrica — seja por edição da equipe, seja
 *   porque houve atualização jurídica de fábrica ainda não adotada.
 *
 * A comparação é apenas TEXTUAL (título + corpo), independente de `vigente`,
 * para que o indicador na página reflita "o texto está em dia com a fábrica?".
 */
export type StatusFabrica = "igual" | "desatualizado";

export function compararComPadrao(
  tipo: DocumentoTipo,
  procedimento: string,
  titulo: string,
  corpo: string,
): StatusFabrica | null {
  const padrao = obterModeloPadrao(tipo, procedimento);
  if (!padrao) return null;
  return titulo === padrao.titulo && corpo === padrao.corpo
    ? "igual"
    : "desatualizado";
}
