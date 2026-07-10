import { Router, type IRouter } from "express";
import {
  ListarContratoModelosResponse,
  ListarContratoModelosQueryParams,
  CriarContratoModeloBody,
  CriarContratoModeloResponse,
  ListarVariaveisContratoResponse,
  AtualizarContratoModeloParams,
  AtualizarContratoModeloBody,
  AtualizarContratoModeloResponse,
  RemoverContratoModeloParams,
  RestaurarContratoModeloPadraoParams,
  RestaurarContratoModeloPadraoBody,
  RestaurarContratoModeloPadraoResponse,
  ListarContratosGeracaoParams,
  ListarContratosGeracaoResponse,
  GerarContratoParams,
  GerarContratoBody,
  GerarContratoResponse,
  PreverContratoParams,
  PreverContratoBody,
  PreverContratoResponse,
  EditarContratoGeracaoParams,
  EditarContratoGeracaoBody,
  EditarContratoGeracaoResponse,
  DefinirDecisoesContratoParams,
  DefinirDecisoesContratoBody,
  DefinirDecisoesContratoResponse,
  RevisarContratoGeracaoParams,
  RevisarContratoGeracaoResponse,
  RevisarPreviaContratoParams,
  RevisarPreviaContratoBody,
  RevisarPreviaContratoResponse,
  AprovarEEnviarContratoParams,
  AprovarEEnviarContratoBody,
  AprovarEEnviarContratoResponse,
  ObterDocumentoContextoParams,
  ObterDocumentoContextoResponse,
  ImportarContratoModeloBody,
  ImportarContratoModeloResponse,
  BaixarContratoPdfParams,
  UploadContratoParams,
  UploadContratoBody,
  UploadContratoResponse,
  GerarIaDocumentoParams,
  GerarIaDocumentoBody,
  GerarIaDocumentoResponse,
  RefinarIaDocumentoParams,
  RefinarIaDocumentoBody,
  RefinarIaDocumentoResponse,
} from "@workspace/api-zod";
import type {
  ContratoModelo,
  ContratoGeracao,
  DocumentoTipo,
  DecisaoRegiao,
  Paciente,
  InsertPaciente,
  SignatarioContrato,
  FormularioDocumentoIa,
  TurnoConversaIa,
} from "@workspace/db";
import { contratoModelosRepo } from "../lib/contrato-modelos-repo";
import { compararComPadrao } from "../lib/contrato-modelo-padrao";
import {
  importarModeloDoArmazenamento,
  ImportacaoError,
  TIPO_PDF,
  TAMANHO_MAXIMO_IMPORT,
} from "../lib/contrato-importar";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../lib/objectStorage";
import { contratoGeracoesRepo } from "../lib/contrato-geracoes-repo";
import { pacientesRepo } from "../lib/pacientes-repo";
import { comSnapshotMedicoEfetivo } from "../lib/medico-efetivo";
import {
  VARIAVEIS_CONTRATO,
  gerarRascunhoContrato,
  gerarPreviaContrato,
  preencherCorpo,
  montarPreviewDocumento,
} from "../lib/contrato-geracao";
import { revisarContrato, RevisaoIaError } from "../lib/contrato-revisao-ia";
import {
  gerarDocumentoIA,
  refinarDocumentoIA,
  DocumentoIaError,
} from "../lib/documento-ia-geracao";
import { gerarPdfContrato } from "../lib/contrato-pdf";
import {
  criarDocumentoContrato,
  CriarContratoError,
} from "../lib/autentique-criar";
import { refrescarStatusContrato } from "../lib/contrato";
import { refrescarStatusTermo } from "../lib/termo";
import { listarAssinaturasContrato } from "../lib/autentique";
import { logger } from "../lib/logger";

/** Rótulo do documento para mensagens ao usuário, conforme o tipo. */
function rotuloDocumento(tipo: DocumentoTipo): string {
  return tipo === "termo" ? "termo de consentimento" : "contrato";
}

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();

/** Título inicial de um contrato de upload, derivado do nome do arquivo. */
function tituloDeArquivo(nomeArquivo: string): string {
  const semExt = nomeArquivo.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
  return semExt || "Contrato";
}

/**
 * Resolve os bytes do PDF de uma geração para envio/download. Contratos de
 * upload (PDF pronto) baixam o arquivo do armazenamento — a fonte da verdade;
 * os demais renderizam o PDF a partir do título/corpo salvos. Lança
 * `CriarContratoError` se o PDF enviado não puder ser lido, para que o chamador
 * degrade com uma mensagem clara sem expor detalhes internos.
 */
