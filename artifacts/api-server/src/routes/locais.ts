import { Router, type IRouter } from "express";
import {
  ListarLocaisQueryParams,
  ListarLocaisResponse,
  CriarLocalBody,
  CriarLocalResponse,
  AtualizarLocalParams,
  AtualizarLocalBody,
  AtualizarLocalResponse,
  RemoverLocalParams,
} from "@workspace/api-zod";
import type { Local, InsertLocal } from "@workspace/db";
import { locaisRepo } from "../lib/locais-repo";

const router: IRouter = Router();

function localParaDTO(l: Local) {
  return {
    id: l.id,
    nome: l.nome,
    nomeCompleto: l.nomeCompleto,
    endereco: l.endereco,
    contatoCcNome: l.contatoCcNome,
    contatoCcTelefone: l.contatoCcTelefone,
    instrucoesChegada: l.instrucoesChegada,
    sinalSugerido: l.sinalSugerido != null ? Number(l.sinalSugerido) : null,
    ativo: l.ativo,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

/** Normaliza o corpo (create/update) para os campos da coluna. sinalSugerido
 *  numeric é gravado como string; null quando ausente. */
function corpoParaColunas(body: {
  nome?: string;
  nomeCompleto?: string;
  endereco?: string;
  contatoCcNome?: string;
  contatoCcTelefone?: string;
  instrucoesChegada?: string;
  sinalSugerido?: number | null;
  ativo?: boolean;
}): Partial<InsertLocal> {
  const dados: Partial<InsertLocal> = {};
  if (body.nome !== undefined) dados.nome = body.nome.trim();
  if (body.nomeCompleto !== undefined)
    dados.nomeCompleto = body.nomeCompleto.trim();
  if (body.endereco !== undefined) dados.endereco = body.endereco.trim();
  if (body.contatoCcNome !== undefined)
    dados.contatoCcNome = body.contatoCcNome.trim();
  if (body.contatoCcTelefone !== undefined)
    dados.contatoCcTelefone = body.contatoCcTelefone.trim();
  if (body.instrucoesChegada !== undefined)
    dados.instrucoesChegada = body.instrucoesChegada.trim();
  if (body.sinalSugerido !== undefined)
    dados.sinalSugerido =
      body.sinalSugerido != null ? String(body.sinalSugerido) : null;
  if (body.ativo !== undefined) dados.ativo = body.ativo;
  return dados;
}

router.get("/locais", async (req, res): Promise<void> => {
  const query = ListarLocaisQueryParams.safeParse(req.query);
  const incluirInativos = query.success
    ? query.data.incluirInativos === true
    : false;
  const locais = await locaisRepo.listar(incluirInativos);
  res.json(ListarLocaisResponse.parse(locais.map(localParaDTO)));
});

router.post("/locais", async (req, res): Promise<void> => {
  const parsed = CriarLocalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const nome = parsed.data.nome.trim();
  if (!nome) {
    res.status(400).json({ message: "Informe o nome do local." });
    return;
  }
  // Nome é único: reaproveita se já existir (evita duplicar ao recadastrar).
  const existente = await locaisRepo.obterPorNome(nome);
  if (existente) {
    res.status(409).json({
      message: "Já existe um local com este nome.",
      codigo: "local_duplicado",
    });
    return;
  }
  const local = await locaisRepo.criar({
    ...corpoParaColunas(parsed.data),
    nome,
  });
  res.status(201).json(CriarLocalResponse.parse(localParaDTO(local)));
});

router.patch("/locais/:id", async (req, res): Promise<void> => {
  const params = AtualizarLocalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const parsed = AtualizarLocalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const dados = corpoParaColunas(parsed.data);
  if (Object.keys(dados).length === 0) {
    res
      .status(400)
      .json({ message: "Informe ao menos um campo para atualizar" });
    return;
  }
  const local = await locaisRepo.atualizar(params.data.id, dados);
  if (!local) {
    res.status(404).json({ message: "Local não encontrado" });
    return;
  }
  res.json(AtualizarLocalResponse.parse(localParaDTO(local)));
});

router.delete("/locais/:id", async (req, res): Promise<void> => {
  const params = RemoverLocalParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const removido = await locaisRepo.remover(params.data.id);
  if (!removido) {
    res.status(404).json({ message: "Local não encontrado" });
    return;
  }
  res.status(204).end();
});

export default router;
