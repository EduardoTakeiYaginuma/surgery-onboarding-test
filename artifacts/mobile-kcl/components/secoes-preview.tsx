import { Feather } from "@expo/vector-icons";
import React from "react";
import { Image, ImageBackground, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Rect as SvgRect, Text as SvgText } from "react-native-svg";
import {
  type PaginaPacienteContratoStatus,
  type PaginaPacienteTermoStatus,
  type SecaoConteudo,
} from "@workspace/api-client-react";
import { type IdentidadeMedica, iniciaisMedica } from "@workspace/secoes";

import coverPhoto from "../assets/images/surgery-cover.png";
import { fonts } from "@/constants/fonts";
import { useColors } from "@/hooks/useColors";

/**
 * Fatos da cirurgia exibidos no topo da prévia (capa + grid), espelhando a
 * página pública (`public-patient.tsx`) e a prévia web (`previa-pagina-paciente`).
 * Vêm da `PaginaPaciente` já resolvida pela API — mesma fonte que a paciente vê.
 */
export type PreviewDados = {
  /** Primeiro nome da paciente (saudação da capa). */
  primeiroNome: string;
  /** Data da cirurgia em ISO (yyyy-mm-dd). */
  dataCirurgia: string;
  /** Horário (HH:mm). */
  horario: string;
  /** Procedimentos do caso (título do bloco "Sua cirurgia"). */
  procedimentos: string[];
  /** Nome do hospital/local. */
  local: string;
  /** Equipe de anestesia (omite a célula quando ausente). */
  equipeAnestesia?: string | null;
};

/** Tinta da capa: sempre clara sobre o overlay navy fixo, igual ao web. */
const COVER_INK = "#F4F1E8";
const COVER_ACCENT = "#C9A96E";

function formatarDataBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso;
}

/** Dias corridos até a cirurgia (espelha differenceInCalendarDays do web). */
function diasAteCirurgia(iso: string): number {
  const [ano, mes, dia] = iso.split("-").map(Number);
  if (!ano || !mes || !dia) return 0;
  const alvo = new Date(ano, mes - 1, dia);
  const hoje = new Date();
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo.getTime() - inicioHoje.getTime()) / 86400000);
}

/** Texto de contagem regressiva (espelha contagemRegressiva do web). */
function contagemRegressiva(dias: number): string {
  if (dias < 0) return "Procedimento realizado";
  if (dias === 0) return "É hoje";
  if (dias === 1) return "É amanhã";
  return `Faltam ${dias} dias`;
}

/**
 * Situação financeira passada à prévia (subconjunto de `PagamentoPaciente`).
 * Omitido → a linha de honorários não é exibida (compatível com chamadas
 * antigas sem dado de pagamento).
 */
export type PreviewPagamento = {
  valorPendente: number;
  dataPagamentoPendente: string | null;
  quitado: boolean;
};

/**
 * Situação de contrato/termo passada à prévia para o bloco "Agora"/"Tudo certo".
 * Subconjunto da `PaginaPaciente` já resolvida — espelha `AgoraConfirmacoes` da
 * prévia web. Omitido → o bloco de confirmações não é exibido (compatível com
 * chamadas antigas, p.ex. a prévia do editor de conteúdo).
 */
export type PreviewConfirmacoes = {
  contratoStatus: PaginaPacienteContratoStatus;
  contratoPrazo: string | null;
  contratoAssinadoEm: string | null;
  termoStatus: PaginaPacienteTermoStatus;
  termoPrazo: string | null;
  termoAssinadoEm: string | null;
};

/**
 * Renderizadores compartilhados da página da paciente. São a ÚNICA fonte de
 * renderização das seções públicas no app móvel — usados tanto pela prévia
 * read-only na tela da paciente quanto pela pré-visualização do editor de
 * conteúdo. Reutilizar o mesmo componente garante que não haja desvio visual
 * entre o que a equipe vê na prévia e o que a paciente recebe.
 *
 * Deve ser montado dentro de um <ThemeScope> carregando o `tema` da paciente,
 * para que os componentes (que leem useColors) resolvam ao registro claro/escuro
 * escolhido pela paciente — não ao tema do Console.
 */
