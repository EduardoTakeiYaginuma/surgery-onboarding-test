import { Router, type IRouter } from "express";
import multer from "multer";
import {
  ListarCheckinsParams,
  ListarCheckinsResponse,
  CriarCheckinParams,
  CriarCheckinBody,
  CriarCheckinResponse,
  SemearCheckinsPadraoParams,
  SemearCheckinsPadraoResponse,
  AtualizarCheckinParams,
  AtualizarCheckinBody,
  AtualizarCheckinResponse,
  ListarCheckinsPublicoParams,
  ListarCheckinsPublicoResponse,
  CriarPacienteBody,
  CriarPacienteResponse,
  ListarPacientesResponse,
  ListarPacientesArquivadosResponse,
  ResumoPacientesResponse,
  ObterPacienteParams,
  ObterPacienteResponse,
  AtualizarPacienteParams,
  AtualizarPacienteBody,
  AtualizarPacienteResponse,
  AprovarPacienteParams,
  AprovarPacienteResponse,
  ArquivarPacienteParams,
  ArquivarPacienteResponse,
  RestaurarPacienteParams,
  RestaurarPacienteResponse,
  ListarTimelineParams,
  ListarTimelineResponse,
  AdicionarNotaParams,
  AdicionarNotaBody,
  AdicionarNotaResponse,
  RegistrarLembreteParams,
  RegistrarLembreteBody,
  RegistrarLembreteResponse,
  ObterPaginaPacienteParams,
  ObterPaginaPacienteResponse,
  DefinirTemaPacienteParams,
  DefinirTemaPacienteBody,
  DefinirTemaPacienteResponse,
  DefinirTemaPadraoBody,
  DefinirTemaPadraoResponse,
  ObterConfigResponse,
  ObterConfigNotificacaoResponse,
  DefinirConfigNotificacaoBody,
  DefinirConfigNotificacaoResponse,
  TestarConfigNotificacaoBody,
  TestarConfigNotificacaoResponse,
  ObterConfigContratoResponse,
  DefinirConfigContratoBody,
  DefinirConfigContratoResponse,
  ObterConfigPromptsResponse,
  DefinirConfigPromptsBody,
  DefinirConfigPromptsResponse,
  ProcessarAlertasPrazoResponse,
  ListarHistoricoPacienteParams,
  ListarHistoricoPacienteResponse,
  ObterAtividadePacienteParams,
  ObterAtividadePacienteResponse,
  RegistrarEventoPacienteParams,
  RegistrarEventoPacienteBody,
  ListarDocumentosParams,
  ListarDocumentosResponse,
  RegistrarDocumentoParams,
  RegistrarDocumentoBody,
  RegistrarDocumentoResponse,
  RemoverDocumentoParams,
  ObterPedidoExamesParams,
  ObterPedidoExamesResponse,
  RemoverPedidoExamesParams,
  ObterReceitaPreparoPeleParams,
  ObterReceitaPreparoPeleResponse,
  RemoverReceitaPreparoPeleParams,
  ObterReceituarioPosopParams,
  ObterReceituarioPosopResponse,
  RemoverReceituarioPosopParams,
  MarcarMarcoManualParams,
  MarcarMarcoManualBody,
  MarcarMarcoManualResponse,
} from "@workspace/api-zod";
import { pacientesRepo } from "../lib/pacientes-repo";
import { checkinsRepo } from "../lib/checkins-repo";
import {
  uploadFotoCheckin,
  urlAssinadaFoto,
  storageConfigurado,
  ehTipoFotoAceito,
  StorageIndisponivelError,
  type TipoFotoAceito,
} from "../lib/fotos-storage";
import type { Checkin, InsertPaciente } from "@workspace/db";
import { timelineRepo, TIPO_LEMBRETE_WHATSAPP } from "../lib/timeline-repo";
import {
  registrarMarco,
  marcoDoEstagio,
  registrarMarcoManual,
} from "../lib/eventos";
import { MARCOS_JORNADA, calcularJornadaEquipe } from "../lib/jornada-equipe";
import type { TimelineEvento } from "@workspace/db";
import { conteudoRepo } from "../lib/conteudo-repo";
import { notificacaoConfigRepo } from "../lib/notificacao-config-repo";
import { enviarAvisoTeste } from "../lib/notificacoes";
import { medicosRepo } from "../lib/medicos-repo";
import {
  contratoConfigRepo,
  diasNoIntervalo,
  PRAZO_DIAS_MIN,
  PRAZO_DIAS_MAX,
} from "../lib/contrato-config-repo";
import {
  documentoPromptConfigRepo,
  PromptInvalidoError,
  PROMPT_MIN_LEN,
} from "../lib/documento-prompt-config-repo";
import { calcularPrazoAssinatura, diasUteisAntes, hojeISO } from "../lib/prazos";
import { buscarContatosTwenty, LumexaCoreError } from "../lib/lumexa-core";
import {
  montarSaidas,
  montarPaginaPaciente,
  pacienteParaDTO,
  diffPaciente,
  descreverEvento,
  ehTipoEvento,
} from "../lib/saidas";
import {
  PROCEDIMENTO_TEMPLATES,
  localTexto,
  perfilDeLocal,
} from "../lib/protocolo";
import { locaisRepo, resolverLocalDoCadastro } from "../lib/locais-repo";
import { instrucoesChegadaTexto } from "../lib/conteudo-padrao";
import { extrairDocumentoId, listarAssinaturasContrato } from "../lib/autentique";
import { refrescarStatusContrato, processarAlertasPrazo } from "../lib/contrato";
import { refrescarStatusTermo } from "../lib/termo";
import { refrescarPendentes } from "../lib/refresco-pendentes";
import { notificarFotoCheckin } from "../lib/notificacoes";
import { cpfValido, telefoneValido } from "../lib/validacao-br";
import { servirContratoAssinado, slugNome } from "../lib/contrato-arquivo";
import { servirTermoAssinado, slugNomeTermo } from "../lib/termo-arquivo";
import {
  servirDocumento,
  apagarObjetoDocumento,
  TIPO_PDF,
  TAMANHO_MAXIMO,
} from "../lib/documentos-arquivo";
import {
  uploadPedidoExames,
  apagarPedidoExamesObjeto,
  servirPedidoExames,
  storageExamesConfigurado,
} from "../lib/pedido-exames-arquivo";
import {
  uploadReceitaPreparoPele,
  apagarReceitaPreparoPeleObjeto,
  servirReceitaPreparoPele,
  storageReceitasPeleConfigurado,
} from "../lib/receita-preparo-pele-arquivo";
import {
  uploadReceituarioPosop,
  apagarReceituarioPosopObjeto,
  servirReceituarioPosop,
  storageReceituariosConfigurado,
} from "../lib/receituario-posop-arquivo";
import { servirListaMedicamentos } from "../lib/lista-medicamentos-arquivo";

const router: IRouter = Router();

// Aceita apenas datas de calendário reais no formato yyyy-mm-dd (ex.: rejeita
// "2026-13-40"). Garante que a comparação lexicográfica de datas seja confiável.
function dataISOValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [y, m, d] = valor.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function timelineParaDTO(e: TimelineEvento) {
  return {
    id: e.id,
    pacienteId: e.pacienteId,
    tipo: e.tipo,
    titulo: e.titulo,
    descricao: e.descricao ?? null,
    autor: e.autor ?? null,
    automatico: e.automatico,
    createdAt: e.createdAt.toISOString(),
  };
}

// Fotos guardadas em Object Storage privado; nunca expomos o caminho do objeto.
// A miniatura é servida por uma URL assinada de validade curta, gerada na hora.
// A assinatura é best-effort: se falhar, devolvemos fotoUrl=null (a listagem
// nunca quebra por causa disso).
async function checkinParaDTO(c: Checkin) {
  return {
    id: c.id,
    pacienteId: c.pacienteId,
    dia: c.dia,
    tipo: c.tipo,
    status: c.status,
    fotoUrl: await urlAssinadaFoto(c.fotoUrl),
    nota: c.nota ?? null,
    sinalAtencao: c.sinalAtencao,
    createdAt: c.createdAt.toISOString(),
  };
}

// Versão pública (página da paciente): sem nota interna nem sinal de atenção.
async function checkinPublicoParaDTO(c: Checkin) {
  return {
    id: c.id,
    dia: c.dia,
    tipo: c.tipo,
    status: c.status,
    fotoUrl: await urlAssinadaFoto(c.fotoUrl),
  };
}

// Upload em memória: a foto vai direto para o GCS, sem tocar o disco. Limite de
// 8 MB cobre fotos de celular com folga.
const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// Upload do PDF de pedido de exames em memória (segue direto ao bucket de
// exames). Limite alinhado ao dos documentos (20 MB).
const uploadPedidoExamesPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO },
});

router.get("/pacientes", async (_req, res): Promise<void> => {
  const [pacientesCache, abertos, lembretes, { prazoAssinaturaDiasAntes: diasAntes }] =
    await Promise.all([
      pacientesRepo.listar(),
      pacientesRepo.idsComAbertura(),
      timelineRepo.ultimoLembretePorPaciente(),
      contratoConfigRepo.obter(),
    ]);
  // Reconsulta ao vivo só os processos com contrato/termo pendente (com TTL),
  // para que uma assinatura recém-concluída avance o funil no dashboard sem
  // precisar abrir cada processo. Terminais e recém-verificados são pulados.
  const pacientes = await refrescarPendentes(pacientesCache);
  res.json(
    ListarPacientesResponse.parse(
      pacientes.map((p) => ({
        ...pacienteParaDTO(p, { diasAntes }),
        abriu: abertos.has(p.id),
        lembreteEnviadoEm: lembretes.get(p.id)?.em.toISOString() ?? null,
        lembradoPor: lembretes.get(p.id)?.por ?? null,
      })),
    ),
  );
});

// Busca de contatos (pacientes) no Twenty via core — para o cadastro achar a
// pessoa REAL e pré-preencher telefone/email/CPF. Estática, declarada antes de
// "/pacientes/:id" para não ser capturada como id.
router.get("/pacientes/contatos-twenty", async (req, res): Promise<void> => {
  const nome = typeof req.query.nome === "string" ? req.query.nome : undefined;
  const telefone =
    typeof req.query.telefone === "string" ? req.query.telefone : undefined;
  try {
    const contatos = await buscarContatosTwenty({ nome, telefone });
    res.json({ contatos });
  } catch (err) {
    if (err instanceof LumexaCoreError) {
      req.log.warn({ err: err.message }, "Busca de contatos no Twenty falhou");
      res.status(502).json({ message: err.message });
      return;
    }
    throw err;
  }
});

