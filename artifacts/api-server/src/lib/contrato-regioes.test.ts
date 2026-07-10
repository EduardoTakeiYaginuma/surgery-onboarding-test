import { describe, expect, it } from "vitest";
import type { Paciente, DecisaoRegiao } from "@workspace/db";
import {
  resolverModelo,
  inferirGenero,
  usaGenero,
  generoDe,
  montarContextoDecisao,
  REGRAS_INFERENCIA,
} from "./contrato-regioes";

function pacienteFixture(over: Partial<Paciente> = {}): Paciente {
  return {
    nome: "Andreia Maria Araújo",
    cpf: "39053344705",
    dataCirurgia: "2026-09-15",
    horario: "06:00",
    local: "avant-moema",
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
    equipeAnestesia: "zenicare",
    ...over,
  } as unknown as Paciente;
}

// Modelo de teste com todos os tipos de região: seção romana, cláusulas, subitens
// numerados, dois opcionais (exames on / flex off), a variante encadeada 5.1 e a
// variante de foro. Referências cruzadas via data-ref.
const MODELO = `
<div><span data-num="secao">X</span>. Partes</div>
<p>CLÁUSULA <span data-num="clausula">X</span>ª. Objeto.</p>
<div><span data-num="secao">X</span>. Preço</div>
<p>CLÁUSULA <span data-num="clausula">X</span>ª. Preço.</p>
<p><span data-num="sub">X</span>. Honorários {{valorPago}}.</p>
<div data-regiao="opcional" data-id="exames" data-rotulo="Exames pré-op" data-inferir="examesPadrao">
  <p><span data-num="sub">X</span>. Devolução por inaptidão.</p>
</div>
<div data-regiao="opcional" data-id="flexReagendamento" data-rotulo="Flexibilidade" data-inferir="flexPadraoOff">
  <p><span data-num="sub">X</span>. Flexibilidade para {{contratante}}.</p>
</div>
<p><span data-num="sub">X</span>. Data do procedimento.</p>
<div data-regiao="variante" data-id="clausula51" data-rotulo="Taxa admin." data-inferir="taxaAdmin51">
  <div data-opcao data-valor="inaptidao"><p>Ressalva de inaptidão (Cláusula <span data-ref="exames"></span>).</p></div>
  <div data-opcao data-valor="saude"><p>Cancelamento definitivo por saúde.</p></div>
  <div data-opcao data-valor="sem-ressalva"><p>Sem ressalva, retida no sinal.</p></div>
</div>
<div data-regiao="variante" data-id="foro" data-rotulo="Foro" data-inferir="foroPorMedica">
  <div data-opcao data-valor="sao-paulo"><p>CLÁUSULA <span data-num="clausula">X</span>ª. Foro de São Paulo.</p></div>
  <div data-opcao data-valor="campinas"><p>CLÁUSULA <span data-num="clausula">X</span>ª. Foro de Campinas.</p></div>
</div>`.trim();

describe("resolverModelo — legado (sem marcadores)", () => {
  it("devolve o corpo intacto e nenhuma decisão", () => {
    const corpo = "<p>Texto fixo com {{nome}} e {{valorPago}}.</p>";
    const r = resolverModelo(corpo, pacienteFixture());
    expect(r.corpo).toBe(corpo);
    expect(r.decisoes).toEqual([]);
  });
});

describe("resolverModelo — variantes", () => {
  it("Karla → foro São Paulo (mantém 1 opção, remove a outra)", () => {
    const r = resolverModelo(MODELO, pacienteFixture());
    expect(r.corpo).toContain("Foro de São Paulo");
    expect(r.corpo).not.toContain("Foro de Campinas");
    const foro = r.decisoes.find((d) => d.id === "foro");
    expect(foro?.valor).toBe("sao-paulo");
    expect(foro?.confirmado).toBe(true); // confiança alta
    expect(foro?.origem).toMatch(/São Paulo/);
  });

  it("Lívia/Signorelli → foro Campinas", () => {
    const r = resolverModelo(
      MODELO,
      pacienteFixture({
        medica: "Dra. Lívia Lanzoni",
        localEndereco: "Clínica Signorelli, Campinas/SP",
      } as Partial<Paciente>),
    );
    expect(r.corpo).toContain("Foro de Campinas");
    expect(r.corpo).not.toContain("Foro de São Paulo");
    expect(r.decisoes.find((d) => d.id === "foro")?.valor).toBe("campinas");
  });

  it("5.1 encadeia com exames: incluídos → ressalva de inaptidão", () => {
    const r = resolverModelo(MODELO, pacienteFixture());
    expect(r.corpo).toContain("Ressalva de inaptidão");
    expect(r.corpo).not.toContain("Cancelamento definitivo");
    const c51 = r.decisoes.find((d) => d.id === "clausula51");
    expect(c51?.valor).toBe("inaptidao");
    expect(c51?.confirmado).toBe(false); // taxaAdmin51 é confiança baixa
  });

  it("5.1 vira sem-ressalva quando exames são omitidos", () => {
    const previas: DecisaoRegiao[] = [
      {
        id: "exames",
        tipo: "opcional",
        rotulo: "Exames pré-op",
        incluido: false,
        inferido: true,
        confirmado: true,
        editado: true,
        origem: "operador",
      },
    ];
    const r = resolverModelo(MODELO, pacienteFixture(), previas);
    expect(r.corpo).not.toContain("Devolução por inaptidão");
    expect(r.corpo).toContain("Sem ressalva, retida no sinal");
    expect(r.decisoes.find((d) => d.id === "clausula51")?.valor).toBe(
      "sem-ressalva",
    );
  });
});

