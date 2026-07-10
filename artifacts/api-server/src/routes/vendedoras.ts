import { Router, type IRouter } from "express";
import {
  ListarVendedorasResponse,
  ListarVendedorasQueryParams,
  CriarVendedoraBody,
  CriarVendedoraResponse,
  AtualizarVendedoraParams,
  AtualizarVendedoraBody,
  AtualizarVendedoraResponse,
} from "@workspace/api-zod";
import { vendedorasRepo } from "../lib/vendedoras-repo";
import { importarVendedorasDoCore } from "../lib/importar-vendedoras";
import { LumexaCoreError } from "../lib/lumexa-core";

const router: IRouter = Router();

function vendedoraParaDTO(v: {
  id: number;
  nome: string;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: v.id,
    nome: v.nome,
    ativo: v.ativo,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

router.get("/vendedoras", async (req, res): Promise<void> => {
  const query = ListarVendedorasQueryParams.safeParse(req.query);
  const incluirInativas = query.success
    ? query.data.incluirInativas === true
    : false;
  const vendedoras = await vendedorasRepo.listar(incluirInativas);
  res.json(ListarVendedorasResponse.parse(vendedoras.map(vendedoraParaDTO)));
});

// Automação: puxa as vendedoras do lumexa-core (/api/admin/salesreps) e faz
// upsert idempotente por coreSalesrepId. Único ponto de entrada da sincronia.
router.post("/vendedoras/importar-core", async (req, res): Promise<void> => {
  try {
    const resultado = await importarVendedorasDoCore();
    req.log.info(resultado, "Import de vendedoras do lumexa-core concluído");
    res.json(resultado);
  } catch (err) {
    if (err instanceof LumexaCoreError) {
      req.log.warn({ err: err.message }, "Import de vendedoras do core falhou");
      res.status(502).json({ message: err.message });
      return;
    }
    throw err;
  }
});

router.post("/vendedoras", async (req, res): Promise<void> => {
  const parsed = CriarVendedoraBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  const vendedora = await vendedorasRepo.criar({ nome: parsed.data.nome });
  res.status(201).json(CriarVendedoraResponse.parse(vendedoraParaDTO(vendedora)));
});

router.patch("/vendedoras/:id", async (req, res): Promise<void> => {
  const params = AtualizarVendedoraParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ message: params.error.message });
    return;
  }
  const parsed = AtualizarVendedoraBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.message });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ message: "Informe ao menos um campo para atualizar" });
    return;
  }
  const vendedora = await vendedorasRepo.atualizar(params.data.id, parsed.data);
  if (!vendedora) {
    res.status(404).json({ message: "Vendedora não encontrada" });
    return;
  }
  res.json(AtualizarVendedoraResponse.parse(vendedoraParaDTO(vendedora)));
});

export default router;