router.get("/pacientes/resumo", async (_req, res): Promise<void> => {
  const pacientes = await pacientesRepo.listar();
  const agora = new Date();
  // Conta por marco atual (mais avançado atingido). Baseline (sem marco) cai em
  // aguardandoContrato. A ordem de porMarco segue a jornada canônica.
  const contagem = new Map<string, number>();
  let aguardandoContrato = 0;
  for (const p of pacientes) {
    const { marcoAtual } = calcularJornadaEquipe(p, agora);
    if (!marcoAtual) {
      aguardandoContrato += 1;
    } else {
      contagem.set(marcoAtual, (contagem.get(marcoAtual) ?? 0) + 1);
    }
  }
  const resumo = {
    total: pacientes.length,
    porMarco: MARCOS_JORNADA.map((m) => ({
      chave: m.chave,
      rotulo: m.rotulo,
      total: contagem.get(m.chave) ?? 0,
    })),
    aguardandoContrato,
    contratosPendentes: pacientes.filter(
      (p) => p.contratoStatus === "pendente",
    ).length,
    termosPendentes: pacientes.filter(
      (p) => p.termoStatus === "pendente",
    ).length,
  };
  res.json(ResumoPacientesResponse.parse(resumo));
});

router.get("/config", async (_req, res): Promise<void> => {
  const [temaPadrao, { prazoAssinaturaDiasAntes, vencimentoSaldoDiasUteisAntes }, locais] =
    await Promise.all([
      conteudoRepo.obterTemaPadrao(),
      contratoConfigRepo.obter(),
      locaisRepo.listar(),
    ]);
  res.json(
    ObterConfigResponse.parse({
      // Locais de cirurgia vêm da tabela configurável `locais` (antes era uma
      // constante fixa). `id` permite ao Console vincular o paciente por localId.
      hospitais: locais.map((l) => {
        const h = perfilDeLocal(l);
        return {
          id: l.id,
          chave: h.chave,
          nome: h.nome,
          nomeCompleto: h.nomeCompleto,
          local: localTexto(h),
          instrucoesChegada: instrucoesChegadaTexto(h),
          ...(h.sinalSugerido != null ? { sinalSugerido: h.sinalSugerido } : {}),
        };
      }),
      procedimentos: PROCEDIMENTO_TEMPLATES.map((p) => ({
        chave: p.chave,
        nome: p.nome,
        descricao: p.descricao,
        horarioSugerido: p.horarioSugerido,
        laserSugerido: p.laserSugerido,
        sinalSugerido: p.sinalSugerido,
      })),
      temaPadrao,
      prazoAssinaturaDiasAntes,
      vencimentoSaldoDiasUteisAntes,
      jornadaEquipe: MARCOS_JORNADA.map((m) => ({
        chave: m.chave,
        rotulo: m.rotulo,
        automatico: m.automatico,
      })),
    }),
  );
});

// Define o registro (claro/escuro) com que novas páginas de paciente abrem no
// primeiro acesso. A escolha já feita por uma paciente continua valendo.
router.put("/config/tema-padrao", async (req, res): Promise<void> => {
  const body = DefinirTemaPadraoBody.safeParse(req.body);
  if (!body.success) {
    req.log.warn({ errors: body.error.message }, "Body inválido");
    res.status(400).json({ message: body.error.message });
    return;
  }
  const tema = await conteudoRepo.salvarTemaPadrao(body.data.tema);
  res.json(DefinirTemaPadraoResponse.parse({ tema }));
});

// Avisos de contrato à equipe: destino (webhook) + liga/desliga. A equipe
// gerencia isto pelo Console, sem mexer em secrets.
router.get("/config/notificacoes", async (_req, res): Promise<void> => {
  const config = await notificacaoConfigRepo.obter();
  res.json(ObterConfigNotificacaoResponse.parse(config));
});

router.put("/config/notificacoes", async (req, res): Promise<void> => {
  const body = DefinirConfigNotificacaoBody.safeParse(req.body);
  if (!body.success) {
    req.log.warn({ errors: body.error.message }, "Body inválido");
    res.status(400).json({ message: body.error.message });
    return;
  }

  // Normaliza: vazio/espaços limpa o destino. Quando há destino, exige uma URL
  // http(s) válida — assim um valor digitado errado não silencia o aviso na
  // surdina.
  const bruto = body.data.webhookUrl?.trim() ?? "";
  let webhookUrl: string | null = null;
  if (bruto) {
    let url: URL;
    try {
      url = new URL(bruto);
    } catch {
      res
        .status(400)
        .json({ message: "Informe uma URL de destino válida (https://...)." });
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      res
        .status(400)
        .json({ message: "O destino precisa começar com http:// ou https://." });
      return;
    }
    webhookUrl = bruto;
  }

  const salvo = await notificacaoConfigRepo.salvar({
    webhookUrl,
    silenciada: body.data.silenciada,
  });
  res.json(DefinirConfigNotificacaoResponse.parse(salvo));
});

// Aviso de teste: posta uma mensagem de amostra no destino para a equipe
// confirmar, na hora, que a URL funciona. Usa o destino recém-digitado quando
// informado; senão, o destino salvo. Ignora o liga/desliga de propósito.
router.post("/config/notificacoes/testar", async (req, res): Promise<void> => {
  const body = TestarConfigNotificacaoBody.safeParse(req.body ?? {});
  if (!body.success) {
    req.log.warn({ errors: body.error.message }, "Body inválido");
    res.status(400).json({ message: body.error.message });
    return;
  }

  // Quando um destino é digitado, exige uma URL http(s) válida antes de testar —
  // assim um valor errado dá erro claro em vez de uma falha de rede confusa.
  const bruto = body.data.webhookUrl?.trim() ?? "";
  if (bruto) {
    let url: URL;
    try {
      url = new URL(bruto);
    } catch {
      res
        .status(400)
        .json({ message: "Informe uma URL de destino válida (https://...)." });
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      res
        .status(400)
        .json({ message: "O destino precisa começar com http:// ou https://." });
      return;
    }
  }

  const resultado = await enviarAvisoTeste(bruto || undefined);
  res.json(TestarConfigNotificacaoResponse.parse(resultado));
});

// Prazo de assinatura do contrato: quantos dias antes da cirurgia a paciente
// deve assinar. Singleton editável pelo Console (a equipe ajusta sem secrets).
router.get("/config/contrato", async (_req, res): Promise<void> => {
  const config = await contratoConfigRepo.obter();
  res.json(ObterConfigContratoResponse.parse(config));
});

router.put("/config/contrato", async (req, res): Promise<void> => {
  const body = DefinirConfigContratoBody.safeParse(req.body);
  if (!body.success) {
    req.log.warn({ errors: body.error.message }, "Body inválido");
    res.status(400).json({ message: body.error.message });
    return;
  }
  // O schema gerado só garante o piso (mínimo 0) — sem teto nem inteiro. O
  // servidor é a fonte da verdade da mesma regra que a tela mostra: inteiro
  // entre 0 e 60. Rejeitamos fora disso em vez de salvar um padrão absurdo que
  // depois realimenta o onboarding da paciente.
  if (
    !diasNoIntervalo(body.data.prazoAssinaturaDiasAntes) ||
    !diasNoIntervalo(body.data.vencimentoSaldoDiasUteisAntes)
  ) {
    res.status(400).json({
      message: `Informe um número inteiro de dias entre ${PRAZO_DIAS_MIN} e ${PRAZO_DIAS_MAX}.`,
    });
    return;
  }
  const salvo = await contratoConfigRepo.salvar({
    prazoAssinaturaDiasAntes: body.data.prazoAssinaturaDiasAntes,
    vencimentoSaldoDiasUteisAntes: body.data.vencimentoSaldoDiasUteisAntes,
  });
  res.json(DefinirConfigContratoResponse.parse(salvo));
});

// Prompts da geração de documentos por IA (contrato/termo/refino). A equipe
// edita o texto dos prompts pela tela de admin, sem mexer em código. Cada prompt
// carrega tokens {{...}} que o servidor preenche na hora de gerar — a validação
// garante que nenhum token obrigatório foi removido.
router.get("/config/documento-prompts", async (_req, res): Promise<void> => {
  const config = await documentoPromptConfigRepo.obter();
  res.json(ObterConfigPromptsResponse.parse(config));
});

router.put("/config/documento-prompts", async (req, res): Promise<void> => {
  const body = DefinirConfigPromptsBody.safeParse(req.body);
  if (!body.success) {
    req.log.warn({ errors: body.error.message }, "Body inválido");
    res.status(400).json({ message: body.error.message });
    return;
  }
  try {
    // `null` = restaurar padrão; ausente = não mexer; texto = customizar. O repo
    // valida tamanho mínimo e presença dos tokens obrigatórios de cada prompt.
    const salvo = await documentoPromptConfigRepo.salvar({
      contrato: body.data.contrato,
      termo: body.data.termo,
      refino: body.data.refino,
    });
    res.json(DefinirConfigPromptsResponse.parse(salvo));
  } catch (err) {
    if (err instanceof PromptInvalidoError) {
      const { tipo, validacao } = err;
      const partes: string[] = [];
      if (validacao.muitoCurto) {
        partes.push(`o texto está muito curto (mínimo ${PROMPT_MIN_LEN} caracteres)`);
      }
      if (validacao.tokensFaltando.length > 0) {
        partes.push(
          `faltam os tokens obrigatórios: ${validacao.tokensFaltando
            .map((t) => `{{${t}}}`)
            .join(", ")}`,
        );
      }
      res.status(400).json({
        message: `Prompt de ${tipo} inválido — ${partes.join("; ")}.`,
      });
      return;
    }
    throw err;
  }
});

// Varre os contratos pendentes e avisa a equipe sobre prazos vencendo. Sem
// efeitos colaterais nos GETs: o Console chama este POST ao carregar a home.
// A deduplicação (contratoPrazoAlertadoEm) garante um aviso por paciente.
router.post(
  "/contratos/alertas/processar",
  async (_req, res): Promise<void> => {
    const resultado = await processarAlertasPrazo();
    res.json(ProcessarAlertasPrazoResponse.parse(resultado));
  },
);

router.get("/pacientes/arquivados", async (_req, res): Promise<void> => {
  const [pacientes, { prazoAssinaturaDiasAntes: diasAntes }] =
    await Promise.all([
      pacientesRepo.listarArquivados(),
      contratoConfigRepo.obter(),
    ]);
  res.json(
    ListarPacientesArquivadosResponse.parse(
      pacientes.map((p) => pacienteParaDTO(p, { diasAntes })),
    ),
  );
});

