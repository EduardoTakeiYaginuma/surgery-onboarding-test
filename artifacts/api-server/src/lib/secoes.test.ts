import { describe, expect, it } from "vitest";
import {
  type Contexto,
  type IdentidadeMedica,
  CHAVES_VARIAVEIS,
  CAMPOS_IDENTIDADE_MEDICA,
  camposLocaisDeConfig,
  montarContextoCompleto,
  resolverSecoesComContexto,
} from "@workspace/secoes";
import { ObterConfigResponse } from "@workspace/api-zod";
import type { Paciente } from "@workspace/db";
import { MARCOS_JORNADA } from "./jornada-equipe";
import {
  CONTEUDO_PADRAO_SEED,
  instrucoesChegadaTexto,
  montarContexto,
  resolverSecoes,
} from "./conteudo-padrao";
import { montarPaginaPaciente } from "./saidas";
import {
  HOSPITAIS,
  PROCEDIMENTO_TEMPLATES,
  localTexto,
} from "./protocolo";

// Equipe de anestesia é texto livre por paciente (nome + telefone). Um valor
// fixo aqui reproduz o que a secretária digitaria no cadastro.
const EQUIPE_NOME = "Zenicare";
const EQUIPE_TELEFONE = "(11) 95080-2525";

/**
 * Garante que a substituição de `{{...}}` e o cálculo das datas — fonte única em
 * `@workspace/secoes` — produzem exatamente o mesmo resultado para os mesmos
 * insumos. Como o Console (`resolverSecoesPreview`) e o api-server
 * (`resolverSecoes`) delegam à mesma função com o mesmo contexto e data, a
 * prévia da secretária é provadamente idêntica à página da paciente.
 */

const DATA_CIRURGIA = "2026-08-20";

const CTX: Contexto = {
  nome: "Maria Silva",
  primeiroNome: "Maria",
  data: "20/08/2026",
  horario: "06:00",
  hospital: "Avant Moema Day Hospital",
  local: "Avant Moema Day Hospital — Av. Copacabana, 112",
  medica: "Dra. Karla Caetano Lobo",
  equipe: "Zenicare",
  equipeTelefone: "(11) 95080-2525",
  instrucoesChegada: "Confirme a janela de chegada (2h ou 3h antes).",
  valorReserva: "R$ 3.400,00",
  statusHonorarios: "Os honorários estão integralmente quitados.",
};

describe("resolverSecoesComContexto (fonte única)", () => {
  it("substitui as variáveis conhecidas em títulos, itens, corpo, etapas e contatos", () => {
    const out = resolverSecoesComContexto(
      CONTEUDO_PADRAO_SEED,
      CTX,
      DATA_CIRURGIA,
    );
    const texto = JSON.stringify(out);
    // Nenhuma variável conhecida deve sobrar por resolver.
    for (const chave of Object.keys(CTX)) {
      expect(texto).not.toContain(`{{${chave}}}`);
    }
    // Valores substituídos presentes.
    expect(texto).toContain("Zenicare");
    expect(texto).toContain("Dra. Karla Caetano Lobo");
    expect(texto).toContain("(11) 95080-2525");
  });

  it("calcula as datas da linha do tempo a partir do offset em dias", () => {
    const out = resolverSecoesComContexto(
      CONTEUDO_PADRAO_SEED,
      CTX,
      DATA_CIRURGIA,
    );
    const linha = out.find((s) => s.tipo === "linha_do_tempo");
    const etapas = linha?.etapas ?? [];
    // offset 0 → data completa dd/mm/aaaa.
    expect(etapas.some((e) => e.data === "20/08/2026")).toBe(true);
    // offset -10 → dd/mm.
    expect(etapas.some((e) => e.data === "10/08")).toBe(true);
    // offset -1 → dd/mm.
    expect(etapas.some((e) => e.data === "19/08")).toBe(true);
    // offset null → sem data.
    expect(etapas.some((e) => e.data === undefined)).toBe(true);
  });

  it("é determinístico: os mesmos insumos sempre geram o mesmo resultado", () => {
    const a = resolverSecoesComContexto(CONTEUDO_PADRAO_SEED, CTX, DATA_CIRURGIA);
    const b = resolverSecoesComContexto(CONTEUDO_PADRAO_SEED, CTX, DATA_CIRURGIA);
    expect(a).toEqual(b);
  });

  it("não altera a estrutura nem a ordem das seções", () => {
    const out = resolverSecoesComContexto(
      CONTEUDO_PADRAO_SEED,
      CTX,
      DATA_CIRURGIA,
    );
    expect(out.map((s) => s.id)).toEqual(CONTEUDO_PADRAO_SEED.map((s) => s.id));
  });
});

