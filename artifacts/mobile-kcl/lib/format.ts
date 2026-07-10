/**
 * Small date helpers so the mobile app can format ISO dates the same way the
 * web Console does (dd/MM/yyyy) without pulling in a date library.
 */
import {
  apenasDigitos,
  cpfValido,
  formatarCpf,
  formatarTelefone,
  telefoneValido,
} from "@workspace/br-validacao";

export function formatDate(iso: string): string {
  // Expecting YYYY-MM-DD (optionally with a time component).
  const datePart = iso.split("T")[0];
  const [y, m, d] = datePart.split("-");
  if (y && m && d) return `${d}/${m}/${y}`;
  return iso;
}

export function formatDateTime(iso: string): string {
  // Mirrors the web Console timeline format (dd/MM/yyyy HH:mm).
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

export function isValidTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Validação/formatação de CPF e telefone (Brasil). As REGRAS e máscaras vivem na
 * fonte única `@workspace/br-validacao` (a mesma usada pelo Console web e pelo
 * api-server) — aqui só reexportamos com os nomes usados no app, para que app,
 * web e servidor nunca divirjam. Os valores são guardados apenas como dígitos.
 */
export { apenasDigitos };

export const isValidCpf = cpfValido;
export const isValidTelefone = telefoneValido;
export const formatCpf = formatarCpf;
export const formatTelefone = formatarTelefone;