export function PaginaPreview({
  secoes,
  identidade,
  dados,
  pagamento,
  confirmacoes,
  passoAtual,
}: {
  secoes: SecaoConteudo[];
  /**
   * Cabeçalho de identidade da médica (foto/logo, clínica, nome, CRM/RQE).
   * Espelha o mesmo bloco da prévia web (`PreviaPaginaPaciente`). Omitido →
   * a prévia mostra só as seções (compatível com chamadas antigas).
   */
  identidade?: IdentidadeMedica;
  /**
   * Dados da cirurgia para a capa + grid de fatos no topo da prévia. Omitido →
   * a prévia mostra só identidade + seções (compatível com chamadas antigas).
   */
  dados?: PreviewDados;
  /**
   * Situação financeira para a linha de honorários ("Agora"). Espelha
   * `AgoraConfirmacoes` da prévia web e da página pública. Omitido → linha
   * não exibida (compatível com chamadas sem dado de pagamento).
   */
  pagamento?: PreviewPagamento;
  /**
   * Situação de contrato/termo para o bloco "Agora"/"Tudo certo", entre a médica
   * e "Sua cirurgia" — espelha `AgoraConfirmacoes` da prévia web. Quando presente,
   * a linha de honorários é mostrada DENTRO desse bloco (usando `pagamento`), e o
   * bloco de honorários do rodapé é suprimido para não duplicar o pagamento.
   * Omitido → o bloco de confirmações não aparece (compatível com a prévia do
   * editor de conteúdo, que mantém os honorários no rodapé).
   */
  confirmacoes?: PreviewConfirmacoes;
  /**
   * Índice da etapa atual da jornada (5 nós) para destacar a linha do tempo,
   * como na página pública. Quando indefinido, a linha do tempo não destaca
   * nenhuma etapa (usado pela prévia do editor de conteúdo).
   */
  passoAtual?: number;
}) {
  const colors = useColors();
  return (
    <View testID="pagina-preview" style={{ backgroundColor: colors.background }}>
      {dados ? <PreviewCapa dados={dados} /> : null}
      <View style={styles.paginaPreview}>
        {identidade ? <IdentidadeHeader identidade={identidade} /> : null}
        {confirmacoes ? (
          <PreviewAgora confirmacoes={confirmacoes} pagamento={pagamento} dados={dados} />
        ) : null}
        {dados ? <PreviewSuaCirurgia dados={dados} /> : null}
        {secoes.map((secao) => (
          <PreviewSecao key={secao.id} secao={secao} passoAtual={passoAtual} />
        ))}
        {/* Honorários no rodapé só quando NÃO há bloco "Agora" (senão o pagamento
            já aparece nas confirmações, espelhando a página pública/prévia web). */}
        {pagamento != null && !confirmacoes ? <PreviewHonorarios pagamento={pagamento} /> : null}
      </View>
    </View>
  );
}

/**
 * Capa editorial: foto do centro cirúrgico sob overlay navy fixo, com a
 * contagem regressiva. Espelha o cabeçalho da página pública e da prévia web.
 * A tinta é sempre clara (overlay escuro), independente do tema da paciente.
 */
function PreviewCapa({ dados }: { dados: PreviewDados }) {
  const dias = diasAteCirurgia(dados.dataCirurgia);
  const dataFmt = formatarDataBR(dados.dataCirurgia);
  return (
    <ImageBackground source={coverPhoto} style={styles.capa} resizeMode="cover">
      <View style={styles.capaOverlay} />
      <View style={styles.capaConteudo}>
        <Text style={styles.capaSaudacao}>
          OLÁ, {dados.primeiroNome.toUpperCase()}
          {dias > 1 ? " — FALTAM" : ""}
        </Text>
        <View style={styles.capaContagemRow}>
          {dias > 1 ? (
            <>
              <Text style={styles.capaNumero}>{dias}</Text>
              <Text style={styles.capaNumeroLabel}>dias</Text>
            </>
          ) : (
            <Text style={styles.capaContagemTexto}>{contagemRegressiva(dias)}</Text>
          )}
        </View>
        <Text style={styles.capaRodape}>
          para a sua cirurgia · {dataFmt} · {dados.horario}
        </Text>
      </View>
    </ImageBackground>
  );
}

/**
 * Bloco "Sua cirurgia": eyebrow "Sua cirurgia" + grid de fatos, idêntico ao da
 * página pública. O(s) PROCEDIMENTO(S) abre(m) o grid ocupando a linha inteira
 * (antes ficavam num título grande separado logo acima da tabela, o que confundia
 * — parecia duas informações distintas). Agora tudo vive na mesma tabela:
 * PROCEDIMENTO(S) / DATA / HORÁRIO / LOCAL / ANESTESIA. A célula de anestesia só
 * aparece quando há equipe. Some quando não há procedimentos.
 */
