import "./_group.css";
import React, { useState } from "react";
import {
  PACIENTE,
  ATIVIDADE,
  LINK_PACIENTE,
  VENDEDORAS,
  VENDEDORA_ATUAL_ID,
  HANDOFF_APROVADO,
  ENTREGA,
  TIMELINE,
  CONTRATO,
  TERMO,
  DOCUMENTOS,
  HISTORICO,
  POSOP,
} from "./_data";
import { PhonePreview } from "./_PhonePreview";
import { Copy, ExternalLink, ChevronDown, Check, FileText, Download, Plus } from "lucide-react";

const SECTIONS = [
  { id: 1, title: "Visão Geral" },
  { id: 2, title: "Link da Paciente" },
  { id: 3, title: "Handoff" },
  { id: 4, title: "Dados da Paciente" },
  { id: 5, title: "Entrega e WhatsApp" },
  { id: 6, title: "Acompanhamento" },
  { id: 7, title: "Contrato Autentique" },
  { id: 8, title: "Termo TCLE" },
  { id: 9, title: "Arquivos e Histórico" },
];

export function Sidebar() {
  const [activeSection, setActiveSection] = useState(1);
  const [previewOpen, setPreviewOpen] = useState(true);

  return (
    <div className="min-h-screen bg-background text-foreground font-['Archivo'] font-light flex flex-col">
      {/* Slim Top Header */}
      <header className="h-16 border-b border-border flex items-center px-6 shrink-0 bg-background/95 backdrop-blur z-20 sticky top-0">
        <div className="flex items-center gap-6 w-64 shrink-0">
          <div className="w-8 h-8 border border-accent flex items-center justify-center font-['Spectral'] text-accent text-lg">
            K
          </div>
          <div className="font-['Archivo_Expanded'] text-[10px] tracking-widest uppercase text-muted-foreground">
            Console KCL
          </div>
        </div>
        
        <div className="flex-1 flex items-center gap-6 border-l border-border pl-6">
          <h1 className="font-['Spectral'] text-xl">{PACIENTE.nome}</h1>
          <div className="flex items-center gap-3 font-['IBM_Plex_Mono'] text-xs text-muted-foreground">
            <span>{PACIENTE.dataCirurgia}</span>
            <span>·</span>
            <span>{PACIENTE.horario}</span>
            <span>·</span>
            <span>Faltam {PACIENTE.diasRestantes} dias</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setPreviewOpen(!previewOpen)}
            className="flex items-center gap-2 text-xs font-['Archivo_Expanded'] uppercase tracking-widest text-accent hover:text-foreground transition-colors"
          >
            {previewOpen ? "Ocultar Prévia" : "Ver Prévia"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Persistent Left Nav */}
        <nav className="w-64 border-r border-border bg-card/30 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-6 space-y-1">
            {SECTIONS.map((sec) => {
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  className={`w-full flex items-center text-left py-3 px-4 relative transition-colors ${
                    isActive ? "text-foreground bg-card" : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent" />
                  )}
                  <span className="font-['IBM_Plex_Mono'] text-[10px] w-6 opacity-60">
                    {String(sec.id).padStart(2, '0')}
                  </span>
                  <span className="text-[13px]">{sec.title}</span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Center Content Column */}
        <main className="flex-1 overflow-y-auto p-12 bg-background relative">
          <div className="max-w-2xl">
            {/* Render Active Section */}
            {activeSection === 1 && <SectionIdentity />}
            {activeSection === 2 && <SectionLink />}
            {activeSection === 3 && <SectionHandoff />}
            {activeSection === 4 && <SectionDados />}
            {activeSection === 5 && <SectionEntrega />}
            {activeSection === 6 && <SectionAcompanhamento />}
            {activeSection === 7 && <SectionContrato />}
            {activeSection === 8 && <SectionTermo />}
            {activeSection === 9 && <SectionArquivos />}
          </div>
        </main>

        {/* Dockable Right Preview */}
        {previewOpen && (
          <aside className="w-[400px] border-l border-border bg-card/10 shrink-0 flex flex-col">
            <div className="p-4 border-b border-border font-['Archivo_Expanded'] uppercase tracking-widest text-[9px] text-muted-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-accent rotate-45 block" />
              O que a paciente vê
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-card/20 flex justify-center">
              <PhonePreview />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------
// Sections

function SectionIdentity() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div>
        <h2 className="font-['Spectral'] text-4xl text-foreground">{PACIENTE.nome}</h2>
        <div className="flex items-center gap-3 mt-4 text-sm text-muted-foreground">
          <span className="font-['IBM_Plex_Mono']">{PACIENTE.cpf}</span>
          <span className="w-1 h-1 bg-border rotate-45" />
          <span className="font-['IBM_Plex_Mono']">{PACIENTE.telefone}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="p-6 border border-border bg-card/40 space-y-4">
          <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground">
            Cirurgia
          </div>
          <div className="font-['IBM_Plex_Mono'] text-sm">
            {PACIENTE.dataCirurgia} às {PACIENTE.horario}
          </div>
          <div className="flex flex-wrap gap-2">
            {PACIENTE.procedimentos.map((p) => (
              <span key={p} className="px-2 py-1 border border-border text-xs">{p}</span>
            ))}
            {PACIENTE.laser && (
              <span className="px-2 py-1 border border-accent text-accent text-xs flex items-center gap-1.5">
                <span className="w-1 h-1 bg-accent rotate-45" /> Laser CO₂
              </span>
            )}
          </div>
        </div>

        <div className="p-6 border border-border bg-card/40 space-y-4">
          <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground">
            Responsável
          </div>
          <select 
            className="w-full h-11 border border-border bg-transparent px-3 text-sm focus:outline-none focus:border-accent"
            defaultValue={VENDEDORA_ATUAL_ID}
          >
            {VENDEDORAS.map((v) => (
              <option key={v.id} value={v.id}>{v.nome}</option>
            ))}
          </select>
          <div className="pt-2 flex items-center gap-2 text-xs">
            {ATIVIDADE.abriu ? (
              <span className="flex items-center gap-1.5 text-accent">
                <Check className="w-3.5 h-3.5" /> Abriu o link
              </span>
            ) : (
              <span className="text-muted-foreground">Ainda não abriu o link</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionLink() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h2 className="font-['Spectral'] text-3xl">Link da Paciente</h2>
      <p className="text-muted-foreground text-sm leading-relaxed">
        Este é o link único de preparo da paciente. Ele contém as orientações, o contrato, termo de consentimento e a contagem regressiva para a cirurgia.
      </p>
      
      <div className="flex items-center gap-2">
        <div className="h-12 flex-1 border border-border bg-card/40 flex items-center px-4 font-['IBM_Plex_Mono'] text-sm text-muted-foreground">
          {LINK_PACIENTE}
        </div>
        <button className="h-12 px-6 border border-border hover:bg-card flex items-center gap-2 text-sm transition-colors">
          <Copy className="w-4 h-4" /> Copiar
        </button>
        <button className="h-12 px-6 bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 text-sm transition-colors">
          <ExternalLink className="w-4 h-4" /> Abrir
        </button>
      </div>
    </div>
  );
}

function SectionHandoff() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h2 className="font-['Spectral'] text-3xl">Handoff</h2>
      
      {HANDOFF_APROVADO ? (
        <div className="p-8 border border-accent/40 bg-card/40 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-12 h-12 border border-accent flex items-center justify-center text-accent">
            <Check className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-['Spectral'] text-accent">Handoff Aprovado</h3>
            <p className="text-sm text-muted-foreground mt-1">
              A documentação e pagamentos foram validados. A página está liberada para envio.
            </p>
          </div>
        </div>
      ) : (
        <div className="p-8 border border-border bg-card/40 flex flex-col items-center justify-center text-center space-y-4">
          <p className="text-sm text-muted-foreground">Handoff pendente de aprovação</p>
        </div>
      )}
    </div>
  );
}

function SectionDados() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h2 className="font-['Spectral'] text-3xl">Dados da Paciente</h2>
      
      <div className="space-y-0 border border-border">
        {[
          { label: "Nome Completo", value: PACIENTE.nome },
          { label: "CPF", value: PACIENTE.cpf },
          { label: "Telefone", value: PACIENTE.telefone },
          { label: "Estágio", value: PACIENTE.estagio },
        ].map((item, i) => (
          <div key={i} className="flex border-b border-border last:border-0">
            <div className="w-48 p-4 bg-card/40 font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground flex items-center">
              {item.label}
            </div>
            <div className="flex-1 p-4 text-sm font-['IBM_Plex_Mono']">
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionEntrega() {
  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div>
        <h2 className="font-['Spectral'] text-3xl">Entrega e WhatsApp</h2>
        <div className="mt-6 space-y-3">
          {ENTREGA.passoAPasso.map((passo, i) => (
            <div key={i} className="flex gap-4 p-4 border border-border bg-card/20">
              <div className="font-['IBM_Plex_Mono'] text-accent text-xs mt-0.5">
                {String(i + 1).padStart(2, '0')}
              </div>
              <div className="text-sm leading-relaxed">{passo}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground">
          Entrega Principal
        </h3>
        <div className="p-6 border border-border bg-card/40 relative group">
          <button className="absolute top-4 right-4 p-2 border border-border bg-background hover:bg-card transition-colors opacity-0 group-hover:opacity-100">
            <Copy className="w-4 h-4 text-muted-foreground" />
          </button>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{ENTREGA.mensagemUnica}</p>
          <div className="mt-4 pt-4 border-t border-border font-['IBM_Plex_Mono'] text-xs text-accent">
            {LINK_PACIENTE}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground">
          Envios Operacionais
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-5 border border-border bg-card/20 space-y-3 relative group">
             <button className="absolute top-3 right-3 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <div className="text-xs font-medium">Centro Cirúrgico</div>
            <pre className="text-[11px] font-['IBM_Plex_Mono'] text-muted-foreground whitespace-pre-wrap">
              {ENTREGA.centroCirurgico}
            </pre>
          </div>
          <div className="p-5 border border-border bg-card/20 space-y-3 relative group">
            <button className="absolute top-3 right-3 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Copy className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <div className="text-xs font-medium">Anestesia</div>
            <pre className="text-[11px] font-['IBM_Plex_Mono'] text-muted-foreground whitespace-pre-wrap">
              {ENTREGA.anestesia}
            </pre>
          </div>
        </div>
        {ENTREGA.avisoOperacional && (
          <div className="p-4 border-l-2 border-l-accent bg-card/20 text-sm text-foreground">
            <span className="font-medium mr-2">Aviso Operacional:</span> 
            {ENTREGA.avisoOperacional}
          </div>
        )}
      </div>

      <details className="group border border-border bg-card/20">
        <summary className="p-4 text-sm font-medium cursor-pointer list-none flex items-center justify-between">
          <span>Fallback Manual</span>
          <ChevronDown className="w-4 h-4 text-muted-foreground group-open:rotate-180 transition-transform" />
        </summary>
        <div className="p-4 pt-0 border-t border-border mt-4 space-y-4">
          <div className="text-xs text-muted-foreground mb-4">
            Use caso o link não possa ser acessado pela paciente.
          </div>
          {[ENTREGA.fallback.a6, ENTREGA.fallback.a7, ENTREGA.fallback.a8].map((bloco, i) => (
            <div key={i} className="p-4 border border-border bg-background text-sm leading-relaxed">
              {bloco}
            </div>
          ))}
          <div className="pt-2">
            <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Checklist Medx</div>
            <div className="space-y-2">
              {ENTREGA.fallback.checklistMedx.map((item, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className={`w-1.5 h-1.5 rotate-45 shrink-0 ${item.incluido ? 'bg-accent' : 'bg-border'}`} />
                  <span className="text-foreground">{item.titulo}</span>
                  {!item.sempre && <span className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground">condicional</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function SectionAcompanhamento() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-end justify-between">
        <h2 className="font-['Spectral'] text-3xl">Acompanhamento</h2>
        <button className="h-10 px-4 border border-border hover:bg-card flex items-center gap-2 text-xs transition-colors">
          <Plus className="w-3.5 h-3.5" /> Adicionar Nota
        </button>
      </div>

      <div className="space-y-6">
        <h3 className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground">
          Atividade na Página
        </h3>
        <div className="space-y-0 border-l border-border ml-2">
          {ATIVIDADE.eventos.map((ev) => (
            <div key={ev.id} className="relative pl-6 pb-6 last:pb-0">
              <div className="absolute left-[-6px] top-2 w-2 h-2 rotate-45 bg-background border border-border" />
              <div className="text-sm">{ev.descricao}</div>
              <div className="text-[11px] font-['IBM_Plex_Mono'] text-muted-foreground mt-1">
                {new Date(ev.createdAt).toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-8 border-t border-border space-y-6">
        <h3 className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground">
          Timeline da Jornada
        </h3>
        <div className="space-y-0 border-l border-border ml-2">
          {TIMELINE.map((ev) => (
            <div key={ev.id} className="relative pl-6 pb-8 last:pb-0">
              <div className="absolute left-[-6px] top-2 w-2 h-2 rotate-45 bg-background border border-accent" />
              <div className="text-sm font-medium">{ev.titulo}</div>
              {ev.descricao && <div className="text-sm text-muted-foreground mt-1 leading-relaxed">{ev.descricao}</div>}
              <div className="text-[11px] font-['IBM_Plex_Mono'] text-muted-foreground mt-2">
                {new Date(ev.createdAt).toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionContrato() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h2 className="font-['Spectral'] text-3xl">Contrato (Autentique)</h2>
      
      <div className="p-8 border border-border bg-card/20 space-y-6">
        <div className="flex items-center justify-between">
          <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Status
          </div>
          {CONTRATO.status === "assinado" ? (
            <span className="px-3 py-1 text-accent text-xs flex items-center gap-1.5 border border-accent/40">
              <Check className="w-3.5 h-3.5" /> Assinado
            </span>
          ) : (
            <span className="px-3 py-1 text-muted-foreground text-xs border border-border">
              Pendente
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-['Archivo_Expanded'] mb-1">
              Prazo
            </div>
            <div className="font-['IBM_Plex_Mono'] text-sm">{CONTRATO.prazo}</div>
          </div>
          {CONTRATO.assinadoEm && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-['Archivo_Expanded'] mb-1">
                Assinado Em
              </div>
              <div className="font-['IBM_Plex_Mono'] text-sm">{CONTRATO.assinadoEm}</div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-['Archivo_Expanded'] mb-1">
              Última verificação
            </div>
            <div className="font-['IBM_Plex_Mono'] text-sm">{new Date(CONTRATO.verificadoEm).toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-['Archivo_Expanded'] mb-1">
            Link de assinatura
          </div>
          <div className="font-['IBM_Plex_Mono'] text-xs text-muted-foreground truncate">{CONTRATO.linkAssinatura}</div>
        </div>

        <div className="pt-6 border-t border-border flex gap-3">
          <button className="h-10 px-6 bg-primary text-primary-foreground text-sm flex items-center gap-2">
            <ExternalLink className="w-4 h-4" /> Abrir no Autentique
          </button>
          <button className="h-10 px-6 border border-border bg-transparent text-sm flex items-center gap-2 hover:bg-card">
            <Download className="w-4 h-4" /> Baixar PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionTermo() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h2 className="font-['Spectral'] text-3xl">Termo de Consentimento</h2>
      
      <div className="p-8 border border-border bg-card/20 space-y-6">
        <div className="flex items-center justify-between">
          <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground">
            Status
          </div>
          {TERMO.status === "pendente" ? (
            <span className="px-3 py-1 text-muted-foreground text-xs border border-border">
              Pendente
            </span>
          ) : (
            <span className="px-3 py-1 text-accent text-xs flex items-center gap-1.5 border border-accent/40">
              <Check className="w-3.5 h-3.5" /> Assinado
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-['Archivo_Expanded'] mb-1">
              Prazo
            </div>
            <div className="font-['IBM_Plex_Mono'] text-sm">{TERMO.prazo}</div>
          </div>
          {TERMO.assinadoEm && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-['Archivo_Expanded'] mb-1">
                Assinado Em
              </div>
              <div className="font-['IBM_Plex_Mono'] text-sm">{TERMO.assinadoEm}</div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-['Archivo_Expanded'] mb-1">
              Última verificação
            </div>
            <div className="font-['IBM_Plex_Mono'] text-sm">{new Date(TERMO.verificadoEm).toLocaleString('pt-BR')}</div>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-['Archivo_Expanded'] mb-1">
            Link de assinatura
          </div>
          <div className="font-['IBM_Plex_Mono'] text-xs text-muted-foreground truncate">{TERMO.linkAssinatura}</div>
        </div>

        <div className="pt-6 border-t border-border flex gap-3">
          <button className="h-10 px-6 bg-primary text-primary-foreground text-sm flex items-center gap-2">
            <ExternalLink className="w-4 h-4" /> Abrir no Autentique
          </button>
          <button className="h-10 px-6 border border-border bg-transparent text-sm flex items-center gap-2 hover:bg-card">
            Cobrar Assinatura
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionArquivos() {
  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div>
        <h2 className="font-['Spectral'] text-3xl">Documentos</h2>
        <div className="mt-6 space-y-2">
          {DOCUMENTOS.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between p-4 border border-border bg-card/20 hover:bg-card/40 transition-colors">
              <div className="flex items-center gap-3">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">{doc.nome}</span>
                <span className="text-[10px] font-['IBM_Plex_Mono'] px-2 py-0.5 bg-muted/30 text-muted-foreground">
                  {doc.tipo}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-[11px] font-['IBM_Plex_Mono'] text-muted-foreground">{doc.tamanho}</span>
                <button className="p-2 hover:text-accent transition-colors">
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-['Spectral'] text-3xl">Histórico de Alterações</h2>
        <div className="mt-6 space-y-0 border-l border-border ml-2">
          {HISTORICO.map((entry) => (
            <div key={entry.id} className="relative pl-6 pb-6 last:pb-0">
              <div className="absolute left-[-6px] top-2 w-2 h-2 rotate-45 bg-background border border-border" />
              <div className="text-sm">{entry.acao}</div>
              <div className="text-[11px] font-['IBM_Plex_Mono'] text-muted-foreground mt-1">
                {entry.autor} · {new Date(entry.createdAt).toLocaleString('pt-BR')}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h2 className="font-['Spectral'] text-3xl">Pós-op</h2>
        <div className="mt-6 space-y-4">
          {POSOP.map((item) => (
            <div key={item.id} className="p-5 border border-border bg-card/20">
              <div className="flex items-center gap-3 mb-2">
                <span className="font-['IBM_Plex_Mono'] text-xs text-accent px-2 py-1 border border-accent/40">
                  {item.quando}
                </span>
                <span className="font-medium text-sm">{item.titulo}</span>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.descricao}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
