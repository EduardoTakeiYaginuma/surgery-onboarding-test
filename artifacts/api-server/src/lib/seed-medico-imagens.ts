import path from "path";
import fs from "fs";
import { medicosRepo } from "./medicos-repo";
import {
  uploadFotoMedico,
  uploadLogoMedico,
  storageConfigurado,
} from "./fotos-storage";
import { logger } from "./logger";

/**
 * Sobe as imagens iniciais da médica padrão (Dra. Karla) para o Object Storage
 * e grava os ponteiros no banco — apenas quando os campos ainda estão nulos
 * (idempotente; nunca sobrescreve imagens já enviadas pela equipe).
 *
 * Silencia qualquer falha: em ambiente de dev sem storage configurado, ou se
 * o storage sidecar não estiver disponível, apenas loga um aviso e continua.
 */
export async function seedMedicoImagens(): Promise<void> {
  if (!storageConfigurado()) {
    logger.info("Storage não configurado — seed de imagens da médica ignorado");
    return;
  }

  const medico = await medicosRepo.obterPadrao();
  if (!medico) {
    logger.warn("Nenhuma médica padrão encontrada — seed de imagens ignorado");
    return;
  }

  // process.cwd() ao subir é artifacts/api-server; o workspace raiz fica dois níveis acima.
  const raiz = path.resolve(process.cwd(), "../..");

  if (!medico.foto) {
    const fotoPath = path.join(
      raiz,
      "attached_assets",
      "43A16F2D-082F-4F56-B4A3-4CC44C9B1C2A_1782503804098.JPG",
    );
    if (fs.existsSync(fotoPath)) {
      try {
        const buffer = fs.readFileSync(fotoPath);
        const relativo = await uploadFotoMedico({
          medicoId: medico.id,
          buffer,
          contentType: "image/jpeg",
        });
        await medicosRepo.definirFoto(medico.id, relativo);
        logger.info({ medicoId: medico.id }, "Foto padrão da médica semeada");
      } catch (err) {
        logger.warn({ err }, "Falha ao semear foto padrão da médica — continuando");
      }
    } else {
      logger.warn({ fotoPath }, "Arquivo de foto padrão não encontrado — seed ignorado");
    }
  }

  if (!medico.logo) {
    const logoPath = path.join(
      raiz,
      "attached_assets",
      "image_1782512165488.png",
    );
    if (fs.existsSync(logoPath)) {
      try {
        const buffer = fs.readFileSync(logoPath);
        const relativo = await uploadLogoMedico({
          medicoId: medico.id,
          buffer,
          contentType: "image/png",
        });
        await medicosRepo.definirLogo(medico.id, relativo);
        logger.info({ medicoId: medico.id }, "Logo padrão da médica semeado");
      } catch (err) {
        logger.warn({ err }, "Falha ao semear logo padrão da médica — continuando");
      }
    } else {
      logger.warn({ logoPath }, "Arquivo de logo padrão não encontrado — seed ignorado");
    }
  }
}
