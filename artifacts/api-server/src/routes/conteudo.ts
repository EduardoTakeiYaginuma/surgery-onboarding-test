import { Router, type IRouter } from "express";
import multer from "multer";
import {
  ObterConteudoPadraoResponse,
  AtualizarConteudoPadraoBody,
  AtualizarConteudoPadraoResponse,
  ObterConteudoPacienteParams,
  ObterConteudoPacienteResponse,
  AtualizarConteudoPacienteParams,
  AtualizarConteudoPacienteBody,
  AtualizarConteudoPacienteResponse,
  RemoverConteudoPacienteParams,
  RemoverConteudoPacienteResponse,
} from "@workspace/api-zod";
import type { SecaoConteudo } from "@workspace/db";
import { conteudoRepo } from "../lib/conteudo-repo";
import { pacientesRepo } from "../lib/pacientes-repo";
import { TIPO_PDF, TAMANHO_MAXIMO } from "../lib/documentos-arquivo";
import {
  uploadListaMedicamentos,
  apagarListaMedicamentosObjeto,
  storageListasConfigurado,
} from "../lib/lista-medicamentos-arquivo";

const router: IRouter = Router();

const uploadListaMedicamentosPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANHO_MAXIMO },
});

router.get("/conteudo-padrao", async (_req, res): Promise<void> => {
  const secoes = await conteudoRepo.obterPadrao();
  res.json(ObterConteudoPadraoResponse.parse({ secoes }));
});

router.put("/conteudo-padrao", async (req, res): Promise<void> => {
  const parsed = AtualizarConteudoPadraoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const secoes = await conteudoRepo.salvarPadrao(
    parsed.data.secoes as SecaoConteudo[],
  );
  res.json(AtualizarConteudoPadraoResponse.parse({ secoes }));
});

// Upload do PDF único da lista completa de suspensão de medicamentos (multipart).
// Fora do contrato OpenAPI (multipart); o Console chama via fetch com FormData.
// Só armazena os bytes e devolve os metadados — quem persiste a referência é o
// PUT /conteudo-padrao (o editor põe `arquivo` na seção `suspensao_medicamentos`).
// `?anterior=<token>` apaga o arquivo substituído do bucket (idempotente).
// Fail-closed: storage indisponível → 503; não-PDF → 400; sem arquivo → 400.
router.post(
  "/conteudo-padrao/lista-medicamentos",
  uploadListaMedicamentosPdf.single("arquivo"),
  async (req, res): Promise<void> => {
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
    if (!storageListasConfigurado()) {
      res.status(503).json({
        message: "Envio de arquivos indisponível no momento. Tente mais tarde.",
      });
      return;
    }

    const nomeArquivo =
      (arquivo.originalname || "lista-de-medicamentos.pdf")
        .trim()
        .slice(0, 200) || "lista-de-medicamentos.pdf";

    try {
      const token = await uploadListaMedicamentos({ buffer: arquivo.buffer });

      // Apaga o objeto substituído do storage (idempotente; não falha o upload).
      const anterior =
        typeof req.query.anterior === "string" ? req.query.anterior.trim() : "";
      if (anterior && anterior !== token) {
        await apagarListaMedicamentosObjeto(anterior);
      }

      res.status(201).json({ nomeArquivo, tamanho: arquivo.size, token });
    } catch {
      res.status(503).json({
        message: "Envio de arquivos indisponível no momento. Tente mais tarde.",
      });
    }
  },
);

router.get("/pacientes/:id/conteudo", async (req, res): Promise<void> => {
  const params = ObterConteudoPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.obterPorId(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const personalizado = paciente.conteudoPagina != null;
  const secoes = personalizado
    ? paciente.conteudoPagina!
    : await conteudoRepo.obterPadrao();
  res.json(ObterConteudoPacienteResponse.parse({ secoes, personalizado }));
});

router.put("/pacientes/:id/conteudo", async (req, res): Promise<void> => {
  const params = AtualizarConteudoPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const parsed = AtualizarConteudoPacienteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }

  const paciente = await pacientesRepo.salvarConteudo(
    params.data.id,
    parsed.data.secoes as SecaoConteudo[],
  );
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  res.json(
    AtualizarConteudoPacienteResponse.parse({
      secoes: paciente.conteudoPagina,
      personalizado: true,
    }),
  );
});

router.delete("/pacientes/:id/conteudo", async (req, res): Promise<void> => {
  const params = RemoverConteudoPacienteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }

  const paciente = await pacientesRepo.removerConteudo(params.data.id);
  if (!paciente) {
    res.status(404).json({ message: "Paciente não encontrado" });
    return;
  }

  const secoes = await conteudoRepo.obterPadrao();
  res.json(
    RemoverConteudoPacienteResponse.parse({ secoes, personalizado: false }),
  );
});

export default router;
