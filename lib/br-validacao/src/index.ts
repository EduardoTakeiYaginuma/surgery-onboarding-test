/**
 * Fonte ÚNICA das regras de identificação da paciente no Brasil: validação do
 * CPF (pelos dígitos verificadores) e do telefone (formato/DDD). Antes, a mesma
 * lógica era copiada à mão no Console (web), no app (mobile) e na rota do
 * api-server — um ajuste numa cópia e esquecido nas outras deixaria um público
 * gravar dados que os demais rejeitam (ou o contrário), sem nenhum teste pegar.
 *
 * Agora os três consumidores reexportam estas funções, então a regra mora aqui
 * — e só aqui. Cada artefato roda `CASOS_CPF`/`CASOS_TELEFONE` (o corpus abaixo)
 * contra a sua própria reexportação; se alguém recriar uma cópia local e ela
 * divergir, o teste daquele artefato falha. Mudar uma regra significa mudar este
 * módulo e o corpus juntos, o que reflete em Console, mobile e servidor de uma só
 * vez.
 *
 * Os valores são guardados apenas como DÍGITOS; a formatação (máscaras) é só
 * para exibição. cpf/telefone são PII interna — nunca entram no DTO público.
 */

export function apenasDigitos(valor: string): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** Valida CPF pelo dígito verificador (rejeita sequências repetidas). */
export function cpfValido(valor: string): boolean {
  const cpf = apenasDigitos(valor);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const digito = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * (pesoInicial - i);
    }
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };

  if (digito(cpf.slice(0, 9), 10) !== Number(cpf[9])) return false;
  if (digito(cpf.slice(0, 10), 11) !== Number(cpf[10])) return false;
  return true;
}

/** Telefone BR: 10 (fixo) ou 11 (celular, 9º dígito = 9) dígitos, DDD >= 11. */
export function telefoneValido(valor: string): boolean {
  const tel = apenasDigitos(valor);
  if (tel.length !== 10 && tel.length !== 11) return false;
  if (Number(tel.slice(0, 2)) < 11) return false;
  if (tel.length === 11 && tel[2] !== "9") return false;
  return true;
}

/** Máscara progressiva 000.000.000-00 (apenas exibição). */
export function formatarCpf(valor: string): string {
  const cpf = apenasDigitos(valor).slice(0, 11);
  if (cpf.length > 9) {
    return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
  }
  if (cpf.length > 6) return `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6)}`;
  if (cpf.length > 3) return `${cpf.slice(0, 3)}.${cpf.slice(3)}`;
  return cpf;
}

/** Máscara progressiva (00) 0000-0000 / (00) 00000-0000 (apenas exibição). */
export function formatarTelefone(valor: string): string {
  const tel = apenasDigitos(valor).slice(0, 11);
  if (tel.length === 0) return "";
  if (tel.length <= 2) return `(${tel}`;
  if (tel.length <= 6) return `(${tel.slice(0, 2)}) ${tel.slice(2)}`;
  if (tel.length <= 10) {
    return `(${tel.slice(0, 2)}) ${tel.slice(2, 6)}-${tel.slice(6)}`;
  }
  return `(${tel.slice(0, 2)}) ${tel.slice(2, 7)}-${tel.slice(7)}`;
}

/**
 * Corpus compartilhado de decisão accept/reject. É a referência única que cada
 * consumidor (Console, mobile, api-server) roda contra a SUA reexportação de
 * `cpfValido`/`telefoneValido`. Manter as expectativas aqui garante que mudar
 * uma regra force atualizar este corpus — e, com isso, todos os três artefatos
 * passam a concordar de novo (ou os testes falham até concordarem).
 */
export interface CasoValidacao {
  entrada: string;
  valido: boolean;
  nota: string;
}

export const CASOS_CPF: readonly CasoValidacao[] = [
  { entrada: "529.982.247-25", valido: true, nota: "CPF válido com máscara" },
  { entrada: "52998224725", valido: true, nota: "CPF válido só dígitos" },
  { entrada: "529.982.247-24", valido: false, nota: "dígito verificador errado" },
  { entrada: "111.111.111-11", valido: false, nota: "sequência repetida" },
  { entrada: "000.000.000-00", valido: false, nota: "sequência de zeros" },
  { entrada: "529.982.247-2", valido: false, nota: "dígitos a menos" },
  { entrada: "5299822472555", valido: false, nota: "dígitos a mais" },
  { entrada: "", valido: false, nota: "vazio" },
] as const;

export const CASOS_TELEFONE: readonly CasoValidacao[] = [
  { entrada: "1133334444", valido: true, nota: "fixo 10 dígitos, DDD ok" },
  { entrada: "11999998888", valido: true, nota: "celular 11 dígitos, 9 no 3º" },
  { entrada: "(11) 99999-8888", valido: true, nota: "celular com máscara" },
  { entrada: "119999", valido: false, nota: "curto demais" },
  { entrada: "119999988887", valido: false, nota: "longo demais" },
  { entrada: "1099998888", valido: false, nota: "DDD menor que 11" },
  { entrada: "11899998888", valido: false, nota: "11 dígitos sem 9 no 3º" },
  { entrada: "", valido: false, nota: "vazio" },
] as const;