router.post("/pacientes", async (req, res): Promise<void> => {
  const parsed = CriarPacienteBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Body inválido");
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  // CPF é OPCIONAL (o Twenty nem sempre tem, e o cadastro pode ser feito antes
  // de tê-lo). Quando informado, precisa ser válido; vazio segue como "".
  const cpf = (parsed.data.cpf ?? "").trim();
  if (cpf && !cpfValido(cpf)) {
    res.status(400).json({ message: "CPF inválido (confira os dígitos)." });
    return;
  }
  if (!telefoneValido(parsed.data.telefone)) {
    res.status(400).json({ message: "Telefone inválido (use DDD + número)." });
    return;
  }

  // Datas no passado são impossíveis para uma cirurgia/cobrança que ainda vão
  // acontecer. O date picker do app já bloqueia isso, mas uma requisição feita
  // fora do app poderia escapar — então rejeitamos no servidor também. Tudo em
  // yyyy-mm-dd no fuso da clínica, comparável lexicograficamente.
  const hoje = hojeISO();
  if (!dataISOValida(parsed.data.dataCirurgia)) {
    res.status(400).json({ message: "Data da cirurgia inválida (use AAAA-MM-DD)." });
    return;
  }
  if (parsed.data.dataCirurgia < hoje) {
    res
      .status(400)
      .json({ message: "A data da cirurgia não pode estar no passado." });
    return;
  }
  if (parsed.data.dataPagamentoPendente != null) {
    if (!dataISOValida(parsed.data.dataPagamentoPendente)) {
      res
        .status(400)
        .json({ message: "Data do pagamento pendente inválida (use AAAA-MM-DD)." });
      return;
    }
    if (parsed.data.dataPagamentoPendente < hoje) {
      res.status(400).json({
        message: "A data do pagamento pendente não pode estar no passado.",
      });
      return;
    }
  }

  // Deduplicação por CPF só faz sentido quando há CPF — sem ele, não dá para
  // afirmar que é a mesma paciente, então pulamos as duas checagens.
  if (cpf) {
    // Garante que o CPF não pertença a outra paciente ATIVA já cadastrada. A
    // checagem é feita após as validações de formato e data para que o usuário
    // receba primeiro os erros de formatação mais simples de corrigir.
    const cpfAtivo = await pacientesRepo.obterPorCpf(cpf, {
      apenasAtivos: true,
    });
    if (cpfAtivo) {
      res.status(409).json({
        message: "Este CPF já está cadastrado para outra paciente.",
        codigo: "cpf_ativo",
      });
      return;
    }

    // Um cadastro ARQUIVADO com o mesmo CPF não bloqueia: pode ser uma paciente
    // que voltou para um novo procedimento, ou um cadastro arquivado por engano.
    // Em vez de um 409 confuso, devolvemos o resumo do arquivado para o Console
    // oferecer a restauração — ou um novo cadastro, se a equipe reenviar com
    // `permitirCpfArquivado`.
    if (!parsed.data.permitirCpfArquivado) {
      const cpfArquivado = await pacientesRepo.obterPorCpf(cpf, {
        apenasArquivados: true,
      });
      if (cpfArquivado) {
        res.status(409).json({
          message:
            "Já existe um cadastro arquivado com este CPF. Restaure-o ou crie um novo cadastro.",
          codigo: "cpf_arquivado",
          pacienteArquivado: {
            id: cpfArquivado.id,
            nome: cpfArquivado.nome,
            dataCirurgia: cpfArquivado.dataCirurgia,
          },
        });
        return;
      }
    }
  }

  // Resolve o médico responsável: usa o escolhido ou cai no padrão (Dra. Karla).
  // Os campos planos (medica/crm/rqe/clinica) são um SNAPSHOT do médico no
  // momento do cadastro, preservando o texto de handoff e a auditoria.
  const medico =
    (parsed.data.medicoId != null
      ? await medicosRepo.obterPorId(parsed.data.medicoId)
      : undefined) ?? (await medicosRepo.obterPadrao());
  const medicoCampos: Partial<InsertPaciente> = medico
    ? {
        medicoId: medico.id,
        medica: medico.nome,
        crm: medico.crm,
        rqe: medico.rqe,
        clinica: medico.clinica,
      }
    : {};

  // Default: o vencimento cai N dias úteis antes da cirurgia (config operacional
  // editável pela equipe) quando há saldo e nenhuma data foi informada.
  const config = await contratoConfigRepo.obter();
  const pendentePost = parsed.data.valorPendente ?? 0;
  const vencimentoPost =
    pendentePost > 0 && !parsed.data.dataPagamentoPendente && parsed.data.dataCirurgia
      ? diasUteisAntes(parsed.data.dataCirurgia, config.vencimentoSaldoDiasUteisAntes)
      : (parsed.data.dataPagamentoPendente ?? null);

  // Local de cirurgia: escolhido da lista (localId) ou texto livre (que cria um
  // novo local). O snapshot preserva os campos do local usados nas mensagens.
  const localRow = await resolverLocalDoCadastro(
    parsed.data.localId,
    parsed.data.local,
    parsed.data.localEndereco,
  );
  const localCampos: Partial<InsertPaciente> = localRow
    ? {
        local: localRow.nome,
        localEndereco: localRow.endereco || null,
        localId: localRow.id,
        localSnapshot: perfilDeLocal(localRow),
      }
    : {
        local: parsed.data.local,
        localEndereco: parsed.data.localEndereco?.trim() || null,
      };

  const paciente = await pacientesRepo.criar({
    nome: parsed.data.nome,
    cpf,
    telefone: parsed.data.telefone,
    procedimentos: parsed.data.procedimentos,
    dataCirurgia: parsed.data.dataCirurgia,
    horario: parsed.data.horario,
    valorSinal: String(parsed.data.valorSinal),
    valorPendente: String(parsed.data.valorPendente),
    dataPagamentoPendente: vencimentoPost,
    laser: parsed.data.laser,
    ...localCampos,
    equipeAnestesia: parsed.data.equipeAnestesia,
    equipeAnestesiaTelefone: parsed.data.equipeAnestesiaTelefone?.trim() || null,
    vendedoraId: parsed.data.vendedoraId ?? null,
    // E-mail e vínculo com o contato do Twenty (ambos opcionais). Normaliza
    // string vazia para null para não gravar "" no lugar de ausência.
    email: parsed.data.email?.trim() || null,
    twentyContactId: parsed.data.twentyContactId?.trim() || null,
    // Identidade complementar (opcional): RG, nascimento e endereço residencial.
    rg: parsed.data.rg?.trim() || null,
    nascimento: parsed.data.nascimento?.trim() || null,
    endereco: parsed.data.endereco?.trim() || null,
    ...medicoCampos,
  });

  await registrarMarco(paciente.id, "criado");

  const diasAntes = config.prazoAssinaturaDiasAntes;
  res.status(201).json(
    CriarPacienteResponse.parse({
      paciente: pacienteParaDTO(paciente, { diasAntes }),
      saidas: montarSaidas(paciente),
    }),
  );
});

router.get("/pacientes/:id", async (req, res): Promise<void> => {
  const params = ObterPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const encontrado = await pacientesRepo.obterPorId(params.data.id);
  if (!encontrado) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  // Ao abrir o processo, consulta a Autentique ao vivo para contrato e termo.
  const [pacienteContrato] = await Promise.all([
    refrescarStatusContrato(encontrado),
  ]);
  const paciente = await refrescarStatusTermo(pacienteContrato);

  const { prazoAssinaturaDiasAntes: diasAntes } =
    await contratoConfigRepo.obter();
  res.json(
    ObterPacienteResponse.parse({
      paciente: pacienteParaDTO(paciente, { diasAntes }),
      saidas: montarSaidas(paciente),
    }),
  );
});

