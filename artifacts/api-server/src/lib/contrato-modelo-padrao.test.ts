import { describe, expect, it } from "vitest";
import {
  MODELOS_PADRAO,
  PROCEDIMENTO_BASE,
  compararComPadrao,
  obterModeloPadrao,
  type ModeloPadrao,
} from "./contrato-modelo-padrao";
import {
  VARIAVEIS_CONTRATO,
  variaveisNaoResolvidas,
  gerarRascunhoContrato,
  gerarPreviaContrato,
} from "./contrato-geracao";
import { CONTEUDO_PROCEDIMENTO } from "./documento-procedimento-conteudo";
import type { Paciente } from "@workspace/db";

function achar(tipo: "contrato" | "termo"): ModeloPadrao {
  const m = MODELOS_PADRAO.find(
    (x) => x.tipo === tipo && x.procedimento === PROCEDIMENTO_BASE,
  );
  expect(m, `modelo-base de ${tipo}`).toBeTruthy();
  return m!;
}

describe("MODELOS_PADRAO — invariantes da semente", () => {
  it("semeia exatamente um modelo-base por tipo (contrato e termo)", () => {
    const contratos = MODELOS_PADRAO.filter((m) => m.tipo === "contrato");
    const termos = MODELOS_PADRAO.filter((m) => m.tipo === "termo");
    expect(contratos).toHaveLength(1);
    expect(termos).toHaveLength(1);
    // O único par de fábrica é o procedimento "guarda-chuva".
    expect(contratos[0].procedimento).toBe(PROCEDIMENTO_BASE);
    expect(termos[0].procedimento).toBe(PROCEDIMENTO_BASE);
  });

  it("só usa variáveis {{...}} do catálogo do contrato (nada fica sem valor)", () => {
    const chavesValidas = new Set<string>(VARIAVEIS_CONTRATO.map((v) => v.chave));
    for (const m of MODELOS_PADRAO) {
      for (const chave of [
        ...variaveisNaoResolvidas(m.corpo),
        ...variaveisNaoResolvidas(m.titulo),
      ]) {
        expect(
          chavesValidas.has(chave),
          `variável {{${chave}}} em "${m.titulo}" deve existir no catálogo`,
        ).toBe(true);
      }
    }
  });

  it("as cláusulas clínicas do TCLE entram por variáveis combinadas", () => {
    // Natureza/riscos/cuidados/alternativas são montados a partir dos
    // procedimentos da paciente — o TERMO só referencia as variáveis. (O
    // contrato KCL não traz o conteúdo clínico; ele vive no TCLE.)
    const termo = achar("termo").corpo;
    expect(termo).toContain("{{naturezaProcedimentos}}");
    expect(termo).toContain("{{riscosProcedimentos}}");
    expect(termo).toContain("{{cuidadosProcedimentos}}");
    expect(termo).toContain("{{alternativasProcedimentos}}");
  });
});

describe("Reforços do parecer — conteúdo clínico da blefaroplastia", () => {
  it("amplia os riscos da blefaroplastia com os itens do parecer", () => {
    const riscos = CONTEUDO_PROCEDIMENTO["Blefaroplastia"].riscos.join(" \n ");
    expect(riscos).toMatch(/equimose/i);
    expect(riscos).toMatch(/ed[e|ê]ma/i);
    expect(riscos).toMatch(/epífora/i);
    expect(riscos).toMatch(/diplopia/i);
    expect(riscos).toMatch(/vias? lacrima/i);
    expect(riscos).toMatch(/retrobulbar/i);
  });
});

