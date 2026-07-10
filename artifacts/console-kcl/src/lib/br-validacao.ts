/**
 * Validação e formatação de CPF e telefone (Brasil) para os formulários do
 * Console. As REGRAS (dígitos verificadores do CPF; DDD/formato do telefone) e
 * as máscaras vivem na fonte única `@workspace/br-validacao` — aqui só
 * reexportamos com os nomes usados no Console, mais as heurísticas de contato
 * que são específicas desta interface. Os valores são guardados só como dígitos.
 */

import {
  apenasDigitos,
  cpfValido,
  formatarCpf,
  formatarTelefone,
  telefoneValido,
} from "@workspace/br-validacao";

export { apenasDigitos, formatarCpf, formatarTelefone };

/** Valida CPF pelo dígito verificador (rejeita sequências repetidas). */
export const validarCpf = cpfValido;

/** Telefone BR: 10 (fixo) ou 11 (celular, 9º dígito = 9) dígitos, DDD >= 11. */
export const validarTelefone = telefoneValido;

/**
 * Heurística leve: o valor "parece um telefone" — tem ao menos um dígito e
 * contém apenas caracteres de formatação de telefone (dígitos, espaços,
 * parênteses, +, - e ponto). Endereços, e-mails e textos livres ficam de fora.
 */
export function pareceTelefone(valor: string): boolean {
  const v = (valor ?? "").trim();
  if (v === "") return false;
  return /\d/.test(v) && /^[\d\s()+\-.]+$/.test(v);
}

/**
 * Aplica a máscara progressiva de telefone APENAS quando o valor parece um
 * telefone. Tokens de template ({{...}}) e valores claramente não-telefônicos
 * (endereços, e-mails) são devolvidos sem alteração, para serem digitados à
 * vontade.
 */
export function formatarContatoTelefone(valor: string): string {
  if (/\{\{.*?\}\}/.test(valor)) return valor;
  if (!pareceTelefone(valor)) return valor;
  return formatarTelefone(valor);
}

/**
 * Detecta um número de WhatsApp/telefone incompleto num contato, para avisar a
 * equipe antes que ele saia quebrado na página da paciente. É só um aviso — não
 * bloqueia o salvamento. Regras:
 *  - tokens de template ({{...}}) nunca avisam (resolvem em runtime);
 *  - valor vazio só avisa quando o rótulo indica WhatsApp/secretaria/telefone;
 *  - valores "claramente não-telefone" (endereços, e-mails) são ignorados — só
 *    tratamos como telefone quando o valor tem dígitos e apenas caracteres de
 *    formatação de telefone;
 *  - um valor que parece telefone mas falha na validação BR aciona o aviso.
 */
export function contatoTelefoneIncompleto(contato: {
  rotulo?: string | null;
  valor?: string | null;
}): boolean {
  const valor = (contato.valor ?? "").trim();
  const rotulo = (contato.rotulo ?? "").toLowerCase();
  const rotuloTelefone = /whats|secretaria|telefone|fone|celular/.test(rotulo);

  if (/\{\{.*?\}\}/.test(valor)) return false;

  if (valor === "") return rotuloTelefone;

  if (!pareceTelefone(valor)) return false;

  return !validarTelefone(valor);
}
