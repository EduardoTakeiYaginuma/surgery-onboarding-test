import { Router, type IRouter } from "express";
import multer from "multer";
import {
  ListarMedicosResponse,
  ListarMedicosQueryParams,
  CriarMedicoBody,
  CriarMedicoResponse,
  AtualizarMedicoParams,
  AtualizarMedicoBody,
  AtualizarMedicoResponse,
} from "@workspace/api-zod";
import type { Medico } from "@workspace/db";
import { medicosRepo } from "../lib/medicos-repo";
import { importarMedicosDoCore } from "../lib/importar-medicos";
import { LumexaCoreError } from "../lib/lumexa-core";
import {
  uploadFotoMedico,
  uploadLogoMedico,
  urlAssinadaFoto,
  storageConfigurado,
  ehTipoFotoAceito,
  StorageIndisponivelError,
  type TipoFotoAceito,
} from "../lib/fotos-storage";

const router: IRouter = Router();

// Upload em memória: a foto vai direto para o storage, sem tocar o disco. 8 MB.
const uploadFoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

// A foto é guardada em Object Storage privado; nunca expomos o caminho do
// objeto. A miniatura é servida por uma URL assinada de validade curta, gerada
// na hora. A assinatura é best-effort: se falhar, fotoUrl=null (nunca quebra).
async function medicoParaDTO(m: Medico) {
  const [fotoUrl, logoUrl] = await Promise.all([
    urlAssinadaFoto(m.foto),
    urlAssinadaFoto(m.logo),
  ]);
  return {
    id: m.id,
    nome: m.nome,
    crm: m.crm,
    rqe: m.rqe,
    clinica: m.clinica,
    padrao: m.padrao,
    ativo: m.ativo,
    fotoUrl,
    logoUrl,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

router.get("/medicos", async (req, res): Promise<void> => {
  const query = ListarMedicosQueryParams.safeParse(req.query);
  const incluirInativos = query.success
    ? query.data.incluirInativos === true
    : false;
  const medicos = await medicosRepo.listar(incluirInativos);
  res.json(
    ListarMedicosResponse.parse(await Promise.all(medicos.map(medicoParaDTO))),
  );
});

// Automação: puxa os médicos do lumexa-core (/api/admin/doctors) e faz upsert
// idempotente pela origem (coreDoctorId). Único ponto de entrada da sincronia.
router.post("/medicos/importar-core", async (req, res): Promise<void> => {
  try {
    const resultado = await importarMedicosDoCore();
    req.log.info(resultado, "Import de médicos do lumexa-core concluído");
    res.json(resultado);
  } catch (err) {
    if (err instanceof LumexaCoreError) {
      req.log.warn({ err: err.message }, "Import de médicos do core falhou");
      res.status(502).json({ message: err.message });
      return;
    }
    throw err;
  }
});

router.post("/medicos", async (req, res): Promise<void> => {
  const parsed = CriarMedicoBody.safeParse(req.body);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Body inválido");
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const medico = await medicosRepo.criar({
    nome: parsed.data.nome,
    crm: parsed.data.crm,
    rqe: parsed.data.rqe,
    clinica: parsed.data.clinica,
    padrao: parsed.data.padrao,
  });
  res.status(201).json(CriarMedicoResponse.parse(await medicoParaDTO(medico)));
});

router.patch("/medicos/:id", async (req, res): Promise<void> => {
  const params = AtualizarMedicoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const parsed = AtualizarMedicoBody.safeParse(req.body);
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
  const medico = await medicosRepo.atualizar(params.data.id, parsed.data);
  if (!medico) {
    res.status(404).json({ message: "Médico não encontrado" });
    return;
  }
  res.json(AtualizarMedicoResponse.parse(await medicoParaDTO(medico)));
});

// Upload da foto do médico — multipart (binário), por isso fora do contrato
// OpenAPI; o frontend usa fetch. Fail-closed igual à foto de check-in: storage
// indisponível → 503; tipo inválido → 400; médico inexistente → 404. Devolve o
// médico já com a foto nova.
router.post(
  "/medicos/:id/foto",
  uploadFoto.single("foto"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(404).json({ message: "Médico não encontrado" });
      return;
    }

    const medico = await medicosRepo.obterPorId(id);
    if (!medico) {
      res.status(404).json({ message: "Médico não encontrado" });
      return;
    }

    const arquivo = req.file;
    if (!arquivo) {
      res.status(400).json({ message: "Nenhuma foto enviada." });
      return;
    }
    if (!ehTipoFotoAceito(arquivo.mimetype)) {
      res.status(400).json({ message: "Envie uma imagem JPEG ou PNG." });
      return;
    }
    if (!storageConfigurado()) {
      res.status(503).json({
        message: "Envio de fotos indisponível no momento. Tente mais tarde.",
      });
      return;
    }

    try {
      const relativo = await uploadFotoMedico({
        medicoId: medico.id,
        buffer: arquivo.buffer,
        contentType: arquivo.mimetype as TipoFotoAceito,
      });
      const atualizado = await medicosRepo.definirFoto(medico.id, relativo);
      res
        .status(200)
        .json(AtualizarMedicoResponse.parse(await medicoParaDTO(atualizado!)));
    } catch (err) {
      if (err instanceof StorageIndisponivelError) {
        req.log.warn({ err }, "Storage indisponível ao subir foto de médico");
        res.status(503).json({
          message: "Envio de fotos indisponível no momento. Tente mais tarde.",
        });
        return;
      }
      throw err;
    }
  },
);

// Upload do logo do médico — multipart (binário), fora do contrato OpenAPI;
// o frontend usa fetch. Mesma semântica do endpoint de foto.
router.post(
  "/medicos/:id/logo",
  uploadFoto.single("logo"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(404).json({ message: "Médico não encontrado" });
      return;
    }

    const medico = await medicosRepo.obterPorId(id);
    if (!medico) {
      res.status(404).json({ message: "Médico não encontrado" });
      return;
    }

    const arquivo = req.file;
    if (!arquivo) {
      res.status(400).json({ message: "Nenhum logo enviado." });
      return;
    }
    if (!ehTipoFotoAceito(arquivo.mimetype)) {
      res.status(400).json({ message: "Envie uma imagem JPEG ou PNG." });
      return;
    }
    if (!storageConfigurado()) {
      res.status(503).json({
        message: "Envio de imagens indisponível no momento. Tente mais tarde.",
      });
      return;
    }

    try {
      const relativo = await uploadLogoMedico({
        medicoId: medico.id,
        buffer: arquivo.buffer,
        contentType: arquivo.mimetype as TipoFotoAceito,
      });
      const atualizado = await medicosRepo.definirLogo(medico.id, relativo);
      res
        .status(200)
        .json(AtualizarMedicoResponse.parse(await medicoParaDTO(atualizado!)));
    } catch (err) {
      if (err instanceof StorageIndisponivelError) {
        req.log.warn({ err }, "Storage indisponível ao subir logo de médico");
        res.status(503).json({
          message: "Envio de imagens indisponível no momento. Tente mais tarde.",
        });
        return;
      }
      throw err;
    }
  },
);

export default router;
