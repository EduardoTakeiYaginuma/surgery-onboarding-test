/**
 * Validação de CPF e telefone (Brasil) no servidor. Confere o FORMATO de
 * verdade — dígitos verificadores do CPF e o formato do telefone — e não só o
 * tamanho/pattern do schema. As REGRAS vivem na fonte única
 * `@workspace/br-validacao` (a mesma dos formulários do Console e do app), então
 * dados gravados via API direta têm a mesma integridade da interface e as três
 * camadas nunca divergem.
 */
export { apenasDigitos, cpfValido, telefoneValido } from "@workspace/br-validacao";