router.patch("/pacientes/:id", async (req, res): Promise<void> => {
  const params = AtualizarPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const parsed = AtualizarPacienteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  // CPF opcional: valida só quando informado e não-vazio (vazio = limpar/sem CPF).
  const cpfPatch = parsed.data.cpf?.trim();
  if (cpfPatch && !cpfValido(cpfPatch)) {
    res.status(400).json({ message: "CPF inválido (confira os dígitos)." });
    return;
  }
  if (
    parsed.data.telefone !== undefined &&
    !telefoneValido(parsed.data.telefone)
  ) {
    res.status(400).json({ message: "Telefone inválido (use DDD + número)." });
    return;
  }

  if (cpfPatch) {
    const cpfExistente = await pacientesRepo.obterPorCpf(cpfPatch, {
      excluirId: params.data.id,
      apenasAtivos: true,
    });
    if (cpfExistente) {
      res.status(409).json({
        message: "Este CPF já está cadastrado para outra paciente.",
        codigo: "cpf_ativo",
      });
      return;
    }
  }

  if (Object.keys(parsed.data).length === 0) {
    res
      .status(400)
      .json({ message: "Informe ao menos um campo para atualizar" });
    return;
  }

  const anterior = await pacientesRepo.obterPorId(params.data.id);
  if (!anterior) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const {
    valorSinal,
    valorPendente,
    contratoLink,
    termoLink,
    medicoId,
    email,
    twentyContactId,
    rg,
    nascimento,
    endereco,
    local,
    localEndereco,
    localId,
    ...resto
  } = parsed.data;

  // Local de cirurgia: se veio um localId ou um novo texto de local, re-resolve
  // (reusa/cria o local) e re-snapshota. Caso contrário, não mexe no vínculo.
  let localCampos: Partial<InsertPaciente> = {};
  if (localId !== undefined || local !== undefined) {
    const localRow = await resolverLocalDoCadastro(
      localId,
      local ?? anterior.local,
      localEndereco !== undefined ? localEndereco : anterior.localEndereco,
    );
    localCampos = localRow
      ? {
          local: localRow.nome,
          localEndereco: localRow.endereco || null,
          localId: localRow.id,
          localSnapshot: perfilDeLocal(localRow),
        }
      : {
          ...(local !== undefined ? { local } : {}),
          ...(localEndereco !== undefined
            ? { localEndereco: localEndereco?.trim() || null }
            : {}),
        };
  }

  // Identidade vinda do contato do Twenty: o e-mail e o vínculo (twentyContactId)
  // chegam quando a equipe troca o paciente pela busca no Twenty no editor.
  // Normalizamos vazio → null para não gravar strings vazias na coluna. RG,
  // nascimento e endereço seguem o mesmo tratamento (campos de identidade).
  const camposContato: Partial<InsertPaciente> = {
    ...(email !== undefined ? { email: email?.trim() || null } : {}),
    ...(twentyContactId !== undefined
      ? { twentyContactId: twentyContactId?.trim() || null }
      : {}),
    ...(rg !== undefined ? { rg: rg?.trim() || null } : {}),
    ...(nascimento !== undefined
      ? { nascimento: nascimento?.trim() || null }
      : {}),
    ...(endereco !== undefined ? { endereco: endereco?.trim() || null } : {}),
  };

  // O frontend cola a URL/ID da Autentique em `contratoLink`; aqui extraímos o
  // ID do documento e zeramos o cache de status — a verificação ao vivo abaixo
  // (ou ao reabrir o processo) preenche o status real.
  const camposContrato =
    contratoLink !== undefined
      ? {
          contratoAutentiqueId: contratoLink
            ? extrairDocumentoId(contratoLink)
            : null,
          contratoStatus: null,
          contratoAssinadoEm: null,
          contratoVerificadoEm: null,
        }
      : {};

  // Mesmo padrão para o termo de consentimento.
  const camposTermo =
    termoLink !== undefined
      ? {
          termoAutentiqueId: termoLink
            ? extrairDocumentoId(termoLink)
            : null,
          termoStatus: null,
          termoAssinadoEm: null,
          termoVerificadoEm: null,
        }
      : {};

  // Troca de médico: re-snapshot dos campos planos a partir do médico escolhido.
  // medicoId = null desvincula sem mexer no snapshot (preserva o handoff atual).
  let medicoCampos: Partial<InsertPaciente> = {};
  if (medicoId !== undefined) {
    if (medicoId === null) {
      medicoCampos = { medicoId: null };
    } else {
      const medico = await medicosRepo.obterPorId(medicoId);
      medicoCampos = medico
        ? {
            medicoId: medico.id,
            medica: medico.nome,
            crm: medico.crm,
            rqe: medico.rqe,
            clinica: medico.clinica,
          }
        : { medicoId };
    }
  }

  // Mexer na data da cirurgia ou no override do prazo reabre o aviso de prazo.
  // A data da cirurgia afeta os prazos de ambos os documentos; cada override só
  // afeta o seu, então cada carimbo de aviso é reaberto de forma independente.
  const dataCirurgiaMudou =
    parsed.data.dataCirurgia !== undefined &&
    parsed.data.dataCirurgia !== anterior.dataCirurgia;
  const prazoContratoMudou =
    dataCirurgiaMudou ||
    (parsed.data.contratoPrazoOverride !== undefined &&
      (parsed.data.contratoPrazoOverride ?? null) !==
        (anterior.contratoPrazoOverride ?? null));
  const prazoTermoMudou =
    dataCirurgiaMudou ||
    (parsed.data.termoPrazoOverride !== undefined &&
      (parsed.data.termoPrazoOverride ?? null) !==
        (anterior.termoPrazoOverride ?? null));
  const resetAlerta: Partial<InsertPaciente> = {
    ...(prazoContratoMudou ? { contratoPrazoAlertadoEm: null } : {}),
    ...(prazoTermoMudou ? { termoPrazoAlertadoEm: null } : {}),
  };

  // Default de vencimento do saldo: N dias úteis antes da cirurgia (config
  // operacional editável pela equipe). Aplica somente quando a data não foi
  // informada explicitamente, a paciente ainda não tem uma data salva, e o saldo
  // em aberto (efetivo) é positivo.
  const config = await contratoConfigRepo.obter();
  const vencimentoExplicito = parsed.data.dataPagamentoPendente !== undefined;
  const pendenteEfetivo = valorPendente ?? Number(anterior.valorPendente);
  const cirurgiaEfetiva = parsed.data.dataCirurgia ?? anterior.dataCirurgia;
  const defaultVencimentoPatch: Partial<InsertPaciente> =
    !vencimentoExplicito &&
    !anterior.dataPagamentoPendente &&
    pendenteEfetivo > 0 &&
    cirurgiaEfetiva
      ? { dataPagamentoPendente: diasUteisAntes(cirurgiaEfetiva, config.vencimentoSaldoDiasUteisAntes) }
      : {};

  let paciente = await pacientesRepo.atualizar(params.data.id, {
    ...resto,
    ...(valorSinal !== undefined ? { valorSinal: String(valorSinal) } : {}),
    ...(valorPendente !== undefined
      ? { valorPendente: String(valorPendente) }
      : {}),
    ...(parsed.data.contratoLinkAssinaturaManual !== undefined
      ? {
          contratoLinkAssinaturaManual:
            parsed.data.contratoLinkAssinaturaManual?.trim() || null,
        }
      : {}),
    ...(parsed.data.contratoPrazoOverride !== undefined
      ? {
          contratoPrazoOverride:
            parsed.data.contratoPrazoOverride?.trim() || null,
        }
      : {}),
    ...(parsed.data.termoLinkAssinaturaManual !== undefined
      ? {
          termoLinkAssinaturaManual:
            parsed.data.termoLinkAssinaturaManual?.trim() || null,
        }
      : {}),
    ...(parsed.data.termoPrazoOverride !== undefined
      ? {
          termoPrazoOverride:
            parsed.data.termoPrazoOverride?.trim() || null,
        }
      : {}),
    ...medicoCampos,
    ...localCampos,
    ...camposContato,
    ...resetAlerta,
    ...camposContrato,
    ...defaultVencimentoPatch,
    ...camposTermo,
  });

  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  // Trilha de auditoria: registra apenas os campos que realmente mudaram.
  const alteracoes = diffPaciente(anterior, paciente);
  if (alteracoes.length > 0) {
    await pacientesRepo.registrarHistorico(paciente.id, alteracoes);
  }

  // Se o vínculo do contrato mudou, já consulta a Autentique para devolver o
  // status atualizado de imediato (sem esperar um novo carregamento).
  if (contratoLink !== undefined && paciente) {
    paciente = await refrescarStatusContrato(paciente);
  }

  // Mesmo para o termo: se o vínculo mudou, consulta a Autentique de imediato.
  if (termoLink !== undefined && paciente) {
    paciente = await refrescarStatusTermo(paciente);
  }

  // Marco automático quando o estágio muda para Véspera/Cirurgia (ou Enviado).
  if (
    parsed.data.estagio !== undefined &&
    parsed.data.estagio !== anterior.estagio &&
    paciente
  ) {
    const marco = marcoDoEstagio(parsed.data.estagio);
    if (marco) await registrarMarco(paciente.id, marco);
  }

  const diasAntes = config.prazoAssinaturaDiasAntes;
  res.json(
    AtualizarPacienteResponse.parse({
      paciente: pacienteParaDTO(paciente, { diasAntes }),
      saidas: montarSaidas(paciente),
    }),
  );
});

/**
 * Dev/test-only endpoint — sets contrato/termo status directly, bypassing the
 * Autentique integration. Returns 404 in production so it is never reachable
 * outside of the development environment.
 *
 * Used by e2e tests to seed specific contract states (pending with deadline,
 * signed with a date) without needing a real Autentique document.
 */
type StatusDoc = "assinado" | "pendente" | "recusado" | "indisponivel";
const STATUS_DOCS_VALIDOS: ReadonlySet<string> = new Set([
  "assinado",
  "pendente",
  "recusado",
  "indisponivel",
]);

function isStatusDoc(v: unknown): v is StatusDoc | null {
  return v === null || (typeof v === "string" && STATUS_DOCS_VALIDOS.has(v));
}

router.patch("/pacientes/:id/_dev/status", async (req, res): Promise<void> => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ message: "Not found" });
    return;
  }
  const params = AtualizarPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const body = req.body as Record<string, unknown>;
  if (
    ("contratoStatus" in body && !isStatusDoc(body.contratoStatus)) ||
    ("contratoAssinadoEm" in body &&
      body.contratoAssinadoEm !== null &&
      typeof body.contratoAssinadoEm !== "string") ||
    ("termoStatus" in body && !isStatusDoc(body.termoStatus)) ||
    ("termoAssinadoEm" in body &&
      body.termoAssinadoEm !== null &&
      typeof body.termoAssinadoEm !== "string")
  ) {
    res.status(400).json({ message: "Campos ou valores inválidos" });
    return;
  }
  const updates: Partial<{
    contratoStatus: StatusDoc | null;
    contratoAssinadoEm: string | null;
    termoStatus: StatusDoc | null;
    termoAssinadoEm: string | null;
  }> = {};
  if ("contratoStatus" in body)
    updates.contratoStatus = (body.contratoStatus as StatusDoc | null) ?? null;
  if ("contratoAssinadoEm" in body)
    updates.contratoAssinadoEm = (body.contratoAssinadoEm as string | null) ?? null;
  if ("termoStatus" in body)
    updates.termoStatus = (body.termoStatus as StatusDoc | null) ?? null;
  if ("termoAssinadoEm" in body)
    updates.termoAssinadoEm = (body.termoAssinadoEm as string | null) ?? null;
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ message: "Informe ao menos um campo" });
    return;
  }
  const paciente = await pacientesRepo.atualizar(params.data.id, updates);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }
  res.json({ ok: true });
});