async function obterPdfDaGeracao(geracao: ContratoGeracao): Promise<Uint8Array> {
  if (geracao.arquivoObjectPath) {
    try {
      const resp = await objectStorage.fetchObject(geracao.arquivoObjectPath);
      return new Uint8Array(await resp.arrayBuffer());
    } catch (err) {
      throw new CriarContratoError(
        err instanceof ObjectNotFoundError
          ? "O PDF enviado não foi encontrado no armazenamento. Envie o arquivo de novo."
          : "Não foi possível ler o PDF enviado do armazenamento. Tente novamente.",
      );
    }
  }
  return gerarPdfContrato(geracao.titulo, geracao.corpo);
}

/** Serializa um modelo (datas → ISO) para o DTO público. */
function mapearModelo(m: ContratoModelo) {
  return {
    ...m,
    // Indicador "em dia com a fábrica?" calculado a partir do texto-base atual;
    // null para modelos criados manualmente (sem par de fábrica para comparar).
    statusFabrica: compararComPadrao(m.tipo, m.procedimento, m.titulo, m.corpo),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

/**
 * Enriquece o cadastro da paciente com os dados de identidade digitados no
 * formulário da via de IA (persist-back), para reuso futuro em contrato/termo.
 * Só grava campos INFORMADOS (não sobrescreve com vazio). CPF é normalizado para
 * dígitos e só persiste com 11 dígitos (evita corromper o cadastro). Best-effort:
 * o chamador ignora falhas.
 */
async function persistirIdentidadeNoPaciente(
  pacienteId: number,
  f: FormularioDocumentoIa,
): Promise<void> {
  const patch: Partial<InsertPaciente> = {};
  const cpfDigitos = (f.cpf ?? "").replace(/\D/g, "");
  if (cpfDigitos.length === 11) patch.cpf = cpfDigitos;
  if (f.email?.trim()) patch.email = f.email.trim();
  if (f.rg?.trim()) patch.rg = f.rg.trim();
  if (f.nascimento?.trim()) patch.nascimento = f.nascimento.trim();
  if (f.endereco?.trim()) patch.endereco = f.endereco.trim();
  if (Object.keys(patch).length === 0) return;
  await pacientesRepo.atualizar(pacienteId, patch);
}

/** Serializa uma geração (datas → ISO) para o DTO público. */
function mapearGeracao(g: ContratoGeracao) {
  return {
    ...g,
    iaRevisadoEm: g.iaRevisadoEm ? g.iaRevisadoEm.toISOString() : null,
    aprovadoEm: g.aprovadoEm ? g.aprovadoEm.toISOString() : null,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Modelos-base de contrato (CRUD)
// ---------------------------------------------------------------------------

router.get("/contrato-modelos", async (req, res): Promise<void> => {
  const query = ListarContratoModelosQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ message: query.error.message });
    return;
  }
  // Semeia os faltantes (de ambos os tipos) antes de filtrar pelo tipo pedido.
  await contratoModelosRepo.garantirPadrao();
  // Rebaixa modelos por procedimento legados ainda vigentes: a geração resolve
  // só o modelo-base único, então deixar um por procedimento "ativo" apenas
  // confunde a equipe. Idempotente — limpa a deriva em dev e produção.
  await contratoModelosRepo.desativarBasesObsoletas();
  const modelos = await contratoModelosRepo.listar(query.data.tipo);
  res.json(ListarContratoModelosResponse.parse(modelos.map(mapearModelo)));
});

router.get("/contrato-modelos/variaveis", async (_req, res): Promise<void> => {
  res.json(ListarVariaveisContratoResponse.parse([...VARIAVEIS_CONTRATO]));
});

// Converte um arquivo da clínica (Word/PDF) — já enviado ao armazenamento via
// URL pré-assinada — no corpo HTML de um modelo-base. A criação em si continua
// pela rota POST /contrato-modelos (a equipe revisa o HTML e define os campos).
router.post("/contrato-modelos/importar", async (req, res): Promise<void> => {
  const body = ImportarContratoModeloBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: body.error.message });
    return;
  }
  try {
    const resultado = await importarModeloDoArmazenamento({
      objectPath: body.data.objectPath,
      nomeArquivo: body.data.nomeArquivo,
      contentType: body.data.contentType ?? undefined,
    });
    res.json(ImportarContratoModeloResponse.parse(resultado));
  } catch (err) {
    if (err instanceof ImportacaoError) {
      res.status(422).json({ message: err.message });
      return;
    }
    if (err instanceof ObjectNotFoundError) {
      res.status(422).json({
        message:
          "O arquivo enviado não foi encontrado no armazenamento. Tente enviar de novo.",
      });
      return;
    }
    throw err;
  }
});

