import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pacientesRouter from "./pacientes";
import vendedorasRouter from "./vendedoras";
import medicosRouter from "./medicos";
import locaisRouter from "./locais";
import webhooksRouter from "./webhooks";
import conteudoRouter from "./conteudo";
import storageRouter from "./storage";
import contratosRouter from "./contratos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pacientesRouter);
router.use(vendedorasRouter);
router.use(medicosRouter);
router.use(locaisRouter);
router.use(webhooksRouter);
router.use(conteudoRouter);
router.use(storageRouter);
router.use(contratosRouter);

export default router;