describe("resolverSecoes (api-server) delega à fonte única", () => {
  it("produz o mesmo resultado que chamar a fonte única com o contexto do paciente", () => {
    const paciente = {
      nome: "Maria Silva",
      dataCirurgia: DATA_CIRURGIA,
      horario: "06:00",
      local: "avant-moema",
      medica: "Dra. Karla Caetano Lobo",
      equipeAnestesia: EQUIPE_NOME,
      equipeAnestesiaTelefone: EQUIPE_TELEFONE,
    } as unknown as Paciente;

    const viaResolverSecoes = resolverSecoes(CONTEUDO_PADRAO_SEED, paciente);
    const viaFonteUnica = resolverSecoesComContexto(
      CONTEUDO_PADRAO_SEED,
      montarContexto(paciente),
      paciente.dataCirurgia,
    );
    // Mesma entrada (seções + contexto + data) ⇒ saída idêntica. Como o Console
    // também delega à fonte única com o mesmo contrato, sua prévia coincide.
    expect(viaResolverSecoes).toEqual(viaFonteUnica);
  });
});

describe("dicionário de variáveis (catálogo único)", () => {
  const paciente = {
    nome: "Maria Silva",
    dataCirurgia: DATA_CIRURGIA,
    horario: "06:00",
    local: "avant-moema",
    medica: "Dra. Karla Caetano Lobo",
    equipeAnestesia: EQUIPE_NOME,
    equipeAnestesiaTelefone: EQUIPE_TELEFONE,
  } as unknown as Paciente;

  it("montarContexto resolve exatamente as chaves do catálogo — nem a mais, nem a menos", () => {
    // Se o catálogo (`VARIAVEIS_DISPONIVEIS`) e a resolução do servidor saírem de
    // sincronia, este teste falha: ou a prévia oferece uma variável que o servidor
    // não resolve, ou o servidor resolve uma que ninguém anuncia.
    const chavesResolvidas = Object.keys(montarContexto(paciente)).sort();
    expect(chavesResolvidas).toEqual([...CHAVES_VARIAVEIS].sort());
  });

  it("montarContextoCompleto (fonte única) resolve exatamente as chaves do catálogo", () => {
    // `montarContextoCompleto` é a ÚNICA montagem do contexto: api-server,
    // Console e app móvel delegam todos a ela. Como cada `montarContexto`
    // (servidor/Console/app) apenas resolve os campos brutos e chama esta
    // função, garantir aqui que ela cobre o catálogo prova que as três prévias
    // produzem o mesmo conjunto de chaves — sem deriva entre os públicos.
    const chaves = Object.keys(
      montarContextoCompleto({
        nome: "Maria Silva",
        dataCirurgia: DATA_CIRURGIA,
        horario: "06:00",
        hospital: "Avant Moema Day Hospital",
        local: "Avant Moema Day Hospital — Av. Copacabana, 112",
        medica: "Dra. Karla Caetano Lobo",
        equipe: "Zenicare",
        equipeTelefone: "(11) 95080-2525",
        instrucoesChegada: "Chegue 2h antes em jejum de 8h.",
        valorPago: 3400,
        valorPendente: 0,
        dataPagamentoPendente: null,
      }),
    ).sort();
    expect(chaves).toEqual([...CHAVES_VARIAVEIS].sort());
  });

  it("montarContexto (servidor) delega a montarContextoCompleto — mesmas chaves", () => {
    expect(Object.keys(montarContexto(paciente)).sort()).toEqual(
      Object.keys(
        montarContextoCompleto({
          nome: paciente.nome,
          dataCirurgia: paciente.dataCirurgia,
          horario: paciente.horario,
          hospital: "x",
          local: "y",
          medica: paciente.medica,
          equipe: "z",
          equipeTelefone: "w",
          instrucoesChegada: "i",
          valorPago: 0,
          valorPendente: 0,
          dataPagamentoPendente: null,
        }),
      ).sort(),
    );
  });

  it("toda chave anunciada produz um valor não vazio para uma paciente completa", () => {
    const ctx = montarContexto(paciente);
    for (const chave of CHAVES_VARIAVEIS) {
      expect(ctx[chave]).toBeTruthy();
    }
  });

  it("resolve as instruções de chegada específicas do hospital da paciente", () => {
    const einstein = montarContexto({
      ...paciente,
      local: "Albert Einstein",
    } as unknown as Paciente);
    const vila = montarContexto({
      ...paciente,
      local: "Vila Nova Star",
    } as unknown as Paciente);
    expect(einstein.instrucoesChegada).toContain("1h30");
    expect(vila.instrucoesChegada).not.toBe(einstein.instrucoesChegada);

    // A seção "Como se preparar" da página resolve o texto do hospital, não o
    // placeholder cru nem um texto genérico único.
    const secoes = resolverSecoes(CONTEUDO_PADRAO_SEED, {
      ...paciente,
      local: "Albert Einstein",
    } as unknown as Paciente);
    const comoPreparar = secoes.find((s) => s.id === "como-se-preparar");
    expect(JSON.stringify(comoPreparar)).toContain("1h30");
  });
});

