/**
 * Conteúdo jurídico-clínico ESPECÍFICO por procedimento (oculoplástica).
 *
 * Alimenta os modelos-base de CONTRATO e de TERMO (TCLE): cada procedimento tem
 * natureza, riscos, cuidados e alternativas próprios. É um PONTO DE PARTIDA
 * revisável — exige validação médica e jurídica antes de virar a versão vigente.
 * Os modelos são semeados como NÃO vigentes justamente para forçar essa revisão.
 *
 * A clínica é de cirurgia oculoplástica/oftalmológica; o texto reflete os
 * procedimentos mais comuns. Procedimentos fora desta lista (ex.: "Outro" /
 * texto livre) caem no conteúdo GENÉRICO.
 */

export interface ConteudoProcedimento {
  /** Natureza/objetivo do procedimento, em uma a duas frases. */
  natureza: string;
  /** Riscos e complicações possíveis específicos do procedimento. */
  riscos: string[];
  /** Cuidados pré e pós-operatórios mais relevantes. */
  cuidados: string[];
  /** Alternativas de tratamento, incluindo a opção de não operar. */
  alternativas: string[];
}

const RISCOS_GERAIS: string[] = [
  "Sangramento ou hematoma no local operado",
  "Infecção, exigindo curativos, antibióticos ou nova intervenção",
  "Cicatrização inadequada, cicatriz hipertrófica ou queloide",
  "Assimetria entre os lados e necessidade eventual de retoque",
  "Reação a anestésicos, medicamentos ou materiais",
  "Resultado estético/funcional diferente do esperado (sem garantia de resultado)",
];

const CUIDADOS_GERAIS: string[] = [
  "Comparecer em jejum e seguir as orientações pré-operatórias da equipe",
  "Suspender medicamentos/substâncias conforme orientação médica (ex.: anticoagulantes, quando indicado)",
  "Aplicar compressas e manter a cabeceira elevada nas primeiras 48–72h",
  "Evitar esforço físico, sol direto e exposição a calor no período de recuperação",
  "Comparecer aos retornos e relatar qualquer sinal de alerta (dor intensa, sangramento, perda visual)",
];

const ALTERNATIVAS_GERAIS: string[] = [
  "Não realizar o procedimento (conduta expectante), assumindo a manutenção da condição atual",
  "Tratamentos conservadores ou clínicos, quando aplicáveis ao caso",
  "Acompanhamento periódico sem intervenção cirúrgica imediata",
];

/** Conteúdo genérico — usado por procedimentos fora da lista ("Outro"). */
export const CONTEUDO_GENERICO: ConteudoProcedimento = {
  natureza:
    "Procedimento cirúrgico oculoplástico/oftalmológico indicado após avaliação individual, descrito em detalhe pela equipe médica na consulta.",
  riscos: RISCOS_GERAIS,
  cuidados: CUIDADOS_GERAIS,
  alternativas: ALTERNATIVAS_GERAIS,
};