router.post("/contrato-modelos", async (req, res): Promise<void> => {
  const body = CriarContratoModeloBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: body.error.message });
    return;
  }
  const tipo: DocumentoTipo = body.data.tipo ?? "contrato";
  const ja = await contratoModelosRepo.obterPorProcedimento(
    body.data.procedimento.trim(),
    tipo,
  );
  if (ja) {
    res.status(409).json({
      message: `Já existe um modelo de ${rotuloDocumento(
        tipo,
      )} para este procedimento.`,
    });
    return;
  }
  const criado = await contratoModelosRepo.criar({
    tipo,
    procedimento: body.data.procedimento,
    titulo: body.data.titulo,
    corpo: body.data.corpo,
    vigente: body.data.vigente,
    observacoes: body.data.observacoes ?? null,
  });
  res.status(201).json(CriarContratoModeloResponse.parse(mapearModelo(criado)));
});

router.put("/contrato-modelos/:id", async (req, res): Promise<void> => {
  const params = AtualizarContratoModeloParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const body = AtualizarContratoModeloBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: body.error.message });
    return;
  }
  const atualizado = await contratoModelosRepo.atualizar(
    Number(params.data.id),
    body.data,
  );
  if (!atualizado) {
    res.status(404).json({ message: "Modelo não encontrado." });
    return;
  }
  res.json(AtualizarContratoModeloResponse.parse(mapearModelo(atualizado)));
});

router.delete("/contrato-modelos/:id", async (req, res): Promise<void> => {
  const params = RemoverContratoModeloParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const ok = await contratoModelosRepo.remover(Number(params.data.id));
  if (!ok) {
    res.status(404).json({ message: "Modelo não encontrado." });
    return;
  }
  res.status(204).end();
});

router.post(
  "/contrato-modelos/:id/restaurar-padrao",
  async (req, res): Promise<void> => {
    const params = RestaurarContratoModeloPadraoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }
    const body = RestaurarContratoModeloPadraoBody.safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ message: body.error.message });
      return;
    }
    const resultado = await contratoModelosRepo.restaurarPadrao(
      Number(params.data.id),
      body.data.confirmar ?? false,
    );
    switch (resultado.status) {
      case "naoEncontrado":
        res.status(404).json({ message: "Modelo não encontrado." });
        return;
      case "semPadrao":
        res.status(422).json({
          message:
            "Este modelo foi criado manualmente e não tem um texto de fábrica para restaurar.",
        });
        return;
      case "precisaConfirmacao":
        res.status(409).json({
          message:
            "Restaurar vai substituir o texto atual pelo modelo de fábrica e desmarcar a vigência. Confirme para continuar.",
        });
        return;
      case "restaurado":
        res.json(
          RestaurarContratoModeloPadraoResponse.parse(
            mapearModelo(resultado.modelo),
          ),
        );
        return;
    }
  },
);

// ---------------------------------------------------------------------------
// Gerações de contrato por paciente
// ---------------------------------------------------------------------------

router.get(
  "/pacientes/:id/contratos",
  async (req, res): Promise<void> => {
    const params = ListarContratosGeracaoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }
    const paciente = await pacientesRepo.obterPorId(Number(params.data.id));
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado." });
      return;
    }
    const geracoes = await contratoGeracoesRepo.listarPorPaciente(paciente.id);
    res.json(
      ListarContratosGeracaoResponse.parse(geracoes.map(mapearGeracao)),
    );
  },
);

router.get(
  "/pacientes/:id/documento-contexto",
  async (req, res): Promise<void> => {
    const params = ObterDocumentoContextoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }
    const paciente = await pacientesRepo.obterPorId(Number(params.data.id));
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado." });
      return;
    }
    res.json(
      ObterDocumentoContextoResponse.parse(montarPreviewDocumento(paciente)),
    );
  },
);

