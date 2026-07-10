import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  SecaoConteudoTipo,
  type SecaoConteudo,
  type SecaoContato,
  type SecaoEtapa,
  type SecaoGrupoMedicamentos,
  type SecaoMedicamento,
  type SecaoProduto,
  type SecaoMedicacao,
} from "@workspace/api-client-react";

import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";
import { VARIAVEIS_PREVIEW } from "@/lib/secoes-preview";

const TIPO_ROTULO: Record<SecaoConteudo["tipo"], string> = {
  linha_do_tempo: "Linha do tempo",
  lista: "Lista de itens",
  documentos: "Documentos",
  politica: "Política / Recolhível",
  contatos: "Contatos",
  texto: "Texto livre",
  preparo: "Exames pré-operatórios",
  suspensao_medicamentos: "Suspensão de medicamentos",
  preparo_pele: "Preparo da pele",
  receituario_posop: "Receituário pós-operatório",
};

// Os chips de "Variáveis disponíveis" derivam do catálogo único em
// `@workspace/secoes` (via `VARIAVEIS_PREVIEW`). Acrescentar uma chave lá faz o
// chip aparecer aqui automaticamente — não declare a lista localmente.
const VARIAVEIS = VARIAVEIS_PREVIEW;

function gerarId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `secao-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function secaoNova(tipo: SecaoConteudo["tipo"]): SecaoConteudo {
  const base: SecaoConteudo = { id: gerarId(), tipo, titulo: "" };
  switch (tipo) {
    case "linha_do_tempo":
      return { ...base, titulo: "Sua jornada", etapas: [] };
    case "preparo":
      return {
        ...base,
        titulo: "Exames Pré-Operatórios",
        corpo:
          "Realize os exames abaixo o mais breve possível e nos envie os resultados para anexarmos ao seu prontuário.",
        itens: [],
      };
    case "lista":
      return { ...base, titulo: "Como se preparar", itens: [] };
    case "documentos":
      return { ...base, titulo: "Documentos", itens: [] };
    case "politica":
      return { ...base, titulo: "Política de remarcação", corpo: "" };
    case "contatos":
      return { ...base, titulo: "Contatos", contatos: [] };
    case "texto":
      return { ...base, titulo: "Texto", corpo: "" };
    case "suspensao_medicamentos":
      return {
        ...base,
        titulo: "Suspensão de Medicamentos",
        corpo:
          "Se você utiliza algum dos medicamentos abaixo, suspenda-o com a antecedência indicada. Caso não use nenhum deles, desconsidere esta seção.",
        aviso:
          "Se você toma medicamentos de uso contínuo que não estão nesta lista, mantenha o uso normal conforme orientação do seu médico. Caso tenha dúvida sobre algum medicamento específico, entre em contato conosco.",
        grupos: [],
      };
    case "preparo_pele":
      return {
        ...base,
        titulo: "Preparo da Pele",
        corpo:
          "Inicie o uso dos produtos abaixo conforme orientação. Eles ajudam a preparar sua pele para o melhor resultado cirúrgico.",
        produtos: [],
      };
    case "receituario_posop":
      return {
        ...base,
        titulo: "Receituário Pós-Operatório",
        corpo:
          "Medicações que serão utilizadas após o procedimento. Já deixe tudo separado para o dia da cirurgia.",
        aviso: "",
        medicacoes: [],
      };
    default:
      return base;
  }
}

export function SecoesEditor({
  secoes,
  onChange,
}: {
  secoes: SecaoConteudo[];
  onChange: (secoes: SecaoConteudo[]) => void;
}) {
  const colors = useColors();
  const [novoTipo, setNovoTipo] = useState<SecaoConteudo["tipo"]>("texto");

  function atualizar(idx: number, patch: Partial<SecaoConteudo>) {
    onChange(secoes.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function remover(idx: number) {
    onChange(secoes.filter((_, i) => i !== idx));
  }

  function mover(idx: number, dir: -1 | 1) {
    const alvo = idx + dir;
    if (alvo < 0 || alvo >= secoes.length) return;
    const copia = [...secoes];
    [copia[idx], copia[alvo]] = [copia[alvo], copia[idx]];
    onChange(copia);
  }

  function adicionar() {
    onChange([...secoes, secaoNova(novoTipo)]);
  }

  return (
    <View style={styles.root}>
      {/* Variáveis disponíveis */}
      <View style={[styles.varsBox, { borderColor: colors.card, backgroundColor: "rgba(17,41,74,0.2)" }]}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>VARIÁVEIS DISPONÍVEIS</Text>
        <Text style={[styles.varsHint, { color: colors.mutedForeground }]}>
          Use estes códigos no texto — eles são substituídos automaticamente pelos dados de cada paciente.
        </Text>
        <View style={styles.varsWrap}>
          {VARIAVEIS.map((v) => (
            <View key={v.token} style={[styles.varChip, { borderColor: "rgba(201,169,110,0.3)" }]}>
              <Text style={[styles.varChipText, { color: colors.primary }]}>{v.token}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Seções */}
      {secoes.length === 0 ? (
        <View style={[styles.empty, { borderColor: colors.card }]}>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Nenhuma seção ainda. Adicione a primeira abaixo.
          </Text>
        </View>
      ) : (
        secoes.map((secao, idx) => (
          <View key={secao.id} style={[styles.secaoCard, { borderColor: colors.card, backgroundColor: "rgba(17,41,74,0.2)" }]}>
            <View style={[styles.secaoHead, { borderBottomColor: colors.card }]}>
              <Text style={[styles.secaoTipo, { color: colors.primary }]}>
                {TIPO_ROTULO[secao.tipo].toUpperCase()}
              </Text>
              <View style={styles.secaoActions}>
                <IconBtn
                  icon="chevron-up"
                  disabled={idx === 0}
                  onPress={() => mover(idx, -1)}
                  testID={`mover-cima-${idx}`}
                />
                <IconBtn
                  icon="chevron-down"
                  disabled={idx === secoes.length - 1}
                  onPress={() => mover(idx, 1)}
                  testID={`mover-baixo-${idx}`}
                />
                <IconBtn icon="trash-2" danger onPress={() => remover(idx)} testID={`remover-secao-${idx}`} />
              </View>
            </View>

            <View style={styles.secaoBody}>
              <Campo label="Título">
                <Input
                  value={secao.titulo}
                  onChangeText={(titulo) => atualizar(idx, { titulo })}
                  placeholder="Título da seção"
                />
              </Campo>

              {(secao.tipo === "lista" || secao.tipo === "documentos") && (
                <ItensEditor itens={secao.itens ?? []} onChange={(itens) => atualizar(idx, { itens })} />
              )}

              {(secao.tipo === "texto" || secao.tipo === "politica") && (
                <Campo label="Conteúdo">
                  <Input
                    value={secao.corpo ?? ""}
                    onChangeText={(corpo) => atualizar(idx, { corpo })}
                    placeholder="Escreva o texto. Você pode usar variáveis como {{primeiroNome}}."
                    multiline
                  />
                </Campo>
              )}

              {secao.tipo === "linha_do_tempo" && (
                <EtapasEditor etapas={secao.etapas ?? []} onChange={(etapas) => atualizar(idx, { etapas })} />
              )}

              {secao.tipo === "preparo" && (
                <>
                  <Campo label="Descrição">
                    <Input
                      value={secao.corpo ?? ""}
                      onChangeText={(corpo) => atualizar(idx, { corpo })}
                      placeholder="Ex.: Realize os exames abaixo e nos envie os resultados."
                      multiline
                    />
                  </Campo>
                  <Campo label="Exames">
                    <ItensEditor itens={secao.itens ?? []} onChange={(itens) => atualizar(idx, { itens })} />
                  </Campo>
                </>
              )}

              {secao.tipo === "contatos" && (
                <ContatosEditor
                  contatos={secao.contatos ?? []}
                  onChange={(contatos) => atualizar(idx, { contatos })}
                />
              )}

              {secao.tipo === "suspensao_medicamentos" && (
                <>
                  <Campo label="Introdução">
                    <Input
                      value={secao.corpo ?? ""}
                      onChangeText={(corpo) => atualizar(idx, { corpo })}
                      placeholder="Texto curto abaixo do título."
                      multiline
                    />
                  </Campo>
                  <GruposMedicamentosEditor
                    grupos={secao.grupos ?? []}
                    onChange={(grupos) => atualizar(idx, { grupos })}
                  />
                  <Campo label="Aviso (rodapé)">
                    <Input
                      value={secao.aviso ?? ""}
                      onChangeText={(aviso) => atualizar(idx, { aviso })}
                      placeholder="Callout de rodapé (opcional)."
                      multiline
                    />
                  </Campo>
                  <Campo label="Lista completa (PDF)">
                    <Text style={[styles.varsHint, { color: colors.mutedForeground }]}>
                      O PDF da lista completa é anexado pelo Console. A data-limite de
                      cada janela é calculada pelo offset em dias.
                    </Text>
                  </Campo>
                </>
              )}

              {secao.tipo === "preparo_pele" && (
                <>
                  <Campo label="Descrição">
                    <Input
                      value={secao.corpo ?? ""}
                      onChangeText={(corpo) => atualizar(idx, { corpo })}
                      placeholder="Ex.: Inicie o uso dos produtos abaixo conforme orientação."
                      multiline
                    />
                  </Campo>
                  <ProdutosEditor
                    produtos={secao.produtos ?? []}
                    onChange={(produtos) => atualizar(idx, { produtos })}
                  />
                  <Campo label="Receita (PDF)">
                    <Text style={[styles.varsHint, { color: colors.mutedForeground }]}>
                      O PDF da receita é anexado por paciente pelo Console.
                    </Text>
                  </Campo>
                </>
              )}

              {secao.tipo === "receituario_posop" && (
                <>
                  <Campo label="Descrição">
                    <Input
                      value={secao.corpo ?? ""}
                      onChangeText={(corpo) => atualizar(idx, { corpo })}
                      placeholder="Ex.: Medicações que serão utilizadas após o procedimento."
                      multiline
                    />
                  </Campo>
                  <MedicacoesEditor
                    medicacoes={secao.medicacoes ?? []}
                    onChange={(medicacoes) => atualizar(idx, { medicacoes })}
                  />
                  <Campo label="Aviso (rodapé)">
                    <Input
                      value={secao.aviso ?? ""}
                      onChangeText={(aviso) => atualizar(idx, { aviso })}
                      placeholder="Callout de rodapé (ex.: indicações de protetor solar). Opcional."
                      multiline
                    />
                  </Campo>
                  <Campo label="Receituário (PDF)">
                    <Text style={[styles.varsHint, { color: colors.mutedForeground }]}>
                      O PDF do receituário é anexado por paciente pelo Console.
                    </Text>
                  </Campo>
                </>
              )}
            </View>
          </View>
        ))
      )}

      {/* Adicionar seção */}
      <View style={[styles.addBox, { borderTopColor: colors.card }]}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>NOVA SEÇÃO</Text>
        <View style={styles.tipoWrap}>
          {Object.values(SecaoConteudoTipo).map((tipo) => {
            const ativo = novoTipo === tipo;
            return (
              <Pressable
                key={tipo}
                onPress={() => setNovoTipo(tipo)}
                style={[
                  styles.tipoChip,
                  {
                    borderColor: ativo ? colors.primary : colors.card,
                    backgroundColor: ativo ? "rgba(201,169,110,0.12)" : "transparent",
                  },
                ]}
              >
                <Text style={[styles.tipoChipText, { color: ativo ? colors.foreground : colors.mutedForeground }]}>
                  {TIPO_ROTULO[tipo]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          onPress={adicionar}
          testID="adicionar-secao"
          style={({ pressed }) => [styles.addBtn, { backgroundColor: colors.ivory, opacity: pressed ? 0.85 : 1 }]}
        >
          <Feather name="plus" size={15} color={colors.ivoryForeground} />
          <Text style={[styles.addBtnText, { color: colors.ivoryForeground }]}>Adicionar seção</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ItensEditor({ itens, onChange }: { itens: string[]; onChange: (itens: string[]) => void }) {
  return (
    <Campo label="Itens">
      <View style={styles.subList}>
        {itens.map((item, idx) => (
          <View key={idx} style={styles.subRow}>
            <View style={{ flex: 1 }}>
              <Input
                value={item}
                onChangeText={(v) => onChange(itens.map((it, i) => (i === idx ? v : it)))}
                placeholder="Item"
              />
            </View>
            <IconBtn icon="trash-2" danger onPress={() => onChange(itens.filter((_, i) => i !== idx))} />
          </View>
        ))}
      </View>
      <SubAddBtn label="Adicionar item" onPress={() => onChange([...itens, ""])} />
    </Campo>
  );
}

function EtapasEditor({
  etapas,
  onChange,
  mostrarOffset = true,
}: {
  etapas: SecaoEtapa[];
  onChange: (etapas: SecaoEtapa[]) => void;
  /** Em `preparo`, `quando` é rótulo livre — sem cálculo de data —, então o
   *  campo de offset é ocultado. */
  mostrarOffset?: boolean;
}) {
  const colors = useColors();
  function atualizar(idx: number, patch: Partial<SecaoEtapa>) {
    onChange(etapas.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  }
  return (
    <Campo label={mostrarOffset ? "Etapas" : "Passos"}>
      <View style={styles.subList}>
        {etapas.map((etapa, idx) => (
          <View key={idx} style={[styles.etapaCard, { borderColor: colors.card }]}>
            <View style={styles.etapaHead}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>
                {mostrarOffset ? "ETAPA" : "PASSO"} {idx + 1}
              </Text>
              <IconBtn icon="trash-2" danger onPress={() => onChange(etapas.filter((_, i) => i !== idx))} />
            </View>
            <Input
              value={etapa.quando}
              onChangeText={(quando) => atualizar(idx, { quando })}
              placeholder="Quando (ex: 7 dias antes)"
            />
            {mostrarOffset ? (
              <Input
                value={etapa.offsetDias == null ? "" : String(etapa.offsetDias)}
                onChangeText={(v) => atualizar(idx, { offsetDias: v.trim() === "" ? null : Number(v) })}
                placeholder="Offset em dias (ex: -7)"
                keyboardType="numbers-and-punctuation"
              />
            ) : null}
            <Input
              value={etapa.titulo}
              onChangeText={(titulo) => atualizar(idx, { titulo })}
              placeholder="Título da etapa"
            />
            <Input
              value={etapa.descricao}
              onChangeText={(descricao) => atualizar(idx, { descricao })}
              placeholder="Descrição"
              multiline
            />
          </View>
        ))}
      </View>
      <SubAddBtn
        label="Adicionar etapa"
        onPress={() => onChange([...etapas, { quando: "", titulo: "", descricao: "", offsetDias: null }])}
      />
    </Campo>
  );
}

function GruposMedicamentosEditor({
  grupos,
  onChange,
}: {
  grupos: SecaoGrupoMedicamentos[];
  onChange: (grupos: SecaoGrupoMedicamentos[]) => void;
}) {
  const colors = useColors();
  function atualizar(idx: number, patch: Partial<SecaoGrupoMedicamentos>) {
    onChange(grupos.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  }
  function atualizarMed(gIdx: number, mIdx: number, patch: Partial<SecaoMedicamento>) {
    const medicamentos = (grupos[gIdx].medicamentos ?? []).map((m, i) =>
      i === mIdx ? { ...m, ...patch } : m,
    );
    atualizar(gIdx, { medicamentos });
  }
  return (
    <Campo label="Janelas de suspensão">
      <View style={styles.subList}>
        {grupos.map((grupo, gIdx) => {
          const medicamentos = grupo.medicamentos ?? [];
          return (
            <View key={gIdx} style={[styles.etapaCard, { borderColor: colors.card }]}>
              <View style={styles.etapaHead}>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>JANELA {gIdx + 1}</Text>
                <IconBtn icon="trash-2" danger onPress={() => onChange(grupos.filter((_, i) => i !== gIdx))} />
              </View>
              <Input
                value={grupo.quando}
                onChangeText={(quando) => atualizar(gIdx, { quando })}
                placeholder="Rótulo (ex: 7 dias antes)"
              />
              <Input
                value={grupo.offsetDias == null ? "" : String(grupo.offsetDias)}
                onChangeText={(v) => atualizar(gIdx, { offsetDias: v.trim() === "" ? null : Number(v) })}
                placeholder="Offset em dias (ex: -7)"
                keyboardType="numbers-and-punctuation"
              />
              <Text style={[styles.label, { color: colors.mutedForeground }]}>MEDICAMENTOS</Text>
              {medicamentos.map((m, mIdx) => (
                <View key={mIdx} style={styles.subRow}>
                  <View style={{ flex: 1, gap: 8 }}>
                    <Input
                      value={m.marca}
                      onChangeText={(marca) => atualizarMed(gIdx, mIdx, { marca })}
                      placeholder="Marca (ex: Xarelto)"
                    />
                    <Input
                      value={m.principio ?? ""}
                      onChangeText={(principio) => atualizarMed(gIdx, mIdx, { principio })}
                      placeholder="Princípio ativo (ex: Rivaroxabana)"
                    />
                  </View>
                  <IconBtn
                    icon="trash-2"
                    danger
                    onPress={() =>
                      atualizar(gIdx, { medicamentos: medicamentos.filter((_, i) => i !== mIdx) })
                    }
                  />
                </View>
              ))}
              <SubAddBtn
                label="Adicionar medicamento"
                onPress={() =>
                  atualizar(gIdx, { medicamentos: [...medicamentos, { marca: "", principio: "" }] })
                }
              />
            </View>
          );
        })}
      </View>
      <SubAddBtn
        label="Adicionar janela"
        onPress={() => onChange([...grupos, { quando: "", offsetDias: null, medicamentos: [] }])}
      />
    </Campo>
  );
}

function ContatosEditor({
  contatos,
  onChange,
}: {
  contatos: SecaoContato[];
  onChange: (contatos: SecaoContato[]) => void;
}) {
  function atualizar(idx: number, patch: Partial<SecaoContato>) {
    onChange(contatos.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  return (
    <Campo label="Contatos">
      <View style={styles.subList}>
        {contatos.map((contato, idx) => (
          <View key={idx} style={styles.contatoRow}>
            <Input
              value={contato.rotulo}
              onChangeText={(rotulo) => atualizar(idx, { rotulo })}
              placeholder="Rótulo (ex: WhatsApp da equipe)"
            />
            <View style={styles.subRow}>
              <View style={{ flex: 1 }}>
                <Input
                  value={contato.valor}
                  onChangeText={(valor) => atualizar(idx, { valor })}
                  placeholder="Valor (ex: {{equipeTelefone}})"
                />
              </View>
              <IconBtn icon="trash-2" danger onPress={() => onChange(contatos.filter((_, i) => i !== idx))} />
            </View>
          </View>
        ))}
      </View>
      <SubAddBtn label="Adicionar contato" onPress={() => onChange([...contatos, { rotulo: "", valor: "" }])} />
    </Campo>
  );
}

function ProdutosEditor({
  produtos,
  onChange,
}: {
  produtos: SecaoProduto[];
  onChange: (produtos: SecaoProduto[]) => void;
}) {
  const colors = useColors();
  function atualizar(idx: number, patch: Partial<SecaoProduto>) {
    onChange(produtos.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }
  return (
    <Campo label="Produtos">
      <View style={styles.subList}>
        {produtos.map((produto, idx) => (
          <View key={idx} style={[styles.etapaCard, { borderColor: colors.card }]}>
            <View style={styles.etapaHead}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>PRODUTO {idx + 1}</Text>
              <IconBtn icon="trash-2" danger onPress={() => onChange(produtos.filter((_, i) => i !== idx))} />
            </View>
            <Input
              value={produto.nome}
              onChangeText={(nome) => atualizar(idx, { nome })}
              placeholder="Nome e marca (ex: Blancy TX — Mantecorp)"
            />
            <Input
              value={produto.instrucao}
              onChangeText={(instrucao) => atualizar(idx, { instrucao })}
              placeholder="Instrução de uso"
              multiline
            />
            <Input
              value={produto.inicio}
              onChangeText={(inicio) => atualizar(idx, { inicio })}
              placeholder="Quando começar (ex: Iniciar 10 dias antes)"
            />
            <Input
              value={produto.tag}
              onChangeText={(tag) => atualizar(idx, { tag })}
              placeholder="Tag (ex: 1 frasco · Uso tópico noturno)"
            />
          </View>
        ))}
      </View>
      <SubAddBtn
        label="Adicionar produto"
        onPress={() => onChange([...produtos, { nome: "", instrucao: "", inicio: "", tag: "" }])}
      />
    </Campo>
  );
}

function MedicacoesEditor({
  medicacoes,
  onChange,
}: {
  medicacoes: SecaoMedicacao[];
  onChange: (medicacoes: SecaoMedicacao[]) => void;
}) {
  const colors = useColors();
  function atualizar(idx: number, patch: Partial<SecaoMedicacao>) {
    onChange(medicacoes.map((m, i) => (i === idx ? { ...m, ...patch } : m)));
  }
  return (
    <Campo label="Medicações">
      <View style={styles.subList}>
        {medicacoes.map((med, idx) => (
          <View key={idx} style={[styles.etapaCard, { borderColor: colors.card }]}>
            <View style={styles.etapaHead}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>MEDICAÇÃO {idx + 1}</Text>
              <IconBtn icon="trash-2" danger onPress={() => onChange(medicacoes.filter((_, i) => i !== idx))} />
            </View>
            <Input
              value={med.nome}
              onChangeText={(nome) => atualizar(idx, { nome })}
              placeholder="Nome e dose (ex: Cefalexina 500mg)"
            />
            <Input
              value={med.instrucao}
              onChangeText={(instrucao) => atualizar(idx, { instrucao })}
              placeholder="Posologia"
              multiline
            />
            <Input
              value={med.via}
              onChangeText={(via) => atualizar(idx, { via })}
              placeholder="Via (ex: Via oral, Uso ocular)"
            />
          </View>
        ))}
      </View>
      <SubAddBtn
        label="Adicionar medicação"
        onPress={() => onChange([...medicacoes, { nome: "", instrucao: "", via: "" }])}
      />
    </Campo>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.campo}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Input({
  multiline,
  ...props
}: React.ComponentProps<typeof TextInput>) {
  const colors = useColors();
  return (
    <TextInput
      placeholderTextColor="rgba(151,163,180,0.5)"
      multiline={multiline}
      style={[
        styles.input,
        multiline && styles.inputMultiline,
        { backgroundColor: colors.background, color: colors.foreground, borderColor: colors.card },
      ]}
      {...props}
    />
  );
}

function IconBtn({
  icon,
  onPress,
  disabled,
  danger,
  testID,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  testID?: string;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      testID={testID}
      style={({ pressed }) => [styles.iconBtn, { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}
    >
      <Feather name={icon} size={17} color={danger ? "#E59B9B" : colors.mutedForeground} />
    </Pressable>
  );
}

function SubAddBtn({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.subAddBtn, { borderColor: colors.card, opacity: pressed ? 0.7 : 1 }]}
    >
      <Feather name="plus" size={13} color={colors.mutedForeground} />
      <Text style={[styles.subAddText, { color: colors.mutedForeground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { gap: 20 },

  label: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5 },

  varsBox: { borderWidth: 1, padding: 16, gap: 10 },
  varsHint: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  varsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  varChip: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  varChipText: { fontFamily: fonts.mono, fontSize: 11 },

  empty: { borderWidth: 1, borderStyle: "dashed", padding: 24, alignItems: "center" },
  emptyText: { fontFamily: fonts.sans, fontSize: 14, textAlign: "center" },

  secaoCard: { borderWidth: 1 },
  secaoHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secaoTipo: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5 },
  secaoActions: { flexDirection: "row", alignItems: "center", gap: 4 },
  secaoBody: { padding: 14, gap: 16 },

  campo: { gap: 8 },
  input: {
    fontFamily: fonts.sans,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 44,
    borderWidth: 1,
  },
  inputMultiline: { minHeight: 96, textAlignVertical: "top", lineHeight: 21 },

  iconBtn: { height: 32, width: 32, alignItems: "center", justifyContent: "center" },

  subList: { gap: 10 },
  subRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  contatoRow: { gap: 8 },

  etapaCard: { borderWidth: 1, padding: 12, gap: 10 },
  etapaHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },

  subAddBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: 1,
    height: 38,
    marginTop: 4,
  },
  subAddText: { fontFamily: fonts.sansMedium, fontSize: 13 },

  addBox: { borderTopWidth: 1, paddingTop: 18, gap: 12 },
  tipoWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tipoChip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  tipoChipText: { fontFamily: fonts.sans, fontSize: 13 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    marginTop: 4,
  },
  addBtnText: { fontFamily: fonts.sansMedium, fontSize: 15 },
});