/** Conteúdo por nome de procedimento (deve casar com `PROCEDIMENTO_TEMPLATES`). */
export const CONTEUDO_PROCEDIMENTO: Record<string, ConteudoProcedimento> = {
  Blefaroplastia: {
    natureza:
      "Cirurgia das pálpebras (superiores e/ou inferiores) para remoção do excesso de pele e/ou bolsas de gordura, com finalidade funcional e/ou estética.",
    riscos: [
      "Hematoma ou sangramento periorbitário",
      "Equimose (roxos) e edema (inchaço) prolongados, que podem levar semanas para regredir",
      "Infecção da ferida operatória",
      "Assimetria entre as pálpebras e cicatrizes visíveis",
      "Olho seco, irritação ou sensação de corpo estranho, em geral transitórios",
      "Epífora (lacrimejamento excessivo) e, raramente, lesão das vias lacrimais",
      "Lagoftalmo (dificuldade de fechar completamente a pálpebra) e exposição da córnea",
      "Ectrópio/retração da pálpebra inferior, podendo exigir reabordagem",
      "Diplopia (visão dupla) transitória por edema ou afecção da musculatura ocular",
      "Correção insuficiente ou excessiva de pele/gordura",
      "Hematoma retrobulbar — complicação rara, porém grave, com risco de comprometimento visual permanente, exigindo atendimento de urgência",
    ],
    cuidados: [
      "Compressas frias nas primeiras 48h e cabeceira elevada para reduzir o edema",
      "Uso de colírio/pomada lubrificante conforme prescrição",
      "Evitar esforço, abaixar a cabeça e maquiagem na região operada até liberação",
      "Proteção solar e óculos escuros durante a recuperação",
    ],
    alternativas: [
      "Não operar, mantendo o aspecto e/ou a limitação atual",
      "Procedimentos não cirúrgicos em casos selecionados (ex.: toxina botulínica, preenchimento), com indicação e resultados distintos",
      "Acompanhamento clínico quando houver causa tratável do edema palpebral",
    ],
  },
  "Blefaroplastia com Laser CO₂": {
    natureza:
      "Blefaroplastia combinada com aplicação de laser de CO₂ no mesmo tempo cirúrgico, para tratamento da pele palpebral/periorbitária.",
    riscos: [
      "Todos os riscos da blefaroplastia (hematoma, infecção, assimetria, olho seco, lagoftalmo, ectrópio)",
      "Hiperpigmentação ou hipopigmentação da pele tratada",
      "Eritema (vermelhidão) prolongado e maior tempo de recuperação cutânea",
      "Queimadura, bolhas ou cicatriz decorrentes da energia do laser",
      "Reativação de herpes labial/ocular em pacientes predispostos",
      "Comprometimento visual — complicação rara, porém grave",
    ],
    cuidados: [
      "Fotoproteção rigorosa e suspensão da exposição solar por período prolongado",
      "Hidratação e cuidados específicos com a pele tratada conforme prescrição",
      "Profilaxia antiviral quando indicada (histórico de herpes)",
      "Compressas frias, cabeceira elevada e lubrificação ocular",
    ],
    alternativas: [
      "Blefaroplastia isolada, sem laser",
      "Tratamentos cutâneos não cirúrgicos (peelings, lasers ablativos fracionados em sessões), com resultados distintos",
      "Não realizar o procedimento",
    ],
  },
  "Correção de ptose palpebral": {
    natureza:
      "Cirurgia para correção da queda da pálpebra superior (ptose), reposicionando a margem palpebral para melhorar o campo visual e/ou a simetria.",
    riscos: [
      "Hipocorreção (pálpebra ainda caída) ou hipercorreção (pálpebra muito elevada)",
      "Assimetria de altura ou de contorno entre as pálpebras",
      "Lagoftalmo, olho seco e exposição/lesão da córnea",
      "Alteração do sulco palpebral e da dinâmica de abertura/fechamento",
      "Necessidade de reabordagem cirúrgica para ajuste",
      "Recidiva da ptose ao longo do tempo",
    ],
    cuidados: [
      "Lubrificação ocular intensiva, sobretudo se houver dificuldade de fechar o olho",
      "Compressas frias e cabeceira elevada nas primeiras 48–72h",
      "Observar e relatar sinais de exposição corneana (ardência, vermelhidão, baixa de visão)",
      "Comparecer aos retornos para avaliação do ajuste de altura",
    ],
    alternativas: [
      "Não operar, convivendo com a queda palpebral e eventual limitação do campo visual",
      "Tratamento da causa de base, quando identificada (ex.: causas neurológicas/miogênicas)",
      "Uso de prótese/óculos com suporte palpebral em casos selecionados",
    ],
  },
  Cantoplastia: {
    natureza:
      "Cirurgia de reposicionamento e fixação do canto do olho (lateral e/ou medial) para correção funcional e/ou estética da fenda palpebral.",
    riscos: [
      "Assimetria entre os cantos e alteração do formato da fenda palpebral",
      "Arredondamento ou encurtamento indesejado da fenda",
      "Recidiva da frouxidão e necessidade de reabordagem",
      "Granuloma, irritação ocular ou desconforto local",
      "Epífora (lacrimejamento excessivo) ou olho seco",
      "Cicatriz visível no canto operado",
    ],
    cuidados: [
      "Compressas e higiene local conforme orientação",
      "Evitar tração, coçar ou pressionar a região do canto operado",
      "Lubrificação ocular se houver irritação",
      "Comparecer aos retornos para acompanhamento da cicatrização",
    ],
    alternativas: [
      "Não operar, mantendo a condição atual",
      "Medidas conservadoras para sintomas de olho seco/irritação, sem correção da estrutura",
      "Acompanhamento periódico",
    ],
  },
  "Exérese de lesão palpebral": {
    natureza:
      "Remoção cirúrgica de lesão ou tumor da pálpebra, podendo incluir reconstrução e envio do material para exame anatomopatológico.",
    riscos: [
      "Recidiva da lesão, especialmente se as margens estiverem comprometidas",
      "Necessidade de reconstrução e/ou de nova cirurgia conforme o resultado do anatomopatológico",
      "Cicatriz e alteração da margem ou do contorno palpebral",
      "Triquíase (cílios mal posicionados) e irritação ocular",
      "Infecção, sangramento e assimetria",
      "Resultado anatomopatológico que indique doença mais extensa do que o previsto",
    ],
    cuidados: [
      "Cuidados com o curativo e a ferida conforme orientação",
      "Comparecer ao retorno para retirada de pontos e leitura do resultado anatomopatológico",
      "Relatar sinais de recidiva, infecção ou irritação ocular",
      "Proteção solar sobre a cicatriz",
    ],
    alternativas: [
      "Não operar, com acompanhamento da lesão (quando seguro segundo avaliação médica)",
      "Biópsia incisional prévia em casos selecionados, antes da remoção completa",
      "Tratamentos não cirúrgicos quando aplicáveis ao tipo de lesão",
    ],
  },
};

/** Retorna o conteúdo do procedimento, caindo no genérico quando desconhecido. */
export function obterConteudoProcedimento(nome: string): ConteudoProcedimento {
  return CONTEUDO_PROCEDIMENTO[nome.trim()] ?? CONTEUDO_GENERICO;
}

/** Renderiza uma lista de itens como bullets de texto (• item). */
export function listaBullets(itens: string[]): string {
  return itens.map((i) => `• ${i}`).join("\n");
}