/**
 * Monta a resposta de `GET /api/config` EXATAMENTE como a rota (`pacientes.ts`)
 * faz, e valida pela `ObterConfigResponse` — assim, se a rota deixar de expor um
 * campo que a prévia lê (`nomeCompleto`/`local`/`instrucoesChegada`/`telefone`),
 * o teste abaixo quebra. Os campos `temaPadrao`/prazos vêm do banco na rota real;
 * aqui usamos valores fixos porque a prévia das seções não os consome.
 */
function configComoNaRota() {
  return ObterConfigResponse.parse({
    hospitais: HOSPITAIS.map((h) => ({
      chave: h.chave,
      nome: h.nome,
      nomeCompleto: h.nomeCompleto,
      local: localTexto(h),
      instrucoesChegada: instrucoesChegadaTexto(h),
      ...(h.sinalSugerido != null ? { sinalSugerido: h.sinalSugerido } : {}),
    })),
    procedimentos: PROCEDIMENTO_TEMPLATES.map((p) => ({
      chave: p.chave,
      nome: p.nome,
      descricao: p.descricao,
      horarioSugerido: p.horarioSugerido,
      laserSugerido: p.laserSugerido,
      sinalSugerido: p.sinalSugerido,
    })),
    temaPadrao: "light",
    prazoAssinaturaDiasAntes: 5,
    vencimentoSaldoDiasUteisAntes: 2,
    jornadaEquipe: MARCOS_JORNADA.map((m) => ({
      chave: m.chave,
      rotulo: m.rotulo,
      automatico: m.automatico,
    })),
  });
}

/**
 * Trava a equivalência prévia-no-editor ⇄ página-da-paciente. A prévia do Console
 * e do app móvel resolvem os campos de hospital/equipe a partir da `/config` via
 * a fonte única `camposLocaisDeConfig` (a mesma função para a qual ambos delegam).
 * O servidor monta a página pública a partir do paciente + protocolo. Aqui
 * passamos o MESMO paciente + config pelos dois caminhos e exigimos seções
 * idênticas — se qualquer lado derivar (config para de expor um campo, a rota
 * muda o cálculo, ou o servidor passa a resolver diferente), o teste falha.
 */