describe("Modelo-base de contrato — formato KCL (fiel aos exemplos reais)", () => {
  const contrato = () => achar("contrato").corpo;

  it("identifica as partes (KCL) e traz Soberania Técnica no objeto", () => {
    const c = contrato();
    expect(c).toMatch(/KCL CLINIC LTDA/);
    expect(c).toMatch(/59\.525\.443\/0001-49/);
    expect(c).toMatch(/Soberania Técnica/i);
    expect(c).toContain("{{procedimentos}}");
  });

  it("discrimina os custos de terceiros (hospital, anestesia, pós-operatório)", () => {
    const c = contrato();
    expect(c).toMatch(/custos de terceiros/i);
    expect(c).toMatch(/Hospital\/Clínica Dia/i);
    expect(c).toMatch(/Anestesiologia/i);
    expect(c).toMatch(/Pós-operatório/i);
  });

  it("traz a política de cancelamento com No-Show e taxa administrativa", () => {
    const c = contrato();
    expect(c).toMatch(/No-Show/i);
    expect(c).toMatch(/taxa administrativa/i);
    expect(c).toMatch(/40%/);
  });

  it("cobra multa/juros do cartão (2% + 1%)", () => {
    const c = contrato();
    expect(c).toMatch(/2%/);
    expect(c).toMatch(/1%/);
  });

  it("reconhece a assinatura eletrônica (MP 2.200-2/2001)", () => {
    const c = contrato();
    expect(c).toMatch(/eletronicamente/i);
    expect(c).toMatch(/2\.200-2/);
    expect(c).toMatch(/validade jurídica/i);
  });

  it("mantém a obrigação de meio (não vira garantia de resultado)", () => {
    expect(contrato()).toMatch(/OBRIGAÇÃO DE MEIO/);
  });
});

describe("Reforços do parecer — modelo-base de TCLE", () => {
  const termo = () => achar("termo").corpo;

  it("abre espaço para representante legal quando a paciente for incapaz", () => {
    const t = termo();
    expect(t).toMatch(/representante legal/i);
    expect(t).toMatch(/incapaz/i);
  });

  it("menciona técnica, duração estimada e tipo de anestesia, remetendo ao termo de anestesia", () => {
    const t = termo();
    expect(t).toMatch(/técnica/i);
    expect(t).toMatch(/duração/i);
    expect(t).toMatch(/termo de anestesia/i);
    expect(t).toContain("{{equipe}}");
  });

  it("traz benefícios com expectativa realista e fotos/simulações ilustrativas", () => {
    const t = termo();
    expect(t).toMatch(/benefícios/i);
    expect(t).toMatch(/expectativa realista/i);
    expect(t).toMatch(/ilustrativ/i);
  });

  it("tem campos de dúvidas com aviso de invalidação", () => {
    const t = termo();
    expect(t).toMatch(/dúvidas/i);
    expect(t).toMatch(/inválido/i);
  });

  it("pede rubrica por página e data", () => {
    const t = termo();
    expect(t).toMatch(/rubrica/i);
    expect(t).toMatch(/data/i);
  });

  it("traz a nota operacional (entrega antecipada + registro no prontuário)", () => {
    const t = termo();
    expect(t).toMatch(/nota operacional/i);
    expect(t).toMatch(/antecedência/i);
    expect(t).toMatch(/prontuário/i);
  });

  it("mantém a cláusula de imagem opcional opt-in", () => {
    const t = termo();
    expect(t).toMatch(/\(\s*\)\s*AUTORIZO/);
    expect(t).toMatch(/OPCIONAL/);
  });

  it("não contém cláusulas de pagamento/valores (pertencem ao contrato)", () => {
    const t = termo();
    expect(t).not.toMatch(/valorPago|valorPendente|multa de mora/i);
  });
});

