/**
 * Utilitários puros compartilhados pelos formulários de paciente (edição na
 * página da paciente e edição inline da ficha do contrato em /documentos).
 * Mantidos aqui para evitar duplicação entre `console-patient.tsx` e
 * `gerador-contrato.tsx`.
 */

/** Valor do <Select> de médico que representa "preencher manualmente". */
export const MEDICO_PERSONALIZADO = "__personalizado__";

/**
 * Domingo de Páscoa (Date em UTC) do ano, pelo algoritmo de Meeus/Butcher.
 * Base para os feriados móveis brasileiros (Carnaval, Sexta-feira Santa,
 * Corpus Christi). Espelha `feriadosDoAno` do servidor (api-server/lib/prazos).
 */
function domingoDePascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mlt = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * mlt + 114) / 31);
  const dia = ((h + l - 7 * mlt + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function somarDias(base: Date, delta: number): Date {
  const dt = new Date(base.getTime());
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt;
}

const cacheFeriados = new Map<number, Set<string>>();

/**
 * Conjunto de feriados (yyyy-mm-dd) brasileiros relevantes — nacionais fixos,
 * móveis (atrelados à Páscoa) e o estadual de São Paulo. Mantenha em sincronia
 * com `feriadosDoAno` em `artifacts/api-server/src/lib/prazos.ts`.
 */
function feriadosDoAno(ano: number): Set<string> {
  const cache = cacheFeriados.get(ano);
  if (cache) return cache;

  const pad = (n: number) => String(n).padStart(2, "0");
  const fixo = (mes: number, dia: number) => `${ano}-${pad(mes)}-${pad(dia)}`;
  const movel = (delta: number) =>
    somarDias(domingoDePascoa(ano), delta).toISOString().slice(0, 10);

  const feriados = new Set<string>([
    fixo(1, 1), // Confraternização Universal
    fixo(4, 21), // Tiradentes
    fixo(5, 1), // Dia do Trabalho
    fixo(9, 7), // Independência
    fixo(10, 12), // Nossa Senhora Aparecida
    fixo(11, 2), // Finados
    fixo(11, 15), // Proclamação da República
    fixo(12, 25), // Natal
    movel(-48), // Segunda de Carnaval
    movel(-47), // Terça de Carnaval
    movel(-2), // Sexta-feira Santa
    movel(60), // Corpus Christi
    fixo(7, 9), // Revolução Constitucionalista (SP)
  ]);

  // Consciência Negra é feriado nacional a partir de 2024 (Lei 14.759/2023).
  if (ano >= 2024) feriados.add(fixo(11, 20));

  cacheFeriados.set(ano, feriados);
  return feriados;
}

/**
 * Devolve a data yyyy-mm-dd que cai `n` dias úteis antes de `iso`,
 * pulando sábados, domingos e feriados brasileiros (ver `feriadosDoAno`).
 */
export function diasUteisAntes(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  let restantes = Math.max(0, n);
  while (restantes > 0) {
    dt.setUTCDate(dt.getUTCDate() - 1);
    const dow = dt.getUTCDay();
    const ehFimDeSemana = dow === 0 || dow === 6;
    const ehFeriado = feriadosDoAno(dt.getUTCFullYear()).has(
      dt.toISOString().slice(0, 10),
    );
    if (!ehFimDeSemana && !ehFeriado) restantes--;
  }
  return dt.toISOString().slice(0, 10);
}
