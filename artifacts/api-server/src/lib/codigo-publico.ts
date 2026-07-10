import { randomInt } from "node:crypto";

// Alfabeto sem caracteres ambíguos (0/O, 1/l/I) para o link curto ficar fácil
// de ler/digitar e robusto contra adivinhação por força bruta.
const ALFABETO = "abcdefghjkmnpqrstuvwxyz23456789";
const TAMANHO = 8;

/** Gera um código curto aleatório (ex.: "ab12cd34") para o link público. */
export function gerarCodigoPublico(): string {
  let codigo = "";
  for (let i = 0; i < TAMANHO; i++) {
    codigo += ALFABETO[randomInt(ALFABETO.length)];
  }
  return codigo;
}