describe("resolverModelo — opcionais e renumeração", () => {
  it("com exames on / flex off: honorários=2.1, exames=2.2, data=2.3", () => {
    const r = resolverModelo(MODELO, pacienteFixture());
    expect(r.corpo).toContain("Devolução por inaptidão");
    expect(r.corpo).not.toContain("Flexibilidade para"); // flex omitido
    // subitens renumerados sem buraco
    expect(r.corpo).toMatch(/2\.1<\/span>\. Honorários/);
    expect(r.corpo).toMatch(/2\.2<\/span>\. Devolução/);
    expect(r.corpo).toMatch(/2\.3<\/span>\. Data/);
  });

  it("data-ref aponta para o número computado da região de exames (2.2)", () => {
    const r = resolverModelo(MODELO, pacienteFixture());
    expect(r.corpo).toMatch(/Cláusula <span data-ref="exames">2\.2<\/span>/);
  });

  it("omitir exames renumera: data passa a 2.2", () => {
    const previas: DecisaoRegiao[] = [
      {
        id: "exames",
        tipo: "opcional",
        rotulo: "Exames",
        incluido: false,
        inferido: true,
        confirmado: true,
        editado: true,
        origem: "operador",
      },
    ];
    const r = resolverModelo(MODELO, pacienteFixture(), previas);
    expect(r.corpo).toMatch(/2\.1<\/span>\. Honorários/);
    expect(r.corpo).toMatch(/2\.2<\/span>\. Data/);
  });

  it("numera seções (I, II) e cláusulas (1, 2, 3) na ordem do documento", () => {
    const r = resolverModelo(MODELO, pacienteFixture());
    expect(r.corpo).toMatch(/<span data-num="secao">I<\/span>\. Partes/);
    expect(r.corpo).toMatch(/<span data-num="secao">II<\/span>\. Preço/);
    expect(r.corpo).toMatch(/CLÁUSULA <span data-num="clausula">1<\/span>ª\. Objeto/);
    expect(r.corpo).toMatch(/CLÁUSULA <span data-num="clausula">2<\/span>ª\. Preço/);
    // a cláusula de foro (São Paulo) é a 3ª
    expect(r.corpo).toMatch(/CLÁUSULA <span data-num="clausula">3<\/span>ª\. Foro/);
  });
});

describe("resolverModelo — precedência da decisão do operador", () => {
  it("uma variante confirmada sobrepõe a inferência e marca editado", () => {
    const previas: DecisaoRegiao[] = [
      {
        id: "foro",
        tipo: "variante",
        rotulo: "Foro",
        valor: "campinas", // operador escolheu Campinas apesar da Karla
        inferido: "sao-paulo",
        confirmado: true,
        editado: true,
        origem: "operador",
      },
    ];
    const r = resolverModelo(MODELO, pacienteFixture(), previas);
    expect(r.corpo).toContain("Foro de Campinas");
    const foro = r.decisoes.find((d) => d.id === "foro");
    expect(foro?.valor).toBe("campinas");
    expect(foro?.inferido).toBe("sao-paulo");
    expect(foro?.editado).toBe(true);
    expect(foro?.confirmado).toBe(true);
  });
});

describe("gênero", () => {
  it("inferirGenero por terminação do primeiro nome", () => {
    expect(inferirGenero("Andreia Maria Araújo")).toBe("f");
    expect(inferirGenero("Maria Caboclo")).toBe("f");
    expect(inferirGenero("Otávio Sabino do Carmo Filho")).toBe("m");
    expect(inferirGenero("Luca Bianchi")).toBe("m"); // exceção masculina
  });

  it("usaGenero detecta tokens de concordância", () => {
    expect(usaGenero("Assinado por {{contratante}}.")).toBe(true);
    expect(usaGenero("Assinado pela paciente.")).toBe(false);
  });

  it("resolverModelo emite decisão de gênero pendente quando há token", () => {
    const r = resolverModelo(MODELO, pacienteFixture());
    const g = r.decisoes.find((d) => d.id === "genero");
    expect(g).toBeDefined();
    expect(g?.tipo).toBe("genero");
    expect(g?.valor).toBe("f");
    expect(g?.confirmado).toBe(false); // heurística de nome → sempre confirmar
  });

  it("generoDe respeita a decisão salva; senão infere do nome", () => {
    const dec: DecisaoRegiao[] = [
      {
        id: "genero",
        tipo: "genero",
        rotulo: "Gênero",
        valor: "m",
        inferido: "f",
        confirmado: true,
        editado: true,
        origem: "operador",
      },
    ];
    expect(generoDe(dec, "Andreia")).toBe("m");
    expect(generoDe(undefined, "Otávio")).toBe("m");
    expect(generoDe(undefined, "Andreia")).toBe("f");
  });
});

describe("regras de inferência (unidade)", () => {
  const mapa = new Map<string, DecisaoRegiao>();
  it("pagamentoParceladoVsVista pelo saldo", () => {
    const comSaldo = montarContextoDecisao(pacienteFixture());
    const semSaldo = montarContextoDecisao(
      pacienteFixture({ valorPendente: "0" } as Partial<Paciente>),
    );
    expect(REGRAS_INFERENCIA.pagamentoParceladoVsVista(comSaldo, mapa).valor).toBe(
      "escalonado",
    );
    expect(REGRAS_INFERENCIA.pagamentoParceladoVsVista(semSaldo, mapa).valor).toBe(
      "vista",
    );
  });
});