describe("Motor de cláusulas — resolução do modelo-base de fábrica", () => {
  function paciente(over: Partial<Paciente> = {}): Paciente {
    return {
      nome: "Andreia Maria Araújo",
      cpf: "39053344705",
      dataCirurgia: "2026-09-15",
      horario: "06:00",
      local: "Avant Moema",
      localEndereco: "",
      medica: "Dra. Karla Caetano Lobo",
      crm: "123456",
      rqe: "65432",
      clinica: "KCL",
      procedimentos: ["Blefaroplastia"],
      laser: false,
      valorSinal: "3000",
      valorPendente: "2000",
      dataPagamentoPendente: "2026-09-10",
      equipeAnestesia: "Zenicare",
      ...over,
    } as unknown as Paciente;
  }

  it("gera o rascunho resolvido: foro e 5.1 inferidos, sem {{...}} nem placeholders", () => {
    const r = gerarRascunhoContrato(achar("contrato"), paciente());
    // Foro São Paulo (Karla) — só a opção escolhida sobra.
    expect(r.corpo).toContain("Comarca de São Paulo/SP");
    expect(r.corpo).not.toContain("Comarca de Campinas/SP");
    // Exames incluídos por padrão → Cláusula 5.1 infere a ressalva de inaptidão
    // (e NÃO as variantes de saúde/sem-ressalva).
    expect(r.corpo).toMatch(/inaptidão clínica comprovada por exames/i);
    expect(r.corpo).not.toContain("cancelamento definitivo");
    expect(r.corpo).not.toContain("dentro do sinal");
    // Numeração computada (sem placeholder "N" residual nos cabeçalhos).
    expect(r.corpo).not.toMatch(/data-num="clausula">N</);
    // Gênero resolvido (feminino) e nenhuma variável literal escapou.
    expect(r.corpo).toContain("portadora do RG");
    expect(variaveisNaoResolvidas(r.corpo)).toEqual([]);
    // Snapshot de decisões (regiões tipadas + gênero).
    const ids = r.decisoes.map((d) => d.id).sort();
    expect(ids).toEqual([
      "clausula51",
      "exames",
      "flexReagendamento",
      "foro",
      "genero",
    ]);
    expect(r.decisoes.find((d) => d.id === "foro")?.valor).toBe("sao-paulo");
  });

  it("prévia envolve valores escalares em <span data-var> (vínculo campo↔trecho)", () => {
    const r = gerarPreviaContrato(achar("contrato"), paciente());
    // Valor pago vira um marcador localizável pela UI.
    expect(r.corpo).toMatch(/<span data-var="valorPago">R\$\s*3\.000,00<\/span>/);
    expect(r.corpo).toContain('data-var="valorPendente"');
    expect(r.corpo).toContain('data-var="crm"');
    // Blocos clínicos (HTML pronto) NÃO são envolvidos por span.
    expect(r.corpo).not.toContain('data-var="naturezaProcedimentos"');
    // Nada de variável literal sobra.
    expect(variaveisNaoResolvidas(r.corpo)).toEqual([]);
  });

  it("Lívia em Campinas → foro Campinas; masculino resolve concordância", () => {
    const r = gerarRascunhoContrato(
      achar("contrato"),
      paciente({
        nome: "Otávio Sabino do Carmo Filho",
        medica: "Dra. Lívia Lanzoni",
        localEndereco: "Clínica Signorelli, Campinas/SP",
      } as Partial<Paciente>),
    );
    expect(r.corpo).toContain("Comarca de Campinas/SP");
    expect(r.corpo).toContain("portador do RG");
    expect(r.corpo).toContain("o CONTRATANTE"); // {{contratante}} masculino
  });
});

describe("compararComPadrao — indicador de aderência à fábrica", () => {
  it("null para procedimento criado manualmente (sem par de fábrica)", () => {
    expect(
      compararComPadrao(
        "contrato",
        "Procedimento inventado pela equipe",
        "Título qualquer",
        "Corpo qualquer",
      ),
    ).toBeNull();
  });

  it("'igual' quando título e corpo batem com a fábrica", () => {
    const padrao = obterModeloPadrao("contrato", PROCEDIMENTO_BASE);
    expect(padrao).toBeTruthy();
    expect(
      compararComPadrao(
        "contrato",
        PROCEDIMENTO_BASE,
        padrao!.titulo,
        padrao!.corpo,
      ),
    ).toBe("igual");
  });

  it("'desatualizado' quando o corpo difere da fábrica", () => {
    const padrao = obterModeloPadrao("contrato", PROCEDIMENTO_BASE);
    expect(padrao).toBeTruthy();
    expect(
      compararComPadrao(
        "contrato",
        PROCEDIMENTO_BASE,
        padrao!.titulo,
        padrao!.corpo + "\nEDITADO PELA EQUIPE",
      ),
    ).toBe("desatualizado");
  });

  it("'desatualizado' quando só o título difere da fábrica", () => {
    const padrao = obterModeloPadrao("termo", PROCEDIMENTO_BASE);
    expect(padrao).toBeTruthy();
    expect(
      compararComPadrao(
        "termo",
        PROCEDIMENTO_BASE,
        padrao!.titulo + " (revisado)",
        padrao!.corpo,
      ),
    ).toBe("desatualizado");
  });

  it("ignora a vigência — só compara o texto (título/corpo)", () => {
    const padrao = obterModeloPadrao("contrato", PROCEDIMENTO_BASE);
    expect(padrao).toBeTruthy();
    // Mesmo sendo idêntico, não há parâmetro de vigência: o resultado é 'igual'.
    expect(
      compararComPadrao(
        "contrato",
        PROCEDIMENTO_BASE,
        padrao!.titulo,
        padrao!.corpo,
      ),
    ).toBe("igual");
  });
});