describe("prévia (Console/app via /config) ⇄ página da paciente (servidor)", () => {
  const CONFIG = configComoNaRota();

  /** Reproduz o caminho da prévia: campos diretos do paciente + `camposLocaisDeConfig`. */
  function previaDoPaciente(p: Paciente) {
    const locais = camposLocaisDeConfig(
      {
        localChave: p.local,
        equipeNome: p.equipeAnestesia,
        equipeTelefone: p.equipeAnestesiaTelefone ?? "",
        // Só usado se o hospital não estiver na config — aqui ele sempre está.
        instrucoesChegadaPadrao: "fallback que nunca deve ser usado",
      },
      CONFIG,
    );
    const ctx = montarContextoCompleto({
      nome: p.nome,
      dataCirurgia: p.dataCirurgia,
      horario: p.horario,
      medica: p.medica,
      valorPago: Number(p.valorSinal),
      valorPendente: Number(p.valorPendente),
      dataPagamentoPendente: p.dataPagamentoPendente ?? null,
      ...locais,
    });
    return resolverSecoesComContexto(CONTEUDO_PADRAO_SEED, ctx, p.dataCirurgia);
  }

  // Cobre todos os hospitais — qualquer hospital cujo endereço, nome completo ou
  // texto de chegada não casar entre os dois lados quebra aqui. A equipe é texto
  // livre gravado no paciente, então basta um valor fixo (nome + telefone).
  for (const hospital of HOSPITAIS) {
    it(`resolve as mesmas seções para ${hospital.chave} / ${EQUIPE_NOME}`, () => {
      const p = {
        nome: "Maria Silva",
        dataCirurgia: DATA_CIRURGIA,
        horario: "06:00",
        local: hospital.chave,
        medica: "Dra. Karla Caetano Lobo",
        equipeAnestesia: EQUIPE_NOME,
        equipeAnestesiaTelefone: EQUIPE_TELEFONE,
      } as unknown as Paciente;

      expect(previaDoPaciente(p)).toEqual(
        resolverSecoes(CONTEUDO_PADRAO_SEED, p),
      );
    });
  }

  it("o telefone, o nome do hospital, o endereço e a chegada da prévia batem com o servidor", () => {
    // Foco no risco descrito na tarefa: a prévia mostrar um telefone ou endereço
    // diferente do que a paciente vê. Comparamos os valores brutos do contexto.
    for (const hospital of HOSPITAIS) {
      const p = {
        nome: "Maria Silva",
        dataCirurgia: DATA_CIRURGIA,
        horario: "06:00",
        local: hospital.chave,
        medica: "Dra. Karla Caetano Lobo",
        equipeAnestesia: EQUIPE_NOME,
        equipeAnestesiaTelefone: EQUIPE_TELEFONE,
      } as unknown as Paciente;

      const locais = camposLocaisDeConfig(
        {
          localChave: p.local,
          equipeNome: p.equipeAnestesia,
          equipeTelefone: p.equipeAnestesiaTelefone ?? "",
          instrucoesChegadaPadrao: "fallback que nunca deve ser usado",
        },
        CONFIG,
      );
      const servidor = montarContexto(p);
      expect(locais.hospital).toBe(servidor.hospital);
      expect(locais.local).toBe(servidor.local);
      expect(locais.equipe).toBe(servidor.equipe);
      expect(locais.equipeTelefone).toBe(servidor.equipeTelefone);
      expect(locais.instrucoesChegada).toBe(servidor.instrucoesChegada);
    }
  });

  it("detecta deriva: se a /config expuser um endereço diferente, a prévia diverge", () => {
    // Prova que a asserção de equivalência tem dentes: uma config adulterada
    // (endereço fora de sincronia com o protocolo) deixa de bater com o servidor.
    const configAdulterada = {
      ...CONFIG,
      hospitais: CONFIG.hospitais.map((h, i) =>
        i === 0 ? { ...h, local: `${h.local} (endereço errado)` } : h,
      ),
    };
    const p = {
      nome: "Maria Silva",
      dataCirurgia: DATA_CIRURGIA,
      horario: "06:00",
      local: HOSPITAIS[0].chave,
      medica: "Dra. Karla Caetano Lobo",
      equipeAnestesia: EQUIPE_NOME,
      equipeAnestesiaTelefone: EQUIPE_TELEFONE,
    } as unknown as Paciente;

    const locais = camposLocaisDeConfig(
      {
        localChave: p.local,
        equipeNome: p.equipeAnestesia,
        equipeTelefone: p.equipeAnestesiaTelefone ?? "",
        instrucoesChegadaPadrao: "fallback que nunca deve ser usado",
      },
      configAdulterada,
    );
    expect(locais.local).not.toBe(montarContexto(p).local);
  });
});

