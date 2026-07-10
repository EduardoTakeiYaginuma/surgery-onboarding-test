import "./_group.css";
import React, { useEffect, useState } from "react";
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
import { ExternalLink, Copy, Check, Plus, Download, FileText, Smartphone, ChevronDown } from "lucide-react";

export function Dossier() {
  const [activeSection, setActiveSection] = useState("01");

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      const sections = ["01", "02", "03", "04", "05", "06", "07", "08", "09"];
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(`sec-${sections[i]}`);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 200) {
            setActiveSection(sections[i]);
            break;
          }
        }
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const SECTIONS = [
    { id: "01", title: "Identidade & Status" },
    { id: "02", title: "Link da Paciente" },
    { id: "03", title: "Handoff" },
    { id: "04", title: "Dados da Paciente" },
    { id: "05", title: "Entrega" },
    { id: "06", title: "Acompanhamento" },
    { id: "07", title: "Contrato" },
    { id: "08", title: "Termo (TCLE)" },
    { id: "09", title: "Anexos & Histórico" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground font-['Archivo'] font-light">
      <div className="flex relative">
        {/* Sticky Sidebar Index */}
        <aside className="w-64 shrink-0 h-screen sticky top-0 border-r border-border p-8 flex flex-col justify-between hidden md:flex">
          <div>
            <div className="w-8 h-8 flex items-center justify-center border border-accent text-accent font-['Spectral'] text-lg mb-16">
              K
            </div>
            <nav className="space-y-6">
              {SECTIONS.map((sec) => (
                <button
                  key={sec.id}
                  onClick={() => scrollTo(`sec-${sec.id}`)}
                  className="block text-left w-full group relative"
                >
                  <div className="flex items-baseline gap-4">
                    <span className={`font-['IBM_Plex_Mono'] text-[11px] transition-colors ${activeSection === sec.id ? 'text-accent' : 'text-accent/40 group-hover:text-accent/70'}`}>
                      {sec.id}
                    </span>
                    <span className={`font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest transition-colors ${activeSection === sec.id ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}>
                      {sec.title}
                    </span>
                  </div>
                  {activeSection === sec.id && (
                    <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-accent rotate-45" />
                  )}
                </button>
              ))}
            </nav>
          </div>
          <div className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground">
            Dossier View
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 px-16 py-16 max-w-[1200px] space-y-32">
          
          {/* 01: Identity & Status */}
          <section id="sec-01" className="space-y-12">
            <div>
              <div className="font-['IBM_Plex_Mono'] text-sm text-accent mb-6">01</div>
              <h1 className="font-['Spectral'] text-6xl text-foreground font-light mb-6 leading-tight">
                {PACIENTE.nome}
              </h1>
              <div className="flex items-center gap-6">
                <span className="inline-flex items-center gap-2 font-['Archivo'] text-sm text-foreground border border-border px-4 py-1.5 bg-card/40">
                  <span className="w-1.5 h-1.5 bg-accent rotate-45" />
                  {PACIENTE.procedimentos.join(" + ")}
                </span>
                {PACIENTE.laser && (
                  <span className="inline-flex items-center gap-2 font-['Archivo'] text-sm text-accent border border-accent/40 px-4 py-1.5">
                    Laser CO₂
                  </span>
                )}
                <span className="font-['IBM_Plex_Mono'] text-sm text-muted-foreground ml-2">
                  CPF {PACIENTE.cpf}
                </span>
                <span className="font-['IBM_Plex_Mono'] text-sm text-muted-foreground">
                  TEL {PACIENTE.telefone}
                </span>
              </div>
            </div>

            {/* Status Summary Strip */}
            <div className="grid grid-cols-4 gap-8 border-y border-border py-8">
              <div>
                <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-3">
                  Cirurgia
                </div>
                <div className="font-['IBM_Plex_Mono'] text-lg text-foreground">
                  {PACIENTE.dataCirurgia} <span className="text-muted-foreground text-sm ml-1">{PACIENTE.horario}</span>
                </div>
              </div>
              <div>
                <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-3">
                  Estágio
                </div>
                <div className="text-lg text-foreground font-light">
                  {PACIENTE.estagio}
                </div>
              </div>
              <div>
                <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-3">
                  Vendedora
                </div>
                <select 
                  className="bg-transparent font-['Archivo'] text-lg text-foreground border-b border-border pb-1 focus:outline-none w-full"
                  defaultValue={VENDEDORA_ATUAL_ID}
                >
                  {VENDEDORAS.map(v => (
                    <option key={v.id} value={v.id}>{v.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-3">
                  Atividade
                </div>
                {ATIVIDADE.abriu ? (
                  <div className="inline-flex items-center gap-2 text-sm text-foreground bg-card px-3 py-1.5 border border-border">
                    <Check className="w-4 h-4 text-accent" />
                    Abriu o link ({ATIVIDADE.totalAberturas}x)
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Ainda não abriu</div>
                )}
              </div>
            </div>
          </section>

          {/* Inline Phone Preview Layout (02, 03, 04 side by side with phone) */}
          <div className="flex gap-20">
            <div className="flex-1 space-y-24">
              {/* 02: Link da Paciente */}
              <section id="sec-02">
                <div className="flex items-center gap-4 mb-8">
                  <span className="font-['IBM_Plex_Mono'] text-sm text-accent">02</span>
                  <h2 className="font-['Spectral'] text-3xl font-light">Link da Paciente</h2>
                </div>
                <div className="bg-card p-6 border-l-2 border-l-accent flex items-center justify-between">
                  <span className="font-['IBM_Plex_Mono'] text-foreground">{LINK_PACIENTE}</span>
                  <div className="flex gap-2">
                    <button className="p-2 hover:bg-background border border-border text-foreground transition-colors" title="Copiar link">
                      <Copy className="w-4 h-4" />
                    </button>
                    <button className="p-2 hover:bg-background border border-border text-foreground transition-colors" title="Abrir link">
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </section>

              {/* 03: Handoff */}
              <section id="sec-03">
                <div className="flex items-center gap-4 mb-8">
                  <span className="font-['IBM_Plex_Mono'] text-sm text-accent">03</span>
                  <h2 className="font-['Spectral'] text-3xl font-light">Handoff</h2>
                </div>
                {HANDOFF_APROVADO ? (
                  <div className="inline-flex items-center gap-3 font-['Archivo'] text-sm bg-card border border-border px-5 py-3">
                    <span className="flex items-center justify-center w-5 h-5 border border-accent/40 text-accent">
                      <Check className="w-3 h-3" />
                    </span>
                    <span className="text-foreground">Handoff aprovado.</span>
                    <span className="text-muted-foreground">Link liberado para entrega.</span>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Handoff pendente.</div>
                )}
              </section>

              {/* 04: Dados da Paciente */}
              <section id="sec-04">
                <div className="flex items-center gap-4 mb-8">
                  <span className="font-['IBM_Plex_Mono'] text-sm text-accent">04</span>
                  <h2 className="font-['Spectral'] text-3xl font-light">Dados da Paciente</h2>
                </div>
                <div className="grid grid-cols-2 gap-y-8 gap-x-12 text-sm bg-card/40 p-8 border border-border">
                  <div>
                    <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-2">Nome Completo</div>
                    <div className="text-foreground">{PACIENTE.nome}</div>
                  </div>
                  <div>
                    <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-2">CPF</div>
                    <div className="font-['IBM_Plex_Mono'] text-foreground">{PACIENTE.cpf}</div>
                  </div>
                  <div>
                    <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-2">Dias Restantes</div>
                    <div className="text-foreground">{PACIENTE.diasRestantes} dias</div>
                  </div>
                  <div>
                    <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-2">Status</div>
                    <div className="text-foreground">{PACIENTE.arquivado ? "Arquivado" : "Ativo"}</div>
                  </div>
                </div>
              </section>
            </div>

            {/* Phone Preview Figure */}
            <div className="w-[340px] shrink-0 pt-4">
              <figure className="sticky top-12">
                <figcaption className="flex items-center justify-center gap-2 font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-6">
                  <Smartphone className="w-3 h-3" />
                  O que a paciente vê
                </figcaption>
                <PhonePreview />
              </figure>
            </div>
          </div>

          <hr className="border-border" />

          {/* 05: Entrega */}
          <section id="sec-05">
            <div className="flex items-center gap-4 mb-12">
              <span className="font-['IBM_Plex_Mono'] text-sm text-accent">05</span>
              <h2 className="font-['Spectral'] text-4xl font-light">Entrega</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-16">
              <div className="space-y-12">
                <div>
                  <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-foreground mb-6">Passo a Passo</div>
                  <ul className="space-y-4">
                    {ENTREGA.passoAPasso.map((passo, i) => (
                      <li key={i} className="flex gap-4 text-sm text-muted-foreground">
                        <span className="font-['IBM_Plex_Mono'] text-accent">{i + 1}.</span>
                        <span className="leading-relaxed">{passo}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                
                <div className="bg-card p-8 border border-border">
                  <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-foreground mb-6">Entrega Principal</div>
                  <p className="text-sm leading-relaxed mb-6 text-foreground">{ENTREGA.mensagemUnica}</p>
                  <div className="bg-background border border-border p-4 font-['IBM_Plex_Mono'] text-xs text-accent break-all">
                    {LINK_PACIENTE}
                  </div>
                  <button className="mt-8 flex items-center justify-center gap-2 bg-primary text-primary-foreground h-12 px-8 text-sm w-full transition-opacity hover:opacity-90">
                    <Copy className="w-4 h-4" /> Copiar Mensagem com Link
                  </button>
                </div>
              </div>

              <div className="space-y-12">
                <div className="border border-border p-8 bg-card/40">
                  <div className="flex items-center justify-between mb-6">
                    <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-foreground">Fallback Manual</div>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-5 text-sm text-muted-foreground">
                    <p className="leading-relaxed">{ENTREGA.fallback.a6}</p>
                    <p className="leading-relaxed">{ENTREGA.fallback.a7}</p>
                    <p className="leading-relaxed">{ENTREGA.fallback.a8}</p>
                  </div>
                  <div className="mt-8 border-t border-border pt-6">
                    <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-foreground mb-4">Checklist Médico</div>
                    <ul className="space-y-3">
                      {ENTREGA.fallback.checklistMedx.map((item, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm">
                          <Check className={`w-4 h-4 mt-0.5 ${item.incluido ? "text-accent" : "text-muted-foreground opacity-50"}`} />
                          <span className={item.incluido ? "text-foreground" : "text-muted-foreground line-through opacity-70"}>{item.titulo}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="bg-card p-8 border border-border">
                  <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-foreground mb-8">Envios Operacionais</div>
                  <div className="space-y-8">
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-3">Centro Cirúrgico</div>
                      <pre className="font-['IBM_Plex_Mono'] text-xs text-foreground whitespace-pre-wrap bg-background p-4 border border-border">{ENTREGA.centroCirurgico}</pre>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-widest text-muted-foreground mb-3">Anestesia</div>
                      <pre className="font-['IBM_Plex_Mono'] text-xs text-foreground whitespace-pre-wrap bg-background p-4 border border-border">{ENTREGA.anestesia}</pre>
                    </div>
                    {ENTREGA.avisoOperacional && (
                      <div className="border-l-2 border-l-accent pl-4 py-1">
                        <div className="text-[9px] uppercase tracking-widest text-accent mb-2">Aviso Operacional</div>
                        <p className="text-sm text-foreground">{ENTREGA.avisoOperacional}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          {/* 06: Acompanhamento */}
          <section id="sec-06">
            <div className="flex items-center gap-4 mb-12">
              <span className="font-['IBM_Plex_Mono'] text-sm text-accent">06</span>
              <h2 className="font-['Spectral'] text-4xl font-light">Acompanhamento</h2>
            </div>
            
            <div className="border border-border p-12 bg-card/40 relative">
              <button className="absolute top-12 right-12 flex items-center gap-2 bg-primary text-primary-foreground h-11 px-6 text-sm transition-opacity hover:opacity-90">
                <Plus className="w-4 h-4" /> Nova Nota
              </button>
              
              <div className="max-w-2xl">
                <div className="relative pl-8 border-l border-border/60 space-y-12">
                  
                  {/* Atividade da Paciente merged into timeline visually */}
                  <div className="relative">
                    <div className="absolute -left-[37px] top-1 w-2.5 h-2.5 bg-background border border-accent rotate-45" />
                    <div className="font-['IBM_Plex_Mono'] text-[10px] text-accent mb-2">
                      ATIVIDADE DA PACIENTE
                    </div>
                    <div className="space-y-4 mt-4">
                      {ATIVIDADE.eventos.map(ev => (
                        <div key={`atv-${ev.id}`} className="flex gap-4 text-sm">
                          <div className="font-['IBM_Plex_Mono'] text-muted-foreground w-32 shrink-0">
                            {new Date(ev.createdAt).toLocaleDateString('pt-BR')} {new Date(ev.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                          </div>
                          <div className="text-foreground">{ev.descricao}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {TIMELINE.map(evento => (
                    <div key={evento.id} className="relative">
                      <div className="absolute -left-[37px] top-1 w-2.5 h-2.5 bg-background border border-border rotate-45" />
                      <div className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground mb-2 flex items-center gap-3">
                        {new Date(evento.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                        {evento.automatico && <span className="bg-border/30 px-2 py-0.5 text-foreground">Sistema</span>}
                      </div>
                      <div className="text-foreground font-medium text-base mb-2">{evento.titulo}</div>
                      {evento.descricao && <div className="text-sm text-muted-foreground leading-relaxed">{evento.descricao}</div>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Docs: Contrato & Termo */}
          <div className="grid grid-cols-2 gap-16">
            <section id="sec-07">
              <div className="flex items-center gap-4 mb-8">
                <span className="font-['IBM_Plex_Mono'] text-sm text-accent">07</span>
                <h2 className="font-['Spectral'] text-3xl font-light">Contrato</h2>
              </div>
              <div className="bg-card p-10 border border-border">
                <div className="flex items-center justify-between mb-8">
                  <span className="inline-flex items-center gap-2 text-[10px] bg-background border border-border text-foreground px-3 py-1.5 uppercase tracking-widest font-['Archivo_Expanded']">
                    {CONTRATO.status === "assinado" && <span className="w-1.5 h-1.5 bg-accent rotate-45" />}
                    {CONTRATO.status}
                  </span>
                  <span className="font-['IBM_Plex_Mono'] text-xs text-muted-foreground">Prazo: {CONTRATO.prazo}</span>
                </div>
                <div className="space-y-3 text-sm mb-8 pb-6 border-b border-border/50">
                  {CONTRATO.assinadoEm && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assinado em</span>
                      <span className="font-['IBM_Plex_Mono'] text-foreground">{CONTRATO.assinadoEm}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Última verificação</span>
                    <span className="font-['IBM_Plex_Mono'] text-foreground">{new Date(CONTRATO.verificadoEm).toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground shrink-0">Documento</span>
                    <span className="font-['IBM_Plex_Mono'] text-foreground truncate">{CONTRATO.autentiqueId}</span>
                  </div>
                  <div>
                    <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Link de assinatura</div>
                    <div className="font-['IBM_Plex_Mono'] text-xs text-muted-foreground truncate">{CONTRATO.linkAssinatura}</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button className="flex-1 bg-background border border-border h-11 text-sm flex items-center justify-center gap-2 hover:border-accent/40 transition-colors">
                    <ExternalLink className="w-4 h-4" /> Abrir
                  </button>
                  <button className="flex-1 bg-background border border-border h-11 text-sm flex items-center justify-center gap-2 hover:border-accent/40 transition-colors">
                    <Download className="w-4 h-4" /> Baixar
                  </button>
                </div>
              </div>
            </section>

            <section id="sec-08">
              <div className="flex items-center gap-4 mb-8">
                <span className="font-['IBM_Plex_Mono'] text-sm text-accent">08</span>
                <h2 className="font-['Spectral'] text-3xl font-light">Termo (TCLE)</h2>
              </div>
              <div className="bg-card p-10 border border-border">
                <div className="flex items-center justify-between mb-8">
                  <span className="inline-flex items-center gap-2 text-[10px] bg-background border border-border text-foreground px-3 py-1.5 uppercase tracking-widest font-['Archivo_Expanded']">
                    {TERMO.status === "pendente" && <span className="w-1.5 h-1.5 bg-muted-foreground rotate-45" />}
                    {TERMO.status}
                  </span>
                  <span className="font-['IBM_Plex_Mono'] text-xs text-muted-foreground">Prazo: {TERMO.prazo}</span>
                </div>
                <div className="space-y-3 text-sm mb-8 pb-6 border-b border-border/50">
                  {TERMO.assinadoEm && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Assinado em</span>
                      <span className="font-['IBM_Plex_Mono'] text-foreground">{TERMO.assinadoEm}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Última verificação</span>
                    <span className="font-['IBM_Plex_Mono'] text-foreground">{new Date(TERMO.verificadoEm).toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground shrink-0">Documento</span>
                    <span className="font-['IBM_Plex_Mono'] text-foreground truncate">{TERMO.autentiqueId}</span>
                  </div>
                  <div>
                    <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Link de assinatura</div>
                    <div className="font-['IBM_Plex_Mono'] text-xs text-muted-foreground truncate">{TERMO.linkAssinatura}</div>
                  </div>
                </div>
                <div className="flex gap-4">
                  <button className="flex-1 bg-background border border-border h-11 text-sm flex items-center justify-center gap-2 hover:border-accent/40 transition-colors">
                    <ExternalLink className="w-4 h-4" /> Abrir
                  </button>
                  <button className="flex-1 bg-background border border-border h-11 text-sm flex items-center justify-center gap-2 hover:border-accent/40 transition-colors">
                    Cobrar Assinatura
                  </button>
                </div>
              </div>
            </section>
          </div>

          <hr className="border-border" />

          {/* 09: Anexos & Histórico */}
          <section id="sec-09" className="pt-8 pb-32">
            <div className="flex items-center gap-4 mb-12">
              <span className="font-['IBM_Plex_Mono'] text-sm text-accent">09</span>
              <h2 className="font-['Spectral'] text-4xl font-light">Anexos & Histórico</h2>
            </div>
            
            <div className="grid grid-cols-2 gap-20">
              <div>
                <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground mb-8">Documentos</div>
                <div className="space-y-4">
                  {DOCUMENTOS.map(doc => (
                    <div key={doc.id} className="flex items-center justify-between p-5 bg-card/40 border border-border hover:bg-card transition-colors group">
                      <div className="flex items-start gap-4">
                        <FileText className="w-5 h-5 text-muted-foreground mt-0.5" />
                        <div>
                          <div className="text-sm font-medium text-foreground mb-1">{doc.nome}</div>
                          <div className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground">
                            {doc.tipo} · {doc.data} · {doc.tamanho}
                          </div>
                        </div>
                      </div>
                      <button className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-all">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground mb-8">Pós-Op</div>
                <div className="space-y-8 mb-16">
                  {POSOP.map(item => (
                    <div key={item.id} className="border-l-2 border-l-accent pl-5">
                      <div className="font-['IBM_Plex_Mono'] text-[11px] text-accent mb-2">{item.quando}</div>
                      <div className="text-sm text-foreground mb-2">{item.titulo}</div>
                      <div className="text-sm text-muted-foreground leading-relaxed">{item.descricao}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground mb-8">Histórico</div>
                  <div className="space-y-5">
                    {HISTORICO.map(hist => (
                      <div key={hist.id} className="text-sm flex gap-4">
                        <span className="font-['IBM_Plex_Mono'] text-xs text-muted-foreground shrink-0 w-24">
                          {new Date(hist.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                        <div className="text-foreground">
                          {hist.acao} <span className="text-muted-foreground ml-1">por {hist.autor}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}

export default Dossier;