router.post(
  "/pacientes/:id/contratos/previa",
  async (req, res): Promise<void> => {
    const params = PreverContratoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }
    const body = PreverContratoBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: body.error.message });
      return;
    }
    const paciente = await pacientesRepo.obterPorId(Number(params.data.id));
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado." });
      return;
    }
    const modelo = await contratoModelosRepo.obterBaseVigente(body.data.tipo);
    if (!modelo) {
      res.status(400).json({
        message:
          "Não há um modelo-base vigente para este tipo. Ative o modelo-base em \"Modelos de documento\".",
      });
      return;
    }
    // Aplica os OVERRIDES (valores em edição na ficha, ainda não salvos) por cima
    // dos dados salvos — SÓ nesta resolução. Nada é persistido.
    const o = body.data;
    // Completa CRM/RQE/clínica ausentes com o cadastro vigente da médica antes
    // de aplicar os overrides em edição (que têm precedência).
    const pacienteEfetivo = await comSnapshotMedicoEfetivo(paciente);
    const set = <K extends keyof Paciente>(k: K, v: Paciente[K] | undefined) =>
      v === undefined ? {} : { [k]: v };
    const pacientePreview: Paciente = {
      ...pacienteEfetivo,
      ...set("procedimentos", o.procedimentos),
      ...set("valorSinal", o.valorSinal),
      ...set("valorPendente", o.valorPendente),
      ...set("dataPagamentoPendente", o.dataPagamentoPendente),
      ...set("medica", o.medica),
      ...set("crm", o.crm),
      ...set("rqe", o.rqe),
      ...set("clinica", o.clinica),
    };
    // Decisões escolhidas no wizard (variantes/opcionais/gênero) entram como
    // confirmadas — precedência sobre a inferência; as demais são inferidas.
    const previas: DecisaoRegiao[] = (o.decisoes ?? []).map((d) => ({
      id: d.id,
      tipo: d.tipo,
      rotulo: d.id,
      valor: d.valor,
      incluido: d.incluido,
      inferido: undefined,
      confirmado: true,
      editado: false,
      origem: "",
    }));
    // Resolve o modelo com marcadores `data-var` (vínculo campo↔trecho na UI).
    const { titulo, corpo, decisoes } = gerarPreviaContrato(
      modelo,
      pacientePreview,
      previas,
    );
    res.json(PreverContratoResponse.parse({ titulo, corpo, decisoes }));
  },
);

router.post(
  "/pacientes/:id/contratos/revisar-previa",
  async (req, res): Promise<void> => {
    const params = RevisarPreviaContratoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }
    const body = RevisarPreviaContratoBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: body.error.message });
      return;
    }
    const paciente = await pacientesRepo.obterPorId(Number(params.data.id));
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado." });
      return;
    }
    try {
      // Revisão sobre o texto em edição — não persiste nada e nunca bloqueia.
      const relatorio = await revisarContrato({
        titulo: body.data.titulo,
        corpo: body.data.corpo,
        paciente: await comSnapshotMedicoEfetivo(paciente),
        tipo: body.data.tipo,
      });
      res.json(RevisarPreviaContratoResponse.parse(relatorio));
    } catch (err) {
      if (err instanceof RevisaoIaError) {
        res.status(502).json({ message: err.message });
        return;
      }
      throw err;
    }
  },
);

router.post(
  "/pacientes/:id/contratos/gerar",
  async (req, res): Promise<void> => {
    const params = GerarContratoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }
    const body = GerarContratoBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: body.error.message });
      return;
    }
    const paciente = await pacientesRepo.obterPorId(Number(params.data.id));
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado." });
      return;
    }
    // Sem seleção de modelo: o sistema resolve o modelo-base ÚNICO e vigente do
    // tipo pedido e combina as cláusulas clínicas dos procedimentos da paciente.
    const modelo = await contratoModelosRepo.obterBaseVigente(body.data.tipo);
    if (!modelo) {
      res.status(400).json({
        message:
          'Não há um modelo-base vigente para este tipo. Marque o modelo-base como vigente em "Modelos de documento" antes de gerar.',
      });
      return;
    }

    // Decisões escolhidas no wizard (precedência) e, se veio, o corpo já
    // revisado na etapa de texto (persistido como está; senão resolve do modelo).
    const previas: DecisaoRegiao[] = (body.data.decisoes ?? []).map((d) => ({
      id: d.id,
      tipo: d.tipo,
      rotulo: d.id,
      valor: d.valor,
      incluido: d.incluido,
      inferido: undefined,
      confirmado: true,
      editado: false,
      origem: "",
    }));
    // Completa CRM/RQE/clínica ausentes no snapshot com o cadastro vigente da médica.
    const pacienteEfetivo = await comSnapshotMedicoEfetivo(paciente);
    const {
      titulo,
      corpo: resolvido,
      decisoes,
    } = gerarRascunhoContrato(modelo, pacienteEfetivo, previas);
    const corpo = body.data.corpo
      ? preencherCorpo(body.data.corpo, pacienteEfetivo, decisoes)
      : resolvido;
    const criado = await contratoGeracoesRepo.criar({
      pacienteId: paciente.id,
      tipo: modelo.tipo,
      modeloId: modelo.id,
      modeloProcedimento: modelo.procedimento,
      modeloVersao: modelo.versao,
      titulo,
      corpo,
      // Snapshot das decisões do motor de cláusulas (vazio p/ modelos sem
      // regiões tipadas). Alimenta a UI de confirmação e a auditoria.
      decisoes: decisoes.length > 0 ? decisoes : null,
      status: "rascunho",
    });
    res.status(201).json(GerarContratoResponse.parse(mapearGeracao(criado)));
  },
);