router.get("/pacientes/:id/historico", async (req, res): Promise<void> => {
  const params = ListarHistoricoPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorId(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const historico = await pacientesRepo.listarHistorico(params.data.id);
  res.json(
    ListarHistoricoPacienteResponse.parse(
      historico.map((h) => ({
        id: h.id,
        alteracoes: h.alteracoes,
        createdAt: h.createdAt.toISOString(),
      })),
    ),
  );
});

router.get("/pacientes/:id/eventos", async (req, res): Promise<void> => {
  const params = ObterAtividadePacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorId(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const eventos = await pacientesRepo.listarEventos(params.data.id);
  const aberturas = eventos.filter((e) => e.tipo === "abertura");
  // Eventos vêm da mais recente para a mais antiga; a primeira abertura é a
  // mais antiga da lista de aberturas.
  const primeiraAbertura = aberturas.at(-1)?.createdAt;

  res.json(
    ObterAtividadePacienteResponse.parse({
      abriu: aberturas.length > 0,
      primeiraAbertura: primeiraAbertura
        ? primeiraAbertura.toISOString()
        : null,
      totalAberturas: aberturas.length,
      eventos: eventos.map((e) => ({
        id: e.id,
        tipo: e.tipo,
        rotulo: e.rotulo,
        descricao: descreverEvento(e.tipo, e.rotulo),
        createdAt: e.createdAt.toISOString(),
      })),
    }),
  );
});

router.post("/pacientes/:id/aprovar", async (req, res): Promise<void> => {
  const params = AprovarPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const atual = await pacientesRepo.obterPorId(params.data.id);
  if (!atual) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const paciente = await pacientesRepo.atualizar(params.data.id, {
    estagio: "Enviado",
    // Carimba o envio do link (marco "link_enviado"); preserva o primeiro
    // envio em caso de reaprovação.
    ...(atual.linkEnviadoEm == null ? { linkEnviadoEm: new Date() } : {}),
  });

  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  await registrarMarco(paciente.id, "enviado");

  const { prazoAssinaturaDiasAntes: diasAntes } =
    await contratoConfigRepo.obter();
  res.json(
    AprovarPacienteResponse.parse({
      paciente: pacienteParaDTO(paciente, { diasAntes }),
      saidas: montarSaidas(paciente),
    }),
  );
});

router.post("/pacientes/:id/arquivar", async (req, res): Promise<void> => {
  const params = ArquivarPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.arquivar(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  await registrarMarco(paciente.id, "arquivado");

  const { prazoAssinaturaDiasAntes: diasAntes } =
    await contratoConfigRepo.obter();
  res.json(
    ArquivarPacienteResponse.parse({
      paciente: pacienteParaDTO(paciente, { diasAntes }),
      saidas: montarSaidas(paciente),
    }),
  );
});

router.post("/pacientes/:id/restaurar", async (req, res): Promise<void> => {
  const params = RestaurarPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.restaurar(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  await registrarMarco(paciente.id, "restaurado");

  const { prazoAssinaturaDiasAntes: diasAntes } =
    await contratoConfigRepo.obter();
  res.json(
    RestaurarPacienteResponse.parse({
      paciente: pacienteParaDTO(paciente, { diasAntes }),
      saidas: montarSaidas(paciente),
    }),
  );
});

// Marca/desmarca um marco pós-operatório manual (retirada de pontos, retornos).
// Carimba a data quando concluido=true; limpa quando false. Só registra na
// timeline (com autor) ao marcar — desmarcar é silencioso.
router.post("/pacientes/:id/marco-manual", async (req, res): Promise<void> => {
  const params = MarcarMarcoManualParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const body = MarcarMarcoManualBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: body.error.message });
    return;
  }

  const { marco, concluido, autor } = body.data;
  const valor = concluido ? new Date() : null;
  // Cada marco manual mapeia para a sua coluna de carimbo. Switch explícito
  // mantém a tipagem certinha (sem chave computada).
  const patch: Partial<InsertPaciente> =
    marco === "retirada_pontos"
      ? { retiradaPontosEm: valor }
      : marco === "retorno_1"
        ? { retorno1Em: valor }
        : marco === "retorno_2"
          ? { retorno2Em: valor }
          : { retorno3Em: valor };

  const paciente = await pacientesRepo.atualizar(params.data.id, patch);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  if (concluido) {
    await registrarMarcoManual(paciente.id, marco, autor ?? null);
  }

  const { prazoAssinaturaDiasAntes: diasAntes } =
    await contratoConfigRepo.obter();
  res.json(
    MarcarMarcoManualResponse.parse({
      paciente: pacienteParaDTO(paciente, { diasAntes }),
      saidas: montarSaidas(paciente),
    }),
  );
});

router.get("/pacientes/:id/timeline", async (req, res): Promise<void> => {
  const params = ListarTimelineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const eventos = await timelineRepo.listarPorPaciente(params.data.id);
  res.json(ListarTimelineResponse.parse(eventos.map(timelineParaDTO)));
});

router.post("/pacientes/:id/timeline", async (req, res): Promise<void> => {
  const params = AdicionarNotaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const parsed = AdicionarNotaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorId(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const evento = await timelineRepo.criar({
    pacienteId: params.data.id,
    tipo: "nota",
    titulo: parsed.data.titulo,
    descricao: parsed.data.descricao ?? null,
    automatico: false,
  });

  res.status(201).json(AdicionarNotaResponse.parse(timelineParaDTO(evento)));
});

// Registra que a equipe lembrou a paciente pelo WhatsApp (paciente que ainda
// não abriu o link). Gera um marco na timeline — quem/quando — para que dois
// atendentes não façam o mesmo follow-up. O texto canônico fica no servidor.
router.post("/pacientes/:id/lembrete", async (req, res): Promise<void> => {
  const params = RegistrarLembreteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorId(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  // Quem disparou o lembrete (capturado pelo Console). Aceitamos o corpo vazio
  // por retrocompatibilidade: nesse caso o crédito cai para "A equipe".
  const corpo = RegistrarLembreteBody.safeParse(req.body ?? {});
  const autor = corpo.success
    ? corpo.data.autor?.trim() || null
    : null;
  const quem = autor ?? "A equipe";

  const evento = await timelineRepo.criar({
    pacienteId: params.data.id,
    tipo: TIPO_LEMBRETE_WHATSAPP,
    titulo: "Lembrete enviado pelo WhatsApp",
    descricao: `${quem} enviou um lembrete pelo WhatsApp com o link do pré-operatório, porque a paciente ainda não tinha aberto.`,
    autor,
    automatico: false,
  });

  res
    .status(201)
    .json(RegistrarLembreteResponse.parse(timelineParaDTO(evento)));
});

// ---------------------------------------------------------------------------
// Acompanhamento PÓS-operatório — check-ins (staff / Console, tema escuro).
// ---------------------------------------------------------------------------

router.get("/pacientes/:id/checkins", async (req, res): Promise<void> => {
  const params = ListarCheckinsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorId(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const checkins = await checkinsRepo.listarPorPaciente(params.data.id);
  const dto = await Promise.all(checkins.map(checkinParaDTO));
  res.json(ListarCheckinsResponse.parse(dto));
});

router.post("/pacientes/:id/checkins", async (req, res): Promise<void> => {
  const params = CriarCheckinParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const parsed = CriarCheckinBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorId(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const checkin = await checkinsRepo.criar({
    pacienteId: params.data.id,
    dia: parsed.data.dia,
    tipo: parsed.data.tipo,
    status: parsed.data.status ?? "pendente",
    nota: parsed.data.nota ?? null,
  });

  res.status(201).json(CriarCheckinResponse.parse(await checkinParaDTO(checkin)));
});

router.post(
  "/pacientes/:id/checkins/seed-padrao",
  async (req, res): Promise<void> => {
    const params = SemearCheckinsPadraoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const paciente = await pacientesRepo.obterPorId(params.data.id);
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado" });
      return;
    }

    const checkins = await checkinsRepo.semearPadrao(params.data.id);
    const dto = await Promise.all(checkins.map(checkinParaDTO));
    res.status(201).json(SemearCheckinsPadraoResponse.parse(dto));
  },
);

router.patch(
  "/pacientes/:id/checkins/:checkinId",
  async (req, res): Promise<void> => {
    const params = AtualizarCheckinParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }
    const parsed = AtualizarCheckinBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: parsed.error.message });
      return;
    }
    if (Object.keys(parsed.data).length === 0) {
      res
        .status(400)
        .json({ message: "Informe ao menos um campo para atualizar" });
      return;
    }

    const checkin = await checkinsRepo.obterPorId(params.data.checkinId);
    if (!checkin || checkin.pacienteId !== params.data.id) {
      res.status(404).json({ message: "Check-in não encontrado" });
      return;
    }

    const atualizado = await checkinsRepo.atualizar(params.data.checkinId, {
      ...(parsed.data.status !== undefined
        ? { status: parsed.data.status }
        : {}),
      ...(parsed.data.nota !== undefined
        ? { nota: parsed.data.nota ?? null }
        : {}),
      ...(parsed.data.sinalAtencao !== undefined
        ? { sinalAtencao: parsed.data.sinalAtencao }
        : {}),
    });
    if (!atualizado) {
      res.status(404).json({ message: "Check-in não encontrado" });
      return;
    }

    res.json(AtualizarCheckinResponse.parse(await checkinParaDTO(atualizado)));
  },
);

// ---------------------------------------------------------------------------
// Acompanhamento PÓS-operatório — público por token (página da paciente).
// ---------------------------------------------------------------------------

router.get("/publico/:token/checkins", async (req, res): Promise<void> => {
  const params = ListarCheckinsPublicoParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ message: "Página não encontrada" });
    return;
  }

  const paciente = await pacientesRepo.obterPorToken(params.data.token);
  if (!paciente) {
    res.status(404).json({ message: "Página não encontrada" });
    return;
  }

  const checkins = await checkinsRepo.listarPorPaciente(paciente.id);
  const dto = await Promise.all(checkins.map(checkinPublicoParaDTO));
  res.json(ListarCheckinsPublicoResponse.parse(dto));
});

// Upload de foto de um check-in tipo "foto" pela própria paciente (por token).
// Multipart (binário), por isso fora do contrato OpenAPI — o frontend usa fetch.
// Fail-closed: storage indisponível → 503; tipo de arquivo inválido → 400;
// token inválido/desconhecido → 404; check-in que não é "foto" → 400.
router.post(
  "/publico/:token/checkins/:checkinId/foto",
  uploadFoto.single("foto"),
  async (req, res): Promise<void> => {
    const token = req.params.token;
    const checkinId = Number(req.params.checkinId);
    if (typeof token !== "string" || !Number.isInteger(checkinId)) {
      res.status(404).json({ message: "Página não encontrada" });
      return;
    }

    const paciente = await pacientesRepo.obterPorToken(token);
    if (!paciente) {
      res.status(404).json({ message: "Página não encontrada" });
      return;
    }

    const checkin = await checkinsRepo.obterPorId(checkinId);
    if (!checkin || checkin.pacienteId !== paciente.id) {
      res.status(404).json({ message: "Check-in não encontrado" });
      return;
    }
    if (checkin.tipo !== "foto") {
      res
        .status(400)
        .json({ message: "Este check-in não aceita envio de foto." });
      return;
    }

    const arquivo = req.file;
    if (!arquivo) {
      res.status(400).json({ message: "Nenhuma foto enviada." });
      return;
    }
    if (!ehTipoFotoAceito(arquivo.mimetype)) {
      res
        .status(400)
        .json({ message: "Envie uma imagem JPEG ou PNG." });
      return;
    }

    if (!storageConfigurado()) {
      res.status(503).json({
        message: "Envio de fotos indisponível no momento. Tente mais tarde.",
      });
      return;
    }

    try {
      const fotoUrl = await uploadFotoCheckin({
        pacienteId: paciente.id,
        checkinId: checkin.id,
        buffer: arquivo.buffer,
        contentType: arquivo.mimetype as TipoFotoAceito,
      });
      const atualizado = await checkinsRepo.atualizar(checkin.id, {
        fotoUrl,
        status: "concluido",
      });
      // Avisa a equipe (fail-soft): a chamada nunca lança, mas garantimos que
      // qualquer falha jamais afete a resposta do upload da paciente.
      try {
        await notificarFotoCheckin(
          { nome: paciente.nome, id: paciente.id },
          { dia: checkin.dia },
        );
      } catch (err) {
        req.log.warn({ err }, "Falha ao avisar a equipe sobre foto de check-in");
      }
      res.status(200).json(await checkinPublicoParaDTO(atualizado!));
    } catch (err) {
      if (err instanceof StorageIndisponivelError) {
        req.log.warn({ err }, "Storage indisponível ao subir foto de check-in");
        res.status(503).json({
          message: "Envio de fotos indisponível no momento. Tente mais tarde.",
        });
        return;
      }
      throw err;
    }
  },
);