function PreviewSuaCirurgia({ dados }: { dados: PreviewDados }) {
  const colors = useColors();
  const procedimentos = dados.procedimentos.filter((p) => p.trim().length > 0);
  if (procedimentos.length === 0) return null;
  const dataFmt = formatarDataBR(dados.dataCirurgia);
  const celulas: { rotulo: string; valor: string }[] = [
    { rotulo: "Data", valor: dataFmt },
    { rotulo: "Horário", valor: dados.horario },
    { rotulo: "Local", valor: dados.local },
  ];
  if (dados.equipeAnestesia && dados.equipeAnestesia.trim().length > 0) {
    celulas.push({ rotulo: "Anestesia", valor: dados.equipeAnestesia });
  }
  return (
    <View style={styles.previewSecao}>
      <Text style={[styles.previewKicker, { color: colors.primary }]}>SUA CIRURGIA</Text>
      <View style={[styles.factsGrid, { borderColor: "rgba(201,169,110,0.3)" }]}>
        <View
          style={[
            styles.factCellFull,
            { backgroundColor: colors.card, borderColor: "rgba(201,169,110,0.3)" },
          ]}
        >
          <Text style={[styles.factLabel, { color: colors.foreground }]}>
            {procedimentos.length > 1 ? "PROCEDIMENTOS" : "PROCEDIMENTO"}
          </Text>
          <Text style={[styles.factValueProc, { color: colors.foreground }]}>
            {procedimentos.join(" · ")}
          </Text>
        </View>
        {celulas.map((c) => (
          <View
            key={c.rotulo}
            style={[styles.factCell, { backgroundColor: colors.card, borderColor: "rgba(201,169,110,0.3)" }]}
          >
            <Text style={[styles.factLabel, { color: colors.foreground }]}>{c.rotulo.toUpperCase()}</Text>
            <Text style={[styles.factValue, { color: colors.foreground }]}>{c.valor}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Cabeçalho de identidade da médica — espelha o bloco da prévia/página web
 * (`LogoClinicaLockup` + `MedicaIdentidade` em `patient-page-sections.tsx`):
 * lockup do logo + nome da clínica em cima, foto + "Sua médica" + CRM/RQE +
 * crédito Camada embaixo. Os fallbacks são a fonte única do web: logo → emblema
 * "K"; foto → iniciais (`iniciaisMedica`). Renderiza com `useColors()`, então
 * segue o registro (claro/escuro) da paciente herdado do `ThemeScope`.
 */
function IdentidadeHeader({ identidade }: { identidade: IdentidadeMedica }) {
  const colors = useColors();
  const { medica, crm, rqe, clinica, medicoFotoUrl, medicoLogoUrl } = identidade;
  const accentFio = "rgba(201,169,110,0.4)";
  return (
    <View testID="identidade-header" style={styles.identidade}>
      {/* Lockup: logo (ou emblema "K") + nome da clínica */}
      <View style={styles.lockupRow}>
        <ClinicaLogo logoUrl={medicoLogoUrl} />
        <View style={styles.lockupTexto}>
          {clinica ? (
            <Text style={[styles.clinicaNome, { color: colors.foreground }]}>{clinica}</Text>
          ) : null}
          <Text style={[styles.lockupSub, { color: colors.mutedForeground }]}>
            Acompanhamento pré-operatório
          </Text>
        </View>
      </View>

      <View style={[styles.identidadeFio, { backgroundColor: accentFio }]} />

      {/* Bloco "Sua médica": foto (ou iniciais) + nome + CRM/RQE + crédito Camada */}
      <View style={styles.medicaRow}>
        <MedicaFoto fotoUrl={medicoFotoUrl} medica={medica} />
        <View style={styles.medicaTexto}>
          <Text style={[styles.medicaKicker, { color: colors.primary }]}>SUA MÉDICA</Text>
          <Text style={[styles.medicaNome, { color: colors.foreground }]}>{medica}</Text>
          {crm && rqe ? (
            <Text style={[styles.medicaCred, { color: colors.mutedForeground }]}>
              CRM {crm} · RQE {rqe}
            </Text>
          ) : null}
          <View style={styles.camadaRow}>
            <SeloCamada accent={colors.primary} texto={colors.foreground} />
            <Text style={[styles.camadaCred, { color: colors.primary }]}>
              MÉDICA-PARCEIRA · CAMADA
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Logo da clínica; cai no emblema "K" quando não há logo ou a imagem falha. */
function ClinicaLogo({ logoUrl }: { logoUrl: string | null }) {
  const colors = useColors();
  const [falhou, setFalhou] = React.useState(false);
  const mostrar = Boolean(logoUrl) && !falhou;
  if (mostrar) {
    return (
      <Image
        source={{ uri: logoUrl! }}
        style={styles.logoImg}
        resizeMode="contain"
        onError={() => setFalhou(true)}
      />
    );
  }
  return (
    <View style={[styles.emblema, { borderColor: colors.primary }]}>
      <Text style={[styles.emblemaTexto, { color: colors.foreground }]}>K</Text>
    </View>
  );
}

/** Foto da médica; cai nas iniciais quando não há foto ou a imagem falha. */
function MedicaFoto({ fotoUrl, medica }: { fotoUrl: string | null; medica: string }) {
  const colors = useColors();
  const [falhou, setFalhou] = React.useState(false);
  const mostrar = Boolean(fotoUrl) && !falhou;
  return (
    <View style={[styles.fotoBox, { borderColor: "rgba(201,169,110,0.4)", backgroundColor: colors.card }]}>
      {mostrar ? (
        <Image
          source={{ uri: fotoUrl! }}
          style={styles.fotoImg}
          resizeMode="cover"
          onError={() => setFalhou(true)}
        />
      ) : (
        <Text style={[styles.fotoIniciais, { color: colors.primary }]}>{iniciaisMedica(medica)}</Text>
      )}
    </View>
  );
}

/** Selo "C" da Camada — crédito discreto, espelha o `SeloC` da página web. */
function SeloCamada({ accent, texto }: { accent: string; texto: string }) {
  return (
    <Svg width={28} height={28} viewBox="0 0 100 100">
      <Circle cx={50} cy={50} r={46} fill="none" stroke={accent} strokeWidth={2.4} />
      <Circle cx={50} cy={50} r={39.5} fill="none" stroke={accent} strokeWidth={1} opacity={0.6} />
      <SvgText x={50} y={61} textAnchor="middle" fontFamily={fonts.serif} fontSize={46} fill={texto}>
        C
      </SvgText>
      <SvgRect x={40.5} y={70} width={9} height={2.3} fill={accent} />
      <SvgRect x={40.5} y={75} width={15} height={2.3} fill={accent} />
    </Svg>
  );
}

function PreviewSecao({ secao, passoAtual }: { secao: SecaoConteudo; passoAtual?: number }) {
  switch (secao.tipo) {
    case "linha_do_tempo":
      return <PreviewTimeline secao={secao} passoAtual={passoAtual} />;
    case "preparo":
      return <PreviewPreparo secao={secao} />;
    case "suspensao_medicamentos":
      return <PreviewSuspensaoMedicamentos secao={secao} />;
    case "preparo_pele":
      return <PreviewPreparoPele secao={secao} />;
    case "receituario_posop":
      return <PreviewReceituario secao={secao} />;
    case "lista":
      return <PreviewLista secao={secao} icon="check-circle" />;
    case "documentos":
      return <PreviewDocumentos secao={secao} />;
    case "contatos":
      return <PreviewContatos secao={secao} />;
    case "politica":
    case "texto":
    default:
      return <PreviewTexto secao={secao} />;
  }
}

function PreviewHeading({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.previewHeadingRow}>
      <Text style={[styles.previewHeading, { color: colors.primary }]}>{children}</Text>
      <View style={[styles.previewHeadingLine, { backgroundColor: "rgba(201,169,110,0.25)" }]} />
    </View>
  );
}

function PreviewTimeline({ secao, passoAtual }: { secao: SecaoConteudo; passoAtual?: number }) {
  const colors = useColors();
  const etapas = secao.etapas ?? [];
  // Sem `passoAtual` (prévia do editor) nenhuma etapa é destacada — todas em -1.
  const passo = passoAtual ?? -1;
  return (
    <View style={styles.previewSecao}>
      <PreviewHeading>{secao.titulo}</PreviewHeading>
      <View style={styles.previewTimeline}>
        <View style={[styles.previewSpine, { backgroundColor: "rgba(201,169,110,0.25)" }]} />
        {etapas.map((etapa, idx) => {
          const passado = passo >= 0 && idx < passo;
          const atual = passo >= 0 && idx === passo;
          const futuro = passo >= 0 && idx > passo;
          return (
            <View
              key={idx}
              style={[styles.previewTimelineRow, futuro ? styles.previewTimelineFuturo : null]}
            >
              {atual ? (
                <View style={[styles.previewTimelineDotAtual, { backgroundColor: colors.primary }]}>
                  <View
                    style={[styles.previewTimelineDotAtualInner, { backgroundColor: colors.background }]}
                  />
                </View>
              ) : passado ? (
                <View style={[styles.previewTimelineDotFeito, { backgroundColor: colors.primary }]}>
                  <Feather name="check" size={9} color={colors.primaryForeground} />
                </View>
              ) : (
                <View style={[styles.previewTimelineDot, { backgroundColor: colors.primary }]} />
              )}
              <View style={styles.previewTimelineBody}>
                <View style={styles.previewTimelineMeta}>
                  <Text style={[styles.previewKicker, { color: colors.primary }]}>{etapa.quando}</Text>
                  {etapa.data ? (
                    <Text style={[styles.previewDate, { color: colors.mutedForeground }]}>{etapa.data}</Text>
                  ) : null}
                  {atual ? (
                    <View style={[styles.previewEtapaBadge, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.previewEtapaBadgeText, { color: colors.primaryForeground }]}>
                        ETAPA ATUAL
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.previewItemTitle, { color: colors.foreground }]}>{etapa.titulo}</Text>
                <Text style={[styles.previewBody, { color: colors.bodyText }]}>{etapa.descricao}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Seção "Exames Pré-Operatórios" (`tipo: "preparo"`) — bloco recolhível. Ao abrir
 * mostra a descrição, a lista de exames, o aviso de WhatsApp e o botão de baixar
 * o pedido de exames (PDF). Espelha o accordion `Preparo` da web. Recolhido por
 * padrão para não poluir a tela.
 */
function PreviewPreparo({ secao }: { secao: SecaoConteudo }) {
  const colors = useColors();
  const [aberto, setAberto] = React.useState(false);
  const itens = secao.itens ?? [];
  return (
    <View style={styles.previewSecao}>
      <Pressable
        onPress={() => setAberto((v) => !v)}
        style={[styles.previewPreparoHead, { backgroundColor: colors.card }]}
      >
        <View style={styles.previewHeadingRow}>
          <Feather name="file-text" size={16} color={colors.primary} />
          <Text style={[styles.previewHeading, { color: colors.primary }]}>{secao.titulo}</Text>
        </View>
        <Feather name={aberto ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
      </Pressable>
      {aberto ? (
        <View style={[styles.previewPreparoBody, { backgroundColor: colors.card }]}>
          {secao.corpo ? (
            <Text style={[styles.previewBody, { color: colors.bodyText }]}>{secao.corpo}</Text>
          ) : null}
          <View style={styles.previewList}>
            {itens.map((item, idx) => (
              <View key={idx} style={styles.previewListRow}>
                <View style={[styles.previewCheckbox, { borderColor: colors.borderStrong }]} />
                <Text style={[styles.previewBody, { color: colors.bodyText, flex: 1 }]}>{item}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.previewPreparoNota, { borderColor: colors.primary }]}>
            <Feather name="message-circle" size={13} color={colors.primary} />
            <Text style={[styles.previewBody, { color: colors.bodyText, flex: 1 }]}>
              Quando os resultados estiverem prontos, envie-os para nós pelo WhatsApp para
              anexarmos ao seu prontuário antes da cirurgia.
            </Text>
          </View>
          <View style={[styles.previewPreparoBtn, { borderColor: colors.primary }]}>
            <Feather name="download" size={14} color={colors.primary} />
            <Text style={[styles.previewKicker, { color: colors.primary }]}>
              BAIXAR PEDIDO DE EXAMES (PDF)
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Seção "Preparo da Pele" (`tipo: "preparo_pele"`) — bloco recolhível com a
 * descrição, os produtos numerados (nome, instrução, início, tag) e o botão de
 * baixar a receita (estático na prévia). Espelha `PreparoPele` da web.
 */
function PreviewPreparoPele({ secao }: { secao: SecaoConteudo }) {
  const colors = useColors();
  const [aberto, setAberto] = React.useState(false);
  const produtos = secao.produtos ?? [];
  return (
    <View style={styles.previewSecao}>
      <Pressable
        onPress={() => setAberto((v) => !v)}
        style={[styles.previewPreparoHead, { backgroundColor: colors.card }]}
      >
        <View style={styles.previewHeadingRow}>
          <Feather name="file-text" size={16} color={colors.primary} />
          <Text style={[styles.previewHeading, { color: colors.primary }]}>{secao.titulo}</Text>
        </View>
        <Feather name={aberto ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
      </Pressable>
      {aberto ? (
        <View style={[styles.previewPreparoBody, { backgroundColor: colors.card }]}>
          {secao.corpo ? (
            <Text style={[styles.previewBody, { color: colors.bodyText }]}>{secao.corpo}</Text>
          ) : null}
          {produtos.map((produto, idx) => (
            <View key={idx} style={styles.previewPreparoItem}>
              <Text style={[styles.previewItemTitle, { color: colors.foreground }]}>
                {idx + 1}. {produto.nome}
              </Text>
              {produto.instrucao ? (
                <Text style={[styles.previewBody, { color: colors.bodyText }]}>{produto.instrucao}</Text>
              ) : null}
              {produto.inicio ? (
                <Text style={[styles.previewBody, { color: colors.bodyText }]}>{produto.inicio}</Text>
              ) : null}
              {produto.tag ? (
                <Text style={[styles.previewKicker, { color: colors.primary }]}>{produto.tag}</Text>
              ) : null}
            </View>
          ))}
          <View style={[styles.previewPreparoBtn, { borderColor: colors.primary }]}>
            <Feather name="download" size={14} color={colors.primary} />
            <Text style={[styles.previewKicker, { color: colors.primary }]}>
              BAIXAR RECEITA PREPARO DA PELE (PDF)
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Seção "Receituário Pós-Operatório" (`tipo: "receituario_posop"`) — bloco
 * recolhível com a descrição, a lista de medicações (nome + instrução + via em
 * itálico), o aviso e o botão de baixar o receituário. Espelha `Receituario` da web.
 */
function PreviewReceituario({ secao }: { secao: SecaoConteudo }) {
  const colors = useColors();
  const [aberto, setAberto] = React.useState(false);
  const medicacoes = secao.medicacoes ?? [];
  return (
    <View style={styles.previewSecao}>
      <Pressable
        onPress={() => setAberto((v) => !v)}
        style={[styles.previewPreparoHead, { backgroundColor: colors.card }]}
      >
        <View style={styles.previewHeadingRow}>
          <Feather name="file-text" size={16} color={colors.primary} />
          <Text style={[styles.previewHeading, { color: colors.primary }]}>{secao.titulo}</Text>
        </View>
        <Feather name={aberto ? "chevron-up" : "chevron-down"} size={18} color={colors.primary} />
      </Pressable>
      {aberto ? (
        <View style={[styles.previewPreparoBody, { backgroundColor: colors.card }]}>
          {secao.corpo ? (
            <Text style={[styles.previewBody, { color: colors.bodyText }]}>{secao.corpo}</Text>
          ) : null}
          {medicacoes.map((med, idx) => (
            <View key={idx} style={styles.previewPreparoItem}>
              <Text style={[styles.previewItemTitle, { color: colors.foreground }]}>{med.nome}</Text>
              <Text style={[styles.previewBody, { color: colors.bodyText }]}>
                {med.instrucao}
                {med.via ? ` (${med.via})` : ""}
              </Text>
            </View>
          ))}
          {secao.aviso ? (
            <View style={[styles.previewPreparoNota, { borderColor: colors.primary }]}>
              <Feather name="sun" size={13} color={colors.primary} />
              <Text style={[styles.previewBody, { color: colors.bodyText, flex: 1 }]}>{secao.aviso}</Text>
            </View>
          ) : null}
          <View style={[styles.previewPreparoBtn, { borderColor: colors.primary }]}>
            <Feather name="download" size={14} color={colors.primary} />
            <Text style={[styles.previewKicker, { color: colors.primary }]}>
              BAIXAR RECEITUÁRIO PÓS-OPERATÓRIO (PDF)
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Seção "Suspensão de Medicamentos" (`tipo: "suspensao_medicamentos"`) — linha
 * do tempo agrupada por janela. Espelha `SuspensaoMedicamentos` da web: rótulo +
 * data-limite ("ATÉ dd/mm") por janela, lista de medicamentos (marca em destaque
 * + princípio ativo esmaecido), o callout de aviso e — quando há PDF anexado — o
 * botão de download (estático na prévia, como o de exames).
 */
function PreviewSuspensaoMedicamentos({ secao }: { secao: SecaoConteudo }) {
  const colors = useColors();
  const grupos = secao.grupos ?? [];
  return (
    <View style={styles.previewSecao}>
      <PreviewHeading>{secao.titulo}</PreviewHeading>
      {secao.corpo ? (
        <Text style={[styles.previewBody, { color: colors.bodyText }]}>{secao.corpo}</Text>
      ) : null}
      <View style={styles.previewTimeline}>
        <View style={[styles.previewSpine, { backgroundColor: "rgba(201,169,110,0.25)" }]} />
        {grupos.map((grupo, idx) => (
          <View key={idx} style={styles.previewTimelineRow}>
            <View style={[styles.previewTimelineDot, { backgroundColor: colors.primary }]} />
            <View style={styles.previewTimelineBody}>
              <View style={styles.previewTimelineMeta}>
                <Text style={[styles.previewKicker, { color: colors.primary }]}>{grupo.quando}</Text>
                {grupo.data ? (
                  <Text style={[styles.previewDate, { color: colors.mutedForeground }]}>
                    até {grupo.data}
                  </Text>
                ) : null}
              </View>
              {(grupo.medicamentos ?? []).map((m, i) => (
                <Text key={i} style={[styles.previewBody, { color: colors.bodyText }]}>
                  <Text style={{ fontWeight: "600", color: colors.foreground }}>{m.marca}</Text>
                  {m.principio ? (
                    <Text style={{ color: colors.mutedForeground }}> ({m.principio})</Text>
                  ) : null}
                </Text>
              ))}
            </View>
          </View>
        ))}
      </View>
      {secao.aviso ? (
        <View style={[styles.previewPreparoNota, { borderColor: colors.primary }]}>
          <Feather name="alert-triangle" size={13} color={colors.primary} />
          <Text style={[styles.previewBody, { color: colors.bodyText, flex: 1 }]}>{secao.aviso}</Text>
        </View>
      ) : null}
      {secao.arquivo ? (
        <View style={[styles.previewPreparoBtn, { borderColor: colors.primary }]}>
          <Feather name="download" size={14} color={colors.primary} />
          <Text style={[styles.previewKicker, { color: colors.primary }]}>
            BAIXAR LISTA COMPLETA (PDF)
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function PreviewLista({
  secao,
  icon,
}: {
  secao: SecaoConteudo;
  icon: React.ComponentProps<typeof Feather>["name"];
}) {
  const colors = useColors();
  const itens = secao.itens ?? [];
  return (
    <View style={styles.previewSecao}>
      <View style={styles.previewHeadingRow}>
        <Feather name={icon} size={16} color={colors.primary} />
        <Text style={[styles.previewHeading, { color: colors.primary }]}>{secao.titulo}</Text>
      </View>
      <View style={styles.previewList}>
        {itens.map((item, idx) => (
          <View key={idx} style={styles.previewListRow}>
            <View style={[styles.previewCheckbox, { borderColor: colors.borderStrong }]} />
            <Text style={[styles.previewBody, { color: colors.bodyText, flex: 1 }]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PreviewDocumentos({ secao }: { secao: SecaoConteudo }) {
  const colors = useColors();
  const itens = secao.itens ?? [];
  return (
    <View style={styles.previewSecao}>
      <View style={styles.previewHeadingRow}>
        <Feather name="file-text" size={16} color={colors.primary} />
        <Text style={[styles.previewHeading, { color: colors.primary }]}>{secao.titulo}</Text>
      </View>
      {secao.corpo ? (
        <Text style={[styles.previewBody, { color: colors.bodyText }]}>{secao.corpo}</Text>
      ) : null}
      <View style={[styles.previewDocsBox, { backgroundColor: colors.card }]}>
        <Text style={[styles.previewKicker, { color: colors.primary }]}>LEVAR NO DIA</Text>
        {itens.map((item, idx) => (
          <View key={idx} style={[styles.previewDocRow, { borderBottomColor: "rgba(151,163,180,0.12)" }]}>
            <View style={[styles.previewCheckbox, { borderColor: colors.borderStrong }]} />
            <Text style={[styles.previewBody, { color: colors.bodyText, flex: 1 }]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function PreviewContatos({ secao }: { secao: SecaoConteudo }) {
  const colors = useColors();
  const contatos = secao.contatos ?? [];
  return (
    <View style={styles.previewSecao}>
      <PreviewHeading>{secao.titulo}</PreviewHeading>
      <View style={styles.previewContatos}>
        {contatos.map((contato, idx) => {
          const ehTelefone = /\d{4}/.test(contato.valor) && !contato.valor.includes("@");
          const linha = (
            <View style={[styles.previewContatoRow, { borderColor: colors.borderStrong }]}>
              <Text style={[styles.previewKicker, { color: colors.primary }]}>{contato.rotulo}</Text>
              <Text style={[styles.previewContatoValor, { color: colors.foreground }]}>{contato.valor}</Text>
            </View>
          );
          if (ehTelefone) {
            const digitos = contato.valor.replace(/\D/g, "");
            return (
              <Pressable key={idx} onPress={() => Linking.openURL(`tel:${digitos}`)}>
                {linha}
              </Pressable>
            );
          }
          return <View key={idx}>{linha}</View>;
        })}
      </View>
    </View>
  );
}

function PreviewTexto({ secao }: { secao: SecaoConteudo }) {
  const colors = useColors();
  return (
    <View style={styles.previewSecao}>
      <PreviewHeading>{secao.titulo}</PreviewHeading>
      {secao.corpo ? <Text style={[styles.previewBody, { color: colors.bodyText }]}>{secao.corpo}</Text> : null}
    </View>
  );
}

/**
 * Existe documento (contrato/termo) quando o status é um estado acionável.
 * `null` (sem documento) não gera linha — espelha `temDocumento` da prévia web,
 * que recebe `null` nesses casos e por isso omite a linha. Nunca inventa estado.
 */
function temDocumento(status?: string | null): boolean {
  return status != null && status !== "ausente";
}

/** Há texto útil (não nulo/indefinido e não só espaços)? Espelha `temTexto` da prévia web. */
function temTexto(valor?: string | null): boolean {
  return typeof valor === "string" && valor.trim() !== "";
}

/** Linha confirmada (✓) do bloco "Agora". */
function LinhaConfirmada({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.agoraLinha}>
      <Feather name="check-circle" size={16} color={colors.primary} style={styles.agoraIcone} />
      <Text style={[styles.agoraTexto, { color: colors.foreground }]}>{children}</Text>
    </View>
  );
}

/** Linha pendente (○) do bloco "Agora". */
function LinhaPendente({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.agoraLinha}>
      <View style={[styles.agoraCirculo, { borderColor: colors.primary }]} />
      <Text style={[styles.agoraTexto, { color: colors.foreground, opacity: 0.9 }]}>{children}</Text>
    </View>
  );
}

/**
 * Bloco "Agora"/"Tudo certo" — espelha `AgoraConfirmacoes` (+ cabeçalho) da
 * prévia web e da página pública. As duas primeiras linhas são sempre
 * verdadeiras (data/hora e local definidos). Contrato, termo e honorários só
 * aparecem com dado real (nunca inventa estado): contrato/termo quando há um
 * status acionável; honorários quando `pagamento` é informado. Quando tudo está
 * assinado e quitado, o cabeçalho vira "Tudo certo". Renderiza no tema da
 * paciente herdado do `ThemeScope` pai.
 */
function PreviewAgora({
  confirmacoes,
  pagamento,
  dados,
}: {
  confirmacoes: PreviewConfirmacoes;
  pagamento?: PreviewPagamento;
  dados?: PreviewDados;
}) {
  const colors = useColors();
  const { contratoStatus, contratoPrazo, contratoAssinadoEm, termoStatus, termoPrazo, termoAssinadoEm } =
    confirmacoes;
  const contratoAssinado = contratoStatus === "assinado";
  const termoAssinado = termoStatus === "assinado";
  const temData = temTexto(dados?.dataCirurgia);
  const temHorario = temTexto(dados?.horario);
  const temLocal = temTexto(dados?.local);
  // Mesma régua da página pública: "tudo certo" só quando contrato e termo estão
  // assinados e os honorários quitados. Sem esses dados o bloco fica em "Agora".
  const tudoCerto = contratoAssinado && termoAssinado && pagamento?.quitado === true;
  const venc = pagamento?.dataPagamentoPendente ? formatarDataBR(pagamento.dataPagamentoPendente) : null;

  return (
    <View testID="preview-agora" style={styles.agora}>
      {tudoCerto ? (
        <View style={{ gap: 8 }}>
          <Text style={[styles.previewKicker, { color: colors.primary }]}>TUDO CERTO</Text>
          <Text style={[styles.agoraTituloCerto, { color: colors.primary }]}>
            Tudo certo para a sua cirurgia
          </Text>
          <Text style={[styles.previewBody, { color: colors.bodyText }]}>
            Está tudo confirmado. Abaixo você encontra os detalhes, o preparo e seus documentos.
          </Text>
        </View>
      ) : (
        <View style={styles.previewHeadingRow}>
          <Text style={[styles.agoraTitulo, { color: colors.primary }]}>Agora</Text>
          <View style={[styles.previewHeadingLine, { backgroundColor: "rgba(201,169,110,0.2)" }]} />
        </View>
      )}

      <View style={styles.agoraLista}>
        {temData ? (
          <LinhaConfirmada>
            {temHorario ? "Data e horário confirmados" : "Data confirmada"}
          </LinhaConfirmada>
        ) : null}
        {temLocal ? <LinhaConfirmada>Local da cirurgia definido</LinhaConfirmada> : null}

        {contratoAssinado ? (
          <LinhaConfirmada>
            Contrato assinado{contratoAssinadoEm ? ` em ${formatarDataBR(contratoAssinadoEm)}` : ""}
          </LinhaConfirmada>
        ) : temDocumento(contratoStatus) ? (
          <LinhaPendente>
            Contrato · {contratoPrazo ? `assinar até ${formatarDataBR(contratoPrazo)}` : "aguardando assinatura"}
          </LinhaPendente>
        ) : null}

        {termoAssinado ? (
          <LinhaConfirmada>
            Termo de consentimento assinado{termoAssinadoEm ? ` em ${formatarDataBR(termoAssinadoEm)}` : ""}
          </LinhaConfirmada>
        ) : temDocumento(termoStatus) ? (
          <LinhaPendente>
            Termo de consentimento ·{" "}
            {termoPrazo ? `assinar até ${formatarDataBR(termoPrazo)}` : "aguardando assinatura"}
          </LinhaPendente>
        ) : null}

        {pagamento != null ? (
          pagamento.quitado ? (
            <LinhaConfirmada>Honorários · pagamento confirmado</LinhaConfirmada>
          ) : (
            <LinhaPendente>
              Honorários · {venc ? `pagar até ${venc}` : "pagamento pendente"}
            </LinhaPendente>
          )
        ) : null}
      </View>
    </View>
  );
}

/**
 * Linha de honorários ("Agora") — espelha `AgoraConfirmacoes` da prévia web e
 * da página pública. Pendente: "Honorários · pagar até DD/MM/YYYY". Quitado:
 * "Honorários · pagamento confirmado". Renderiza no tema da paciente herdado
 * do `ThemeScope` pai.
 */
function PreviewHonorarios({ pagamento }: { pagamento: PreviewPagamento }) {
  const colors = useColors();
  const vencimento = pagamento.dataPagamentoPendente
    ? formatarDataBR(pagamento.dataPagamentoPendente)
    : null;
  const texto = pagamento.quitado
    ? "Honorários · pagamento confirmado"
    : vencimento
      ? `Honorários · pagar até ${vencimento}`
      : "Honorários · pagamento pendente";
  return (
    <View testID="preview-honorarios" style={styles.previewSecao}>
      <View style={[styles.honorariosRow, { borderColor: "rgba(201,169,110,0.3)" }]}>
        <Text style={[styles.honorariosTexto, { color: colors.foreground }]}>{texto}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  paginaPreview: { padding: 16, gap: 20 },

  identidade: { gap: 18 },
  lockupRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  logoImg: { height: 36, width: 56 },
  emblema: {
    width: 36,
    height: 36,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emblemaTexto: { fontFamily: fonts.serif, fontSize: 16 },
  lockupTexto: { flex: 1, gap: 2 },
  clinicaNome: { fontFamily: fonts.serif, fontSize: 18 },
  lockupSub: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.4 },
  identidadeFio: { height: 1 },
  medicaRow: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  fotoBox: {
    width: 68,
    height: 88,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  fotoImg: { width: "100%", height: "100%" },
  fotoIniciais: { fontFamily: fonts.serif, fontSize: 24 },
  medicaTexto: { flex: 1, gap: 4 },
  medicaKicker: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5 },
  medicaNome: { fontFamily: fonts.serif, fontSize: 20 },
  medicaCred: { fontFamily: fonts.mono, fontSize: 10 },
  camadaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  camadaCred: { fontFamily: fonts.mono, fontSize: 9, letterSpacing: 0.8 },

  capa: { paddingTop: 36, paddingBottom: 40, paddingHorizontal: 24 },
  capaOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,23,41,0.88)" },
  capaConteudo: { gap: 0 },
  capaSaudacao: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 2, color: COVER_INK, opacity: 0.7 },
  capaContagemRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
    marginTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COVER_ACCENT,
    alignSelf: "flex-start",
  },
  capaNumero: { fontFamily: fonts.mono, fontSize: 56, lineHeight: 58, color: COVER_INK },
  capaNumeroLabel: { fontFamily: fonts.serif, fontStyle: "italic", fontSize: 22, color: COVER_INK },
  capaContagemTexto: { fontFamily: fonts.serif, fontStyle: "italic", fontSize: 26, color: COVER_INK },
  capaRodape: { fontFamily: fonts.mono, fontSize: 12, color: COVER_INK, opacity: 0.7, marginTop: 16 },

  factsGrid: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderLeftWidth: 1 },
  factCell: { width: "50%", paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderRightWidth: 1 },
  factCellFull: { width: "100%", paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderRightWidth: 1 },
  factLabel: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.8, opacity: 0.5 },
  factValue: { fontFamily: fonts.mono, fontSize: 15, marginTop: 6 },
  factValueProc: { fontFamily: fonts.serif, fontStyle: "italic", fontSize: 18, lineHeight: 24, marginTop: 6 },

  previewSecao: { gap: 14 },
  previewHeadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  previewHeading: { fontFamily: fonts.serif, fontSize: 22 },
  previewHeadingLine: { flex: 1, height: 1 },
  previewKicker: { fontFamily: fonts.expanded, fontSize: 9, letterSpacing: 1.5 },
  previewDate: { fontFamily: fonts.mono, fontSize: 11 },
  previewItemTitle: { fontFamily: fonts.serif, fontSize: 18 },
  previewBody: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 21 },
  previewTimeline: { paddingLeft: 8 },
  previewSpine: { position: "absolute", left: 3, top: 6, bottom: 6, width: 1 },
  previewTimelineRow: { flexDirection: "row", gap: 16, marginBottom: 22 },
  previewTimelineFuturo: { opacity: 0.55 },
  previewTimelineDot: { width: 8, height: 8, marginTop: 5, marginLeft: -1, transform: [{ rotate: "45deg" }] },
  previewTimelineDotAtual: {
    width: 16,
    height: 16,
    marginTop: 1,
    marginLeft: -5,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "45deg" }],
  },
  previewTimelineDotAtualInner: { width: 5, height: 5 },
  previewTimelineDotFeito: {
    width: 16,
    height: 16,
    marginTop: 1,
    marginLeft: -5,
    alignItems: "center",
    justifyContent: "center",
  },
  previewEtapaBadge: { paddingHorizontal: 6, paddingVertical: 2 },
  previewEtapaBadgeText: { fontFamily: fonts.expanded, fontSize: 8, letterSpacing: 1.2 },
  previewTimelineBody: { flex: 1, gap: 6 },
  previewTimelineMeta: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 12 },
  previewList: { gap: 12 },
  previewListRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  previewCheckbox: { width: 18, height: 18, borderWidth: 1, marginTop: 2 },
  previewDocsBox: { padding: 16, gap: 4 },
  previewDocRow: { flexDirection: "row", gap: 12, alignItems: "flex-start", borderBottomWidth: 1, paddingVertical: 12 },
  previewPreparoHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  previewPreparoBody: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4, gap: 16 },
  previewPreparoItem: { gap: 4 },
  previewPreparoNota: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  previewPreparoBtn: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    alignSelf: "flex-start",
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  previewContatos: { gap: 10 },
  previewContatoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  previewContatoValor: { fontFamily: fonts.mono, fontSize: 13 },

  honorariosRow: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14 },
  honorariosTexto: { fontFamily: fonts.mono, fontSize: 13 },

  agora: { gap: 18 },
  agoraTitulo: { fontFamily: fonts.serif, fontStyle: "italic", fontSize: 22 },
  agoraTituloCerto: { fontFamily: fonts.serif, fontStyle: "italic", fontSize: 22 },
  agoraLista: { gap: 14 },
  agoraLinha: { flexDirection: "row", alignItems: "center", gap: 12 },
  agoraIcone: { marginTop: 0 },
  agoraCirculo: { width: 14, height: 14, borderRadius: 7, borderWidth: 1 },
  agoraTexto: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20, flex: 1 },
});