// Registra um contrato PRONTO enviado por fora (PDF já no armazenamento via URL
// pré-assinada). Não passa pela pré-geração: cria a geração de upload direto em
// rascunho e o PDF segue como fonte da verdade para aprovação/envio/download.
router.post(
  "/pacientes/:id/contratos/upload",
  async (req, res): Promise<void> => {
    const params = UploadContratoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }
    const body = UploadContratoBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: body.error.message });
      return;
    }
    const paciente = await pacientesRepo.obterPorId(Number(params.data.id));
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado." });
      return;
    }
    // Defesa no servidor, independente das checagens do frontend: só PDF, com
    // limite de tamanho, e o caminho tem que ser um objeto interno do storage.
    if (body.data.contentType !== TIPO_PDF) {
      res.status(400).json({ message: "Apenas arquivos PDF são aceitos." });
      return;
    }
    if (body.data.tamanho <= 0 || body.data.tamanho > TAMANHO_MAXIMO_IMPORT) {
      res.status(400).json({ message: "Arquivo muito grande (máximo 20 MB)." });
      return;
    }
    if (!body.data.objectPath.startsWith("/objects/")) {
      res.status(400).json({ message: "Caminho de arquivo inválido." });
      return;
    }
    const nomeArquivo =
      body.data.nomeArquivo.trim().slice(0, 200) || "contrato.pdf";
    const titulo =
      body.data.titulo?.trim().slice(0, 200) || tituloDeArquivo(nomeArquivo);
    const criado = await contratoGeracoesRepo.criarUpload({
      pacienteId: paciente.id,
      tipo: body.data.tipo,
      titulo,
      arquivoObjectPath: body.data.objectPath,
      arquivoNome: nomeArquivo,
    });
    res.status(201).json(UploadContratoResponse.parse(mapearGeracao(criado)));
  },
);

// Gera um documento (contrato/termo) REDIGIDO POR IA a partir do formulário,
// seguindo o padrão dos documentos-exemplo da clínica. Cria a geração em rascunho
// com o corpo HTML devolvido — daí segue o mesmo caminho de aprovação/envio.
router.post(
  "/pacientes/:id/contratos/gerar-ia",
  async (req, res): Promise<void> => {
    const params = GerarIaDocumentoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }
    const body = GerarIaDocumentoBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: body.error.message });
      return;
    }
    const paciente = await pacientesRepo.obterPorId(Number(params.data.id));
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado." });
      return;
    }
    const formulario = body.data.formulario as FormularioDocumentoIa;
    // O formulário chega com a identidade da médica pré-preenchida a partir do
    // snapshot da paciente; se CRM/RQE vieram vazios (snapshot antigo), completa
    // com o cadastro vigente da médica para a IA não redigir o documento sem eles.
    const efetivo = await comSnapshotMedicoEfetivo(paciente);
    const formularioEfetivo: FormularioDocumentoIa = {
      ...formulario,
      medica: formulario.medica?.trim() ? formulario.medica : efetivo.medica,
      ...(formulario.crm?.trim()
        ? {}
        : efetivo.crm?.trim()
          ? { crm: efetivo.crm }
          : {}),
      ...(formulario.rqe?.trim()
        ? {}
        : efetivo.rqe?.trim()
          ? { rqe: efetivo.rqe }
          : {}),
    };
    try {
      const { titulo, corpo } = await gerarDocumentoIA({
        tipo: body.data.tipo,
        formulario: formularioEfetivo,
      });
      const criado = await contratoGeracoesRepo.criarIa({
        pacienteId: paciente.id,
        tipo: body.data.tipo,
        titulo,
        corpo,
        formulario: formularioEfetivo,
      });
      // Persist-back (best-effort): aproveita os dados de identidade digitados no
      // formulário para enriquecer o cadastro da paciente, para reuso futuro
      // (contrato/termo). Só grava valores informados (não apaga o que já existe)
      // e nunca derruba a resposta se a atualização falhar.
      await persistirIdentidadeNoPaciente(paciente.id, formulario).catch((e) =>
        logger.warn(
          { err: (e as Error)?.message },
          "Persist-back da identidade da paciente falhou (ignorado)",
        ),
      );
      res.status(201).json(GerarIaDocumentoResponse.parse(mapearGeracao(criado)));
    } catch (err) {
      if (err instanceof DocumentoIaError) {
        res.status(502).json({ message: err.message });
        return;
      }
      throw err;
    }
  },
);