// Download/visualização do PDF assinado — Console (por id interno).
// Resposta binária (application/pdf), por isso fora do contrato OpenAPI: o
// frontend acessa via fetch e faz o proxy do blob. ?download=1 força attachment.
router.get(
  "/pacientes/:id/contrato/download",
  async (req, res): Promise<void> => {
    const params = ObterPacienteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const paciente = await pacientesRepo.obterPorId(params.data.id);
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado" });
      return;
    }

    await servirContratoAssinado(paciente, res, {
      download: req.query.download === "1",
      nomeArquivo: slugNome(paciente.nome),
    });
  },
);

// Lista de signatários do contrato e a situação de cada um ("por quem já foi
// assinado"). JSON fora do contrato OpenAPI (o frontend consome via fetch cru).
// Somente leitura na Autentique; degrada para disponivel:false sem quebrar.
router.get(
  "/pacientes/:id/contrato/assinaturas",
  async (req, res): Promise<void> => {
    const params = ObterPacienteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const paciente = await pacientesRepo.obterPorId(params.data.id);
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado" });
      return;
    }

    if (!paciente.contratoAutentiqueId) {
      res.json({ disponivel: false, assinaturas: [] });
      return;
    }

    res.json(await listarAssinaturasContrato(paciente.contratoAutentiqueId));
  },
);

// Download/visualização do PDF do termo assinado — Console (por id interno).
router.get(
  "/pacientes/:id/termo/download",
  async (req, res): Promise<void> => {
    const params = ObterPacienteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const paciente = await pacientesRepo.obterPorId(params.data.id);
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado" });
      return;
    }

    await servirTermoAssinado(paciente, res, {
      download: req.query.download === "1",
      nomeArquivo: slugNomeTermo(paciente.nome),
    });
  },
);

// ----- Documentos (PDFs) anexados à paciente -----

function documentoParaDTO(d: {
  id: number;
  rotulo: string;
  nomeArquivo: string;
  contentType: string;
  tamanho: number;
  createdAt: Date;
}) {
  return {
    id: d.id,
    rotulo: d.rotulo,
    nomeArquivo: d.nomeArquivo,
    contentType: d.contentType,
    tamanho: d.tamanho,
    createdAt: d.createdAt.toISOString(),
  };
}

router.get("/pacientes/:id/documentos", async (req, res): Promise<void> => {
  const params = ListarDocumentosParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorId(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const documentos = await pacientesRepo.listarDocumentos(params.data.id);
  res.json(ListarDocumentosResponse.parse(documentos.map(documentoParaDTO)));
});

router.post("/pacientes/:id/documentos", async (req, res): Promise<void> => {
  const params = RegistrarDocumentoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const body = RegistrarDocumentoBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: body.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorId(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  // Só aceitamos PDF e impomos um limite de tamanho — defesa no servidor,
  // independente das checagens do frontend.
  if (body.data.contentType !== TIPO_PDF) {
    res.status(400).json({ message: "Apenas arquivos PDF são aceitos." });
    return;
  }
  if (body.data.tamanho <= 0 || body.data.tamanho > TAMANHO_MAXIMO) {
    res.status(400).json({
      message: "Arquivo muito grande (máximo 20 MB).",
    });
    return;
  }
  if (!body.data.objectPath.startsWith("/objects/")) {
    res.status(400).json({ message: "Caminho de arquivo inválido." });
    return;
  }

  const rotulo = body.data.rotulo.trim().slice(0, 120) || "Documento";
  const nomeArquivo = body.data.nomeArquivo.trim().slice(0, 200) || "documento.pdf";

  const documento = await pacientesRepo.criarDocumento({
    pacienteId: params.data.id,
    rotulo,
    nomeArquivo,
    objectPath: body.data.objectPath,
    contentType: TIPO_PDF,
    tamanho: body.data.tamanho,
  });

  // Registra na linha do tempo do processo (auditoria leve, não bloqueante).
  try {
    await timelineRepo.criar({
      pacienteId: params.data.id,
      tipo: "documento",
      titulo: "Documento anexado",
      descricao: `${rotulo} — ${nomeArquivo}`,
      automatico: true,
    });
  } catch (err) {
    req.log.warn({ err }, "Falha ao registrar documento na timeline");
  }

  res.status(201).json(RegistrarDocumentoResponse.parse(documentoParaDTO(documento)));
});

router.delete(
  "/pacientes/:id/documentos/:documentoId",
  async (req, res): Promise<void> => {
    const params = RemoverDocumentoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const documento = await pacientesRepo.obterDocumento(
      params.data.id,
      params.data.documentoId,
    );
    if (!documento) {
      res.status(404).json({ message: "Documento não encontrado" });
      return;
    }

    await pacientesRepo.removerDocumento(params.data.id, params.data.documentoId);
    // Apaga o objeto do armazenamento (idempotente; não falha a remoção).
    await apagarObjetoDocumento(documento.objectPath);

    try {
      await timelineRepo.criar({
        pacienteId: params.data.id,
        tipo: "documento",
        titulo: "Documento removido",
        descricao: `${documento.rotulo} — ${documento.nomeArquivo}`,
        automatico: true,
      });
    } catch (err) {
      req.log.warn({ err }, "Falha ao registrar remoção na timeline");
    }

    res.status(204).end();
  },
);

// Download/visualização de um PDF anexado — Console (por id interno).
// Resposta binária, fora do contrato OpenAPI. ?download=1 força attachment.
router.get(
  "/pacientes/:id/documentos/:documentoId/download",
  async (req, res): Promise<void> => {
    const params = RemoverDocumentoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const documento = await pacientesRepo.obterDocumento(
      params.data.id,
      params.data.documentoId,
    );
    if (!documento) {
      res.status(404).json({ message: "Documento não encontrado" });
      return;
    }

    await servirDocumento(documento, res, {
      download: req.query.download === "1",
    });
  },
);

// ----- Pedido de exames (PDF, um por paciente) -----

function pedidoExamesParaDTO(p: {
  nomeArquivo: string;
  tamanho: number;
  createdAt: Date;
}) {
  return {
    nomeArquivo: p.nomeArquivo,
    tamanho: p.tamanho,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/pacientes/:id/pedido-exames", async (req, res): Promise<void> => {
  const params = ObterPedidoExamesParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorId(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const pedido = await pacientesRepo.obterPedidoExames(params.data.id);
  res.json(
    ObterPedidoExamesResponse.parse({
      pedidoExames: pedido ? pedidoExamesParaDTO(pedido) : null,
    }),
  );
});

// Upload do PDF de pedido de exames (multipart). Substitui o anterior, se houver.
// Fora do contrato OpenAPI (multipart); o Console chama via fetch com FormData.
// Fail-closed: storage indisponível → 503; não-PDF → 400; sem arquivo → 400.
router.post(
  "/pacientes/:id/pedido-exames",
  uploadPedidoExamesPdf.single("arquivo"),
  async (req, res): Promise<void> => {
    const params = ObterPedidoExamesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const paciente = await pacientesRepo.obterPorId(params.data.id);
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado" });
      return;
    }

    const arquivo = req.file;
    if (!arquivo) {
      res.status(400).json({ message: "Nenhum arquivo enviado." });
      return;
    }
    if (arquivo.mimetype !== TIPO_PDF) {
      res.status(400).json({ message: "Apenas arquivos PDF são aceitos." });
      return;
    }
    if (arquivo.size <= 0 || arquivo.size > TAMANHO_MAXIMO) {
      res.status(400).json({ message: "Arquivo muito grande (máximo 20 MB)." });
      return;
    }
    if (!storageExamesConfigurado()) {
      res.status(503).json({
        message: "Envio de arquivos indisponível no momento. Tente mais tarde.",
      });
      return;
    }

    const nomeArquivo =
      (arquivo.originalname || "pedido-de-exames.pdf").trim().slice(0, 200) ||
      "pedido-de-exames.pdf";

    try {
      const objectPath = await uploadPedidoExames({
        pacienteId: params.data.id,
        buffer: arquivo.buffer,
      });

      const { pedido, objectPathAnterior } =
        await pacientesRepo.salvarPedidoExames({
          pacienteId: params.data.id,
          nomeArquivo,
          objectPath,
          contentType: TIPO_PDF,
          tamanho: arquivo.size,
        });

      // Apaga o objeto substituído do storage (idempotente; não falha o upload).
      if (objectPathAnterior) {
        await apagarPedidoExamesObjeto(objectPathAnterior);
      }

      try {
        await timelineRepo.criar({
          pacienteId: params.data.id,
          tipo: "documento",
          titulo: "Pedido de exames anexado",
          descricao: nomeArquivo,
          automatico: true,
        });
      } catch (err) {
        req.log.warn({ err }, "Falha ao registrar pedido de exames na timeline");
      }

      res
        .status(201)
        .json(
          ObterPedidoExamesResponse.parse({
            pedidoExames: pedidoExamesParaDTO(pedido),
          }),
        );
    } catch (err) {
      if (err instanceof StorageIndisponivelError) {
        req.log.warn({ err }, "Storage indisponível ao subir pedido de exames");
        res.status(503).json({
          message: "Envio de arquivos indisponível no momento. Tente mais tarde.",
        });
        return;
      }
      throw err;
    }
  },
);

router.delete(
  "/pacientes/:id/pedido-exames",
  async (req, res): Promise<void> => {
    const params = RemoverPedidoExamesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const paciente = await pacientesRepo.obterPorId(params.data.id);
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado" });
      return;
    }

    const objectPath = await pacientesRepo.removerPedidoExames(params.data.id);
    if (objectPath) {
      await apagarPedidoExamesObjeto(objectPath);
      try {
        await timelineRepo.criar({
          pacienteId: params.data.id,
          tipo: "documento",
          titulo: "Pedido de exames removido",
          descricao: "",
          automatico: true,
        });
      } catch (err) {
        req.log.warn({ err }, "Falha ao registrar remoção do pedido de exames");
      }
    }

    res.status(204).end();
  },
);

// Download/visualização do pedido de exames — Console (por id interno).
// Resposta binária, fora do contrato OpenAPI. ?download=1 força attachment.
router.get(
  "/pacientes/:id/pedido-exames/download",
  async (req, res): Promise<void> => {
    const params = ObterPedidoExamesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const pedido = await pacientesRepo.obterPedidoExames(params.data.id);
    if (!pedido) {
      res.status(404).json({ message: "Pedido de exames não encontrado" });
      return;
    }

    await servirPedidoExames(pedido, res, {
      download: req.query.download === "1",
    });
  },
);

// ----- Receita de preparo da pele (PDF, uma por paciente) -----

function receitaPreparoPeleParaDTO(p: {
  nomeArquivo: string;
  tamanho: number;
  createdAt: Date;
}) {
  return {
    nomeArquivo: p.nomeArquivo,
    tamanho: p.tamanho,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/pacientes/:id/receita-preparo-pele", async (req, res): Promise<void> => {
  const params = ObterReceitaPreparoPeleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorId(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const receita = await pacientesRepo.obterReceitaPreparoPele(params.data.id);
  res.json(
    ObterReceitaPreparoPeleResponse.parse({
      receitaPreparoPele: receita ? receitaPreparoPeleParaDTO(receita) : null,
    }),
  );
});

// Upload do PDF da receita (multipart). Substitui a anterior, se houver.
// Fora do contrato OpenAPI (multipart); o Console chama via fetch com FormData.
router.post(
  "/pacientes/:id/receita-preparo-pele",
  uploadPedidoExamesPdf.single("arquivo"),
  async (req, res): Promise<void> => {
    const params = ObterReceitaPreparoPeleParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const paciente = await pacientesRepo.obterPorId(params.data.id);
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado" });
      return;
    }

    const arquivo = req.file;
    if (!arquivo) {
      res.status(400).json({ message: "Nenhum arquivo enviado." });
      return;
    }
    if (arquivo.mimetype !== TIPO_PDF) {
      res.status(400).json({ message: "Apenas arquivos PDF são aceitos." });
      return;
    }
    if (arquivo.size <= 0 || arquivo.size > TAMANHO_MAXIMO) {
      res.status(400).json({ message: "Arquivo muito grande (máximo 20 MB)." });
      return;
    }
    if (!storageReceitasPeleConfigurado()) {
      res.status(503).json({
        message: "Envio de arquivos indisponível no momento. Tente mais tarde.",
      });
      return;
    }

    const nomeArquivo =
      (arquivo.originalname || "receita-preparo-pele.pdf").trim().slice(0, 200) ||
      "receita-preparo-pele.pdf";

    try {
      const objectPath = await uploadReceitaPreparoPele({
        pacienteId: params.data.id,
        buffer: arquivo.buffer,
      });

      const { receita, objectPathAnterior } =
        await pacientesRepo.salvarReceitaPreparoPele({
          pacienteId: params.data.id,
          nomeArquivo,
          objectPath,
          contentType: TIPO_PDF,
          tamanho: arquivo.size,
        });

      if (objectPathAnterior) {
        await apagarReceitaPreparoPeleObjeto(objectPathAnterior);
      }

      try {
        await timelineRepo.criar({
          pacienteId: params.data.id,
          tipo: "documento",
          titulo: "Receita de preparo da pele anexada",
          descricao: nomeArquivo,
          automatico: true,
        });
      } catch (err) {
        req.log.warn({ err }, "Falha ao registrar receita de preparo da pele na timeline");
      }

      res
        .status(201)
        .json(
          ObterReceitaPreparoPeleResponse.parse({
            receitaPreparoPele: receitaPreparoPeleParaDTO(receita),
          }),
        );
    } catch (err) {
      if (err instanceof StorageIndisponivelError) {
        req.log.warn({ err }, "Storage indisponível ao subir receita de preparo da pele");
        res.status(503).json({
          message: "Envio de arquivos indisponível no momento. Tente mais tarde.",
        });
        return;
      }
      throw err;
    }
  },
);

router.delete(
  "/pacientes/:id/receita-preparo-pele",
  async (req, res): Promise<void> => {
    const params = RemoverReceitaPreparoPeleParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const paciente = await pacientesRepo.obterPorId(params.data.id);
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado" });
      return;
    }

    const objectPath = await pacientesRepo.removerReceitaPreparoPele(params.data.id);
    if (objectPath) {
      await apagarReceitaPreparoPeleObjeto(objectPath);
      try {
        await timelineRepo.criar({
          pacienteId: params.data.id,
          tipo: "documento",
          titulo: "Receita de preparo da pele removida",
          descricao: "",
          automatico: true,
        });
      } catch (err) {
        req.log.warn({ err }, "Falha ao registrar remoção da receita de preparo da pele");
      }
    }

    res.status(204).end();
  },
);

