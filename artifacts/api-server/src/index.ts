import app from "./app";
import { logger } from "./lib/logger";
import { seedMedicoImagens } from "./lib/seed-medico-imagens";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Seed idempotente: sobe as imagens iniciais da médica padrão (Dra. Karla)
// ao Object Storage se ainda não existirem. Silencia qualquer falha para não
// bloquear a subida do servidor.
seedMedicoImagens().catch((err) =>
  logger.warn({ err }, "Seed de imagens da médica falhou — servidor continua"),
);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