// Aplica um refino por IA (uma instrução de alteração) ao corpo de um documento
// redigido por IA ainda em rascunho, preservando o restante. Recusa uploads,
// documentos do motor de cláusulas e gerações já aprovadas/enviadas.
router.post("/contratos/:id/refinar-ia", async (req, res): Promise<void> => {
  const params = RefinarIaDocumentoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const body = RefinarIaDocumentoBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: body.error.message });
    return;
  }
  const geracao = await contratoGeracoesRepo.obter(Number(params.data.id));
  if (!geracao) {
    res.status(404).json({ message: "Geração não encontrada." });
    return;
  }
  if (geracao.origem !== "ia") {
    res.status(400).json({
      message: "Só documentos criados por IA podem ser refinados por chat.",
    });
    return;
  }
  if (geracao.status !== "rascunho") {
    res.status(400).json({
      message: "Este documento não está mais em rascunho e não pode ser refinado.",
    });
    return;
  }
  try {
    const { corpo } = await refinarDocumentoIA({
      tipo: geracao.tipo,
      corpoAtual: geracao.corpo,
      instrucao: body.data.instrucao,
    });
    const turno: TurnoConversaIa = {
      instrucao: body.data.instrucao,
      criadoEm: new Date().toISOString(),
    };
    const atualizado = await contratoGeracoesRepo.atualizarCorpoIa(
      geracao.id,
      corpo,
      turno,
    );
    res.json(RefinarIaDocumentoResponse.parse(mapearGeracao(atualizado!)));
  } catch (err) {
    if (err instanceof DocumentoIaError) {
      res.status(502).json({ message: err.message });
      return;
    }
    throw err;
  }
});

router.put("/contratos/:id", async (req, res): Promise<void> => {
  const params = EditarContratoGeracaoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const body = EditarContratoGeracaoBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: body.error.message });
    return;
  }
  const geracao = await contratoGeracoesRepo.obter(Number(params.data.id));
  if (!geracao) {
    res.status(404).json({ message: "Geração não encontrada." });
    return;
  }
  if (geracao.arquivoObjectPath) {
    res.status(400).json({
      message:
        "Este contrato foi enviado por upload (PDF pronto) e não pode ser editado no sistema.",
    });
    return;
  }
  if (geracao.status !== "rascunho") {
    res.status(400).json({
      message:
        "Este contrato não está mais em rascunho e não pode ser editado.",
    });
    return;
  }
  const paciente = await pacientesRepo.obterPorId(geracao.pacienteId);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado." });
    return;
  }
  // Documentos redigidos por IA não têm variáveis/regiões: o corpo já vem
  // resolvido pela IA (e refinos), então salvamos o texto como está. Para os
  // gerados pelo motor, o editor permite inserir novas `{{...}}`; preenchemos
  // aqui (idempotente) para que nenhuma variável literal escape ao PDF/Autentique.
  const corpoFinal =
    geracao.origem === "ia"
      ? body.data.corpo
      : preencherCorpo(
          body.data.corpo,
          paciente,
          geracao.decisoes ?? undefined,
        );
  const atualizado = await contratoGeracoesRepo.atualizarCorpo(
    geracao.id,
    corpoFinal,
  );
  res.json(EditarContratoGeracaoResponse.parse(mapearGeracao(atualizado!)));
});

router.put("/contratos/:id/decisoes", async (req, res): Promise<void> => {
  const params = DefinirDecisoesContratoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const body = DefinirDecisoesContratoBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ message: body.error.message });
    return;
  }
  const geracao = await contratoGeracoesRepo.obter(Number(params.data.id));
  if (!geracao) {
    res.status(404).json({ message: "Geração não encontrada." });
    return;
  }
  if (geracao.arquivoObjectPath) {
    res.status(400).json({
      message:
        "Este contrato foi enviado por upload (PDF pronto) e não passa pelo motor de cláusulas.",
    });
    return;
  }
  if (geracao.status !== "rascunho") {
    res.status(400).json({
      message:
        "Este contrato não está mais em rascunho e não pode ser regerado.",
    });
    return;
  }
  const paciente = await pacientesRepo.obterPorId(geracao.pacienteId);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado." });
    return;
  }
  // Regera a partir do MESMO modelo que originou o rascunho (ou o vigente, se o
  // vínculo se perdeu). O motor reaplica as decisões e renumera de forma
  // determinística — por isso ajustes manuais de texto são descartados aqui.
  const modelo =
    (geracao.modeloId
      ? await contratoModelosRepo.obter(geracao.modeloId)
      : undefined) ?? (await contratoModelosRepo.obterBaseVigente(geracao.tipo));
  if (!modelo) {
    res.status(400).json({
      message:
        "Não há modelo-base disponível para regerar este contrato. Verifique os modelos de documento.",
    });
    return;
  }
  // As escolhas do operador entram como decisões CONFIRMADAS (precedência sobre
  // a inferência); o motor recomputa origem/inferido/editado a cada campo.
  const previas: DecisaoRegiao[] = body.data.decisoes.map((d) => ({
    id: d.id,
    tipo: d.tipo,
    rotulo: d.id,
    valor: d.valor,
    incluido: d.incluido,
    inferido: undefined,
    confirmado: true,
    editado: false,
    origem: "",
  }));
  const pacienteEfetivo = await comSnapshotMedicoEfetivo(paciente);
  const { corpo, decisoes } = gerarRascunhoContrato(modelo, pacienteEfetivo, previas);
  const atualizado = await contratoGeracoesRepo.atualizarCorpoEDecisoes(
    geracao.id,
    corpo,
    decisoes,
  );
  res.json(DefinirDecisoesContratoResponse.parse(mapearGeracao(atualizado!)));
});