// Download/visualização da receita — Console (por id interno). Binária, ?download=1.
router.get(
  "/pacientes/:id/receita-preparo-pele/download",
  async (req, res): Promise<void> => {
    const params = ObterReceitaPreparoPeleParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const receita = await pacientesRepo.obterReceitaPreparoPele(params.data.id);
    if (!receita) {
      res.status(404).json({ message: "Receita não encontrada" });
      return;
    }

    await servirReceitaPreparoPele(receita, res, {
      download: req.query.download === "1",
    });
  },
);

// ----- Receituário pós-operatório (PDF, um por paciente) -----

function receituarioPosopParaDTO(p: {
  nomeArquivo: string;
  tamanho: number;
  createdAt: Date;
}) {
  return {
    nomeArquivo: p.nomeArquivo,
    tamanho: p.tamanho,
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/pacientes/:id/receituario-posop", async (req, res): Promise<void> => {
  const params = ObterReceituarioPosopParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorId(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const receituario = await pacientesRepo.obterReceituarioPosop(params.data.id);
  res.json(
    ObterReceituarioPosopResponse.parse({
      receituarioPosop: receituario ? receituarioPosopParaDTO(receituario) : null,
    }),
  );
});

// Upload do PDF do receituário (multipart). Substitui o anterior, se houver.
router.post(
  "/pacientes/:id/receituario-posop",
  uploadPedidoExamesPdf.single("arquivo"),
  async (req, res): Promise<void> => {
    const params = ObterReceituarioPosopParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const paciente = await pacientesRepo.obterPorId(params.data.id);
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado" });
      return;
    }

    const arquivo = req.file;
    if (!arquivo) {
      res.status(400).json({ message: "Nenhum arquivo enviado." });
      return;
    }
    if (arquivo.mimetype !== TIPO_PDF) {
      res.status(400).json({ message: "Apenas arquivos PDF são aceitos." });
      return;
    }
    if (arquivo.size <= 0 || arquivo.size > TAMANHO_MAXIMO) {
      res.status(400).json({ message: "Arquivo muito grande (máximo 20 MB)." });
      return;
    }
    if (!storageReceituariosConfigurado()) {
      res.status(503).json({
        message: "Envio de arquivos indisponível no momento. Tente mais tarde.",
      });
      return;
    }

    const nomeArquivo =
      (arquivo.originalname || "receituario-posop.pdf").trim().slice(0, 200) ||
      "receituario-posop.pdf";

    try {
      const objectPath = await uploadReceituarioPosop({
        pacienteId: params.data.id,
        buffer: arquivo.buffer,
      });

      const { receituario, objectPathAnterior } =
        await pacientesRepo.salvarReceituarioPosop({
          pacienteId: params.data.id,
          nomeArquivo,
          objectPath,
          contentType: TIPO_PDF,
          tamanho: arquivo.size,
        });

      if (objectPathAnterior) {
        await apagarReceituarioPosopObjeto(objectPathAnterior);
      }

      try {
        await timelineRepo.criar({
          pacienteId: params.data.id,
          tipo: "documento",
          titulo: "Receituário pós-operatório anexado",
          descricao: nomeArquivo,
          automatico: true,
        });
      } catch (err) {
        req.log.warn({ err }, "Falha ao registrar receituário pós-operatório na timeline");
      }

      res
        .status(201)
        .json(
          ObterReceituarioPosopResponse.parse({
            receituarioPosop: receituarioPosopParaDTO(receituario),
          }),
        );
    } catch (err) {
      if (err instanceof StorageIndisponivelError) {
        req.log.warn({ err }, "Storage indisponível ao subir receituário pós-operatório");
        res.status(503).json({
          message: "Envio de arquivos indisponível no momento. Tente mais tarde.",
        });
        return;
      }
      throw err;
    }
  },
);

router.delete(
  "/pacientes/:id/receituario-posop",
  async (req, res): Promise<void> => {
    const params = RemoverReceituarioPosopParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const paciente = await pacientesRepo.obterPorId(params.data.id);
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado" });
      return;
    }

    const objectPath = await pacientesRepo.removerReceituarioPosop(params.data.id);
    if (objectPath) {
      await apagarReceituarioPosopObjeto(objectPath);
      try {
        await timelineRepo.criar({
          pacienteId: params.data.id,
          tipo: "documento",
          titulo: "Receituário pós-operatório removido",
          descricao: "",
          automatico: true,
        });
      } catch (err) {
        req.log.warn({ err }, "Falha ao registrar remoção do receituário pós-operatório");
      }
    }

    res.status(204).end();
  },
);

// Download/visualização do receituário — Console (por id interno). Binária, ?download=1.
router.get(
  "/pacientes/:id/receituario-posop/download",
  async (req, res): Promise<void> => {
    const params = ObterReceituarioPosopParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const receituario = await pacientesRepo.obterReceituarioPosop(params.data.id);
    if (!receituario) {
      res.status(404).json({ message: "Receituário não encontrado" });
      return;
    }

    await servirReceituarioPosop(receituario, res, {
      download: req.query.download === "1",
    });
  },
);