/**
 * Trava de anti-deriva do CABEÇALHO de identidade da médica (foto/logo/clínica/
 * médica/CRM/RQE). Esse bloco é renderizado à mão (React), fora do motor de
 * `{{...}}`, então a página pública e as prévias precisavam ser espelhadas à mão
 * e derivavam em silêncio. O CONJUNTO de campos agora vive numa fonte única
 * (`CAMPOS_IDENTIDADE_MEDICA`/`IdentidadeMedica` em `@workspace/secoes`), que o
 * componente compartilhado consome. Aqui projetamos o DTO da página pública nesse
 * contrato e exigimos exatamente as chaves do catálogo. O lado do Console faz a
 * asserção espelhada contra o MESMO catálogo (`secoes-preview.test.ts`), então
 * acrescentar/remover um campo do cabeçalho em um lado quebra até os dois baterem.
 */
describe("cabeçalho de identidade da médica (DTO público) — sem deriva", () => {
  /** Projeta o DTO da página pública no contrato único do cabeçalho. */
  function identidadeDaDTO(
    dto: ReturnType<typeof montarPaginaPaciente>,
  ): IdentidadeMedica {
    return {
      medica: dto.medica,
      crm: dto.crm,
      rqe: dto.rqe,
      clinica: dto.clinica,
      medicoFotoUrl: dto.medicoFotoUrl,
      medicoLogoUrl: dto.medicoLogoUrl,
    };
  }

  const paciente = {
    nome: "Maria Silva",
    dataCirurgia: DATA_CIRURGIA,
    horario: "06:00",
    local: "avant-moema",
    medica: "Dra. Karla Caetano Lobo",
    crm: "123456",
    rqe: "65432",
    clinica: "KCL",
    procedimentos: ["Mamoplastia"],
    laser: false,
    valorSinal: "1000",
    valorPendente: "0",
    equipeAnestesia: EQUIPE_NOME,
    equipeAnestesiaTelefone: EQUIPE_TELEFONE,
  } as unknown as Paciente;

  it("o DTO da página pública expõe exatamente os campos do catálogo do cabeçalho", () => {
    const dto = montarPaginaPaciente(paciente, CONTEUDO_PADRAO_SEED, "light", [], {
      medicoFotoUrl: "https://exemplo/foto.jpg",
      medicoLogoUrl: "https://exemplo/logo.png",
      contratoLinkAssinatura: null,
      contratoPrazo: null,
      termoLinkAssinatura: null,
      termoPrazo: null,
    });
    const chaves = Object.keys(identidadeDaDTO(dto)).sort();
    expect(chaves).toEqual([...CAMPOS_IDENTIDADE_MEDICA].sort());
  });

  it("propaga as URLs assinadas de foto/logo (null quando ausentes)", () => {
    const comUrls = montarPaginaPaciente(paciente, CONTEUDO_PADRAO_SEED, "light", [], {
      medicoFotoUrl: "https://exemplo/foto.jpg",
      medicoLogoUrl: "https://exemplo/logo.png",
      contratoLinkAssinatura: null,
      contratoPrazo: null,
      termoLinkAssinatura: null,
      termoPrazo: null,
    });
    expect(comUrls.medicoFotoUrl).toBe("https://exemplo/foto.jpg");
    expect(comUrls.medicoLogoUrl).toBe("https://exemplo/logo.png");

    const semUrls = montarPaginaPaciente(paciente, CONTEUDO_PADRAO_SEED);
    expect(semUrls.medicoFotoUrl).toBeNull();
    expect(semUrls.medicoLogoUrl).toBeNull();
  });
});