router.post("/contratos/:id/revisar", async (req, res): Promise<void> => {
  const params = RevisarContratoGeracaoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const geracao = await contratoGeracoesRepo.obter(Number(params.data.id));
  if (!geracao) {
    res.status(404).json({ message: "Geração não encontrada." });
    return;
  }
  if (geracao.arquivoObjectPath) {
    res.status(400).json({
      message:
        "Este contrato foi enviado por upload (PDF pronto) e não tem texto para a revisão de IA.",
    });
    return;
  }
  const paciente = await pacientesRepo.obterPorId(geracao.pacienteId);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado." });
    return;
  }

  try {
    const relatorio = await revisarContrato({
      titulo: geracao.titulo,
      corpo: geracao.corpo,
      paciente,
      tipo: geracao.tipo,
    });
    const atualizado = await contratoGeracoesRepo.salvarRelatorio(
      geracao.id,
      relatorio,
    );
    res.json(RevisarContratoGeracaoResponse.parse(mapearGeracao(atualizado!)));
  } catch (err) {
    if (err instanceof RevisaoIaError) {
      // Falha de IA não corrompe a geração: o rascunho permanece intacto.
      res.status(502).json({ message: err.message });
      return;
    }
    throw err;
  }
});

router.post(
  "/contratos/:id/aprovar-e-enviar",
  async (req, res): Promise<void> => {
    const params = AprovarEEnviarContratoParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ message: params.error.message });
      return;
    }
    const body = AprovarEEnviarContratoBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ message: body.error.message });
      return;
    }
    const geracao = await contratoGeracoesRepo.obter(Number(params.data.id));
    if (!geracao) {
      res.status(404).json({ message: "Geração não encontrada." });
      return;
    }
    if (geracao.status === "enviado") {
      res.status(400).json({
        message: `Este ${rotuloDocumento(
          geracao.tipo,
        )} já foi enviado à Autentique.`,
      });
      return;
    }
    const paciente = await pacientesRepo.obterPorId(geracao.pacienteId);
    if (!paciente) {
      res.status(404).json({ message: "Paciente não encontrado." });
      return;
    }

    // Resolve os SIGNATÁRIOS do envio. Novo caminho: a lista configurada na tela
    // (contrato: paciente + representante legal; termo: paciente + médico).
    // Retrocompatível: sem `signatarios`, cai no signatário único (paciente) com
    // o `email` — o comportamento anterior.
    const signatarios: SignatarioContrato[] =
      body.data.signatarios && body.data.signatarios.length > 0
        ? body.data.signatarios.map((s) => ({
            papel: s.papel,
            nome: s.nome.trim(),
            email: s.email.trim(),
          }))
        : [
            {
              papel: "paciente",
              nome: paciente.nome,
              email: body.data.email?.trim() ?? "",
            },
          ];

    // 1) Etapa humana OBRIGATÓRIA: registra a aprovação (quem/quando) ANTES de
    // qualquer escrita na Autentique. Fica gravada mesmo se o envio falhar.
    await contratoGeracoesRepo.aprovar(geracao.id, body.data.aprovadoPor.trim());
    // Snapshot dos signatários (mapeia cada assinatura ao seu papel depois).
    await contratoGeracoesRepo.definirSignatarios(geracao.id, signatarios);

    // 2) Resolve o PDF (upload → arquivo do armazenamento; senão → renderiza do
    // corpo) e cria o documento na Autentique (caminho de escrita).
    try {
      const pdf = await obterPdfDaGeracao(geracao);
      const { id: autentiqueId } = await criarDocumentoContrato({
        pdf,
        nomeDocumento: geracao.titulo,
        signatarios: signatarios.map((s) => ({
          nome: s.nome,
          email: s.email || undefined,
        })),
      });

      // 3) Vincula à paciente conforme o tipo e entrega ao respectivo fluxo de
      // status (somente leitura). Contrato → contratoAutentiqueId; termo de
      // consentimento → termoAutentiqueId. Cada tipo tem seu próprio espelho.
      if (geracao.tipo === "termo") {
        await pacientesRepo.atualizarTermo(paciente.id, {
          termoAutentiqueId: autentiqueId,
        });
      } else {
        await pacientesRepo.atualizarContrato(paciente.id, {
          contratoAutentiqueId: autentiqueId,
        });
      }
      const atualizadoPaciente = await pacientesRepo.obterPorId(paciente.id);
      if (atualizadoPaciente) {
        if (geracao.tipo === "termo") {
          await refrescarStatusTermo(atualizadoPaciente);
        } else {
          await refrescarStatusContrato(atualizadoPaciente);
        }
      }

      const enviado = await contratoGeracoesRepo.marcarEnviado(
        geracao.id,
        autentiqueId,
      );
      res.json(
        AprovarEEnviarContratoResponse.parse(mapearGeracao(enviado!)),
      );
    } catch (err) {
      // Falha de envio: preserva a aprovação, marca a falha e NÃO toca no
      // contrato da paciente (que segue governado pelo fluxo de leitura).
      const msg =
        err instanceof CriarContratoError
          ? err.message
          : "Falha inesperada ao criar o documento na Autentique.";
      logger.warn(
        { err: (err as Error)?.message, geracaoId: geracao.id },
        "Falha ao enviar contrato à Autentique",
      );
      await contratoGeracoesRepo.marcarFalhaEnvio(geracao.id, msg);
      res.status(502).json({ message: msg });
    }
  },
);