router.get("/publico/:token", async (req, res): Promise<void> => {
  const params = ObterPaginaPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorToken(params.data.token);
  if (!paciente) {
    res.status(404).json({ message: "Página não encontrada" });
    return;
  }

  const [secoesPadrao, temaPadrao] = await Promise.all([
    conteudoRepo.obterPadrao(),
    conteudoRepo.obterTemaPadrao(),
  ]);
  const documentos = await pacientesRepo.listarDocumentos(paciente.id);
  const pedidoExames = await pacientesRepo.obterPedidoExames(paciente.id);
  const receitaPreparoPele = await pacientesRepo.obterReceitaPreparoPele(paciente.id);
  const receituarioPosop = await pacientesRepo.obterReceituarioPosop(paciente.id);

  // Foto do médico responsável (URL assinada de validade curta; best-effort).
  // Link de assinatura efetivo (override manual vence o cache) só quando ainda
  // faz sentido assinar — cobre também o link manual sem documento na Autentique.
  const { prazoAssinaturaDiasAntes: diasAntes } =
    await contratoConfigRepo.obter();
  const medico = paciente.medicoId
    ? await medicosRepo.obterPorId(paciente.medicoId)
    : undefined;
  const [medicoFotoUrl, medicoLogoUrl] = medico
    ? await Promise.all([
        urlAssinadaFoto(medico.foto),
        urlAssinadaFoto(medico.logo),
      ])
    : [null, null];
  const podeAssinar =
    paciente.contratoStatus !== "assinado" &&
    paciente.contratoStatus !== "recusado";
  const contratoLinkAssinatura = podeAssinar
    ? paciente.contratoLinkAssinaturaManual ??
      paciente.contratoLinkAssinatura ??
      null
    : null;
  const contratoPrazo = calcularPrazoAssinatura({
    dataCirurgia: paciente.dataCirurgia,
    contratoPrazoOverride: paciente.contratoPrazoOverride ?? null,
    diasAntes,
  });

  const podeAssinarTermo =
    paciente.termoStatus !== "assinado" &&
    paciente.termoStatus !== "recusado";
  const termoLinkAssinatura = podeAssinarTermo
    ? paciente.termoLinkAssinaturaManual ??
      paciente.termoLinkAssinatura ??
      null
    : null;
  const termoPrazo = calcularPrazoAssinatura({
    dataCirurgia: paciente.dataCirurgia,
    contratoPrazoOverride: paciente.termoPrazoOverride ?? null,
    diasAntes,
  });

  res.json(
    ObterPaginaPacienteResponse.parse(
      montarPaginaPaciente(paciente, secoesPadrao, temaPadrao, documentos, {
        medicoFotoUrl,
        medicoLogoUrl,
        contratoLinkAssinatura,
        contratoPrazo,
        termoLinkAssinatura,
        termoPrazo,
        pedidoExames: pedidoExames ?? null,
        receitaPreparoPele: receitaPreparoPele ?? null,
        receituarioPosop: receituarioPosop ?? null,
      }),
    ),
  );
});

// Persiste a escolha claro/escuro feita pela própria paciente, vinculada ao
// token, para que o registro escolhido a acompanhe entre dispositivos.
router.put("/publico/:token/tema", async (req, res): Promise<void> => {
  const params = DefinirTemaPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const body = DefinirTemaPacienteBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: body.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorToken(params.data.token);
  if (!paciente) {
    res.status(404).json({ message: "Página não encontrada" });
    return;
  }

  await pacientesRepo.salvarTema(paciente.id, body.data.tema);
  res.json(DefinirTemaPacienteResponse.parse({ tema: body.data.tema }));
});

// Download/visualização do PDF assinado — link público (por token).
// Mesmo esquema do GET /publico/:token: não expõe id interno, id do documento
// Autentique nem token da API. Resposta binária, fora do contrato OpenAPI.
router.get(
  "/publico/:token/contrato/download",
  async (req, res): Promise<void> => {
    const params = ObterPaginaPacienteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const paciente = await pacientesRepo.obterPorToken(params.data.token);
    if (!paciente) {
      res.status(404).json({ message: "Página não encontrada" });
      return;
    }

    await servirContratoAssinado(paciente, res, {
      download: req.query.download === "1",
      nomeArquivo: slugNome(paciente.nome),
    });
  },
);

// Download/visualização do PDF do termo assinado — link público (por token).
router.get(
  "/publico/:token/termo/download",
  async (req, res): Promise<void> => {
    const params = ObterPaginaPacienteParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }

    const paciente = await pacientesRepo.obterPorToken(params.data.token);
    if (!paciente) {
      res.status(404).json({ message: "Página não encontrada" });
      return;
    }

    await servirTermoAssinado(paciente, res, {
      download: req.query.download === "1",
      nomeArquivo: slugNomeTermo(paciente.nome),
    });
  },
);

// Download/visualização de um PDF anexado — link público (por token da paciente
// + token opaco do documento). Não expõe id interno nem caminho do objeto.
// Resposta binária, fora do contrato OpenAPI.
router.get(
  "/publico/:token/documentos/:documentoToken/download",
  async (req, res): Promise<void> => {
    const paciente = await pacientesRepo.obterPorToken(req.params.token);
    if (!paciente) {
      res.status(404).json({ message: "Página não encontrada" });
      return;
    }

    const documento = await pacientesRepo.obterDocumentoPorToken(
      req.params.documentoToken,
    );
    // O documento precisa existir E pertencer à paciente do link — impede
    // adivinhar tokens de documentos de outras pacientes.
    if (!documento || documento.pacienteId !== paciente.id) {
      res.status(404).json({ message: "Documento não encontrado" });
      return;
    }

    await servirDocumento(documento, res, {
      download: req.query.download === "1",
    });
  },
);

// Download/visualização do pedido de exames — link público (por token da paciente
// + token opaco do pedido). Não expõe id interno nem caminho do objeto.
// Resposta binária, fora do contrato OpenAPI.
router.get(
  "/publico/:token/pedido-exames/:pedidoToken/download",
  async (req, res): Promise<void> => {
    const paciente = await pacientesRepo.obterPorToken(req.params.token);
    if (!paciente) {
      res.status(404).json({ message: "Página não encontrada" });
      return;
    }

    const pedido = await pacientesRepo.obterPedidoExamesPorToken(
      req.params.pedidoToken,
    );
    // Precisa existir E pertencer à paciente do link — impede adivinhar tokens
    // de pedidos de outras pacientes.
    if (!pedido || pedido.pacienteId !== paciente.id) {
      res.status(404).json({ message: "Pedido de exames não encontrado" });
      return;
    }

    await servirPedidoExames(pedido, res, {
      download: req.query.download === "1",
    });
  },
);

// Download/visualização da receita de preparo da pele — link público (token da
// paciente + token opaco da receita). Não expõe id interno nem caminho do objeto.
router.get(
  "/publico/:token/receita-preparo-pele/:receitaToken/download",
  async (req, res): Promise<void> => {
    const paciente = await pacientesRepo.obterPorToken(req.params.token);
    if (!paciente) {
      res.status(404).json({ message: "Página não encontrada" });
      return;
    }

    const receita = await pacientesRepo.obterReceitaPreparoPelePorToken(
      req.params.receitaToken,
    );
    if (!receita || receita.pacienteId !== paciente.id) {
      res.status(404).json({ message: "Receita não encontrada" });
      return;
    }

    await servirReceitaPreparoPele(receita, res, {
      download: req.query.download === "1",
    });
  },
);

// Download/visualização do receituário pós-operatório — link público (token da
// paciente + token opaco do receituário). Não expõe id interno nem caminho do objeto.
router.get(
  "/publico/:token/receituario-posop/:receituarioToken/download",
  async (req, res): Promise<void> => {
    const paciente = await pacientesRepo.obterPorToken(req.params.token);
    if (!paciente) {
      res.status(404).json({ message: "Página não encontrada" });
      return;
    }

    const receituario = await pacientesRepo.obterReceituarioPosopPorToken(
      req.params.receituarioToken,
    );
    if (!receituario || receituario.pacienteId !== paciente.id) {
      res.status(404).json({ message: "Receituário não encontrado" });
      return;
    }

    await servirReceituarioPosop(receituario, res, {
      download: req.query.download === "1",
    });
  },
);

// Download/visualização do PDF único da lista de suspensão de medicamentos —
// link público (token da paciente + token opaco do arquivo). O arquivo é global
// (parte do conteúdo padrão), mas validamos que o token do arquivo confere com a
// seção `suspensao_medicamentos` do conteúdo efetivo da paciente (override ou
// padrão) — impede adivinhar/enumerar tokens. Resposta binária, fora do OpenAPI.
router.get(
  "/publico/:token/lista-medicamentos/:arquivoToken/download",
  async (req, res): Promise<void> => {
    const paciente = await pacientesRepo.obterPorToken(req.params.token);
    if (!paciente) {
      res.status(404).json({ message: "Página não encontrada" });
      return;
    }

    const secoes = paciente.conteudoPagina ?? (await conteudoRepo.obterPadrao());
    const secao = secoes.find((s) => s.tipo === "suspensao_medicamentos");
    const arquivo = secao?.arquivo;
    if (!arquivo || arquivo.token !== req.params.arquivoToken) {
      res.status(404).json({ message: "Lista de medicamentos não encontrada" });
      return;
    }

    await servirListaMedicamentos(
      { token: arquivo.token, nomeArquivo: arquivo.nomeArquivo },
      res,
      { download: req.query.download === "1" },
    );
  },
);

router.post("/publico/:token/eventos", async (req, res): Promise<void> => {
  // Endpoint tolerante a falhas: a página da paciente não pode quebrar nem
  // travar por causa do registro de eventos. Em qualquer erro de validação
  // respondemos 204 (sem conteúdo) sem expor detalhes internos.
  // Aceita o MESMO token que carrega a página: código público curto OU o UUID
  // legado. `obterPorToken` (abaixo) resolve ambos com segurança — a trava só de
  // UUID rejeitava os links de código curto (404) e a abertura nunca era gravada.
  const params = RegistrarEventoPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ message: "Página indisponível" });
    return;
  }

  const body = RegistrarEventoPacienteBody.safeParse(req.body);
  if (!body.success || !ehTipoEvento(body.data.tipo)) {
    res.status(204).end();
    return;
  }

  try {
    const paciente = await pacientesRepo.obterPorToken(params.data.token);
    if (paciente) {
      const rotulo = body.data.rotulo?.trim().slice(0, 120) || null;
      await pacientesRepo.registrarEvento(paciente.id, body.data.tipo, rotulo);
    }
  } catch (err) {
    req.log.warn({ err }, "Falha ao registrar evento da paciente");
  }

  res.status(204).end();
});

export default router;