// Baixa o PDF do documento — o mesmo enviado à Autentique. Para contratos de
// upload, faz stream do PDF pronto do armazenamento; para os demais, renderiza a
// partir do título/corpo SALVOS. Disponível em qualquer status (rascunho,
// aprovado, enviado) para a equipe guardar/imprimir uma cópia. Não envia nada
// para fora; é só uma cópia local do documento já salvo no servidor.
router.get("/contratos/:id/pdf", async (req, res): Promise<void> => {
  const params = BaixarContratoPdfParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const geracao = await contratoGeracoesRepo.obter(Number(params.data.id));
  if (!geracao) {
    res.status(404).json({ message: "Geração não encontrada." });
    return;
  }
  let pdf: Uint8Array;
  try {
    pdf = await obterPdfDaGeracao(geracao);
  } catch (err) {
    // Só o upload lê do armazenamento; a renderização local não lança aqui.
    const msg =
      err instanceof CriarContratoError
        ? err.message
        : "Não foi possível montar o PDF deste documento.";
    res.status(502).json({ message: msg });
    return;
  }
  const buffer = Buffer.from(pdf);
  const nomeBase = geracao.tipo === "termo" ? "termo-consentimento" : "contrato";
  // `?inline=1` serve para VISUALIZAR no navegador (iframe da prévia); o padrão
  // é `attachment` (baixar). Só muda o disposition — mesmo conteúdo.
  const inline = req.query.inline === "1" || req.query.inline === "true";
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", buffer.length);
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="${nomeBase}-${geracao.id}.pdf"`,
  );
  // Documento sensível (PII/contratual): nunca cachear em proxies compartilhados.
  res.setHeader("Cache-Control", "private, no-store");
  res.status(200).end(buffer);
});

// Status de assinatura POR PARTE de uma geração enviada. Cruza os signatários
// que persistimos no envio (papel + nome + e-mail) com o estado ao vivo de cada
// assinatura na Autentique (casando por e-mail), para a visualização "criado →
// assinado pelo médico → assinado pelo paciente". Leitura pura; nunca lança —
// quando a Autentique está ilegível, devolve `disponivel: false`.
router.get("/contratos/:id/assinaturas", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ message: "Id inválido." });
    return;
  }
  const geracao = await contratoGeracoesRepo.obter(id);
  if (!geracao) {
    res.status(404).json({ message: "Geração não encontrada." });
    return;
  }
  // Ainda não enviado à Autentique → não há assinaturas a acompanhar.
  if (!geracao.autentiqueId) {
    res.json({ enviado: false, disponivel: false, partes: [] });
    return;
  }

  const lista = await listarAssinaturasContrato(geracao.autentiqueId);
  const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

  // Com signatários persistidos, apresentamos POR PAPEL (paciente/representante/
  // médico), casando cada um com a assinatura correspondente por e-mail.
  const persistidos = geracao.signatarios ?? [];
  const partes =
    persistidos.length > 0
      ? persistidos.map((s) => {
          const match = lista.assinaturas.find(
            (a) => norm(a.email) === norm(s.email) && norm(s.email) !== "",
          );
          return {
            papel: s.papel,
            nome: s.nome,
            email: s.email,
            status: match?.status ?? "pendente",
            em: match?.em ?? null,
          };
        })
      : // Envio antigo (signatário único, sem papéis): reflete a lista da Autentique.
        lista.assinaturas.map((a) => ({
          papel: "paciente",
          nome: a.nome ?? "",
          email: a.email ?? "",
          status: a.status,
          em: a.em,
        }));

  res.json({ enviado: true, disponivel: lista.disponivel, partes });
});

export default router;
