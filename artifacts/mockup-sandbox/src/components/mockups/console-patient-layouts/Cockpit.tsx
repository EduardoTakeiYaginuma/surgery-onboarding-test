import "./_group.css";
import React, { useState } from "react";
import { PhonePreview } from "./_PhonePreview";
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

function Diamond() {
  return <span className="inline-block w-1.5 h-1.5 bg-accent rotate-45 shrink-0" />;
}

export function Cockpit() {
  const [activeTab, setActiveTab] = useState<"entrega" | "dados" | "docs" | "timeline">("entrega");

  return (
    <div className="min-h-screen bg-background text-foreground font-['Archivo'] font-light">
      {/* COMMAND BAND */}
      <div className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="px-8 py-6 flex items-center justify-between gap-12 max-w-[1920px] mx-auto">
          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="font-['Spectral'] font-light text-4xl text-primary truncate">
                {PACIENTE.nome}
              </h1>
              {PACIENTE.laser && (
                <span className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-accent border border-accent px-2 py-1">
                  Laser CO₂
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Diamond /> {PACIENTE.procedimentos.join(", ")}</span>
              <span className="font-['IBM_Plex_Mono']">{PACIENTE.cpf}</span>
              <span className="font-['IBM_Plex_Mono']">{PACIENTE.telefone}</span>
              <div className="flex items-center gap-2 border-l border-border pl-4">
                <span className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest">Vendedora</span>
                <select 
                  className="bg-transparent text-foreground text-sm focus:outline-none cursor-pointer"
                  defaultValue={VENDEDORA_ATUAL_ID}
                >
                  {VENDEDORAS.map(v => (
                    <option key={v.id} value={v.id}>{v.nome}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Status Tiles */}
          <div className="flex items-stretch gap-3 shrink-0">
            {/* Tile 1: Dias */}
            <div className="bg-card px-4 py-3 min-w-[120px] border-l-2 border-l-accent flex flex-col justify-between">
              <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground">Contagem</div>
              <div className="font-['Spectral'] text-2xl text-accent leading-none mt-2">
                -{PACIENTE.diasRestantes} <span className="text-sm font-['Archivo'] text-foreground">dias</span>
              </div>
              <div className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground mt-1">
                {PACIENTE.dataCirurgia} · {PACIENTE.horario}
              </div>
            </div>
            {/* Tile 2: Link */}
            <div className="bg-card px-4 py-3 min-w-[140px] flex flex-col justify-between">
              <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground">Página Pública</div>
              <div className={`text-sm mt-2 ${ATIVIDADE.abriu ? 'text-foreground' : 'text-muted-foreground'}`}>
                {ATIVIDADE.abriu ? "✓ Aberta" : "Não aberta"}
              </div>
              <div className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground mt-1">
                {ATIVIDADE.totalAberturas} views
              </div>
            </div>
            {/* Tile 3: Contrato */}
            <div className="bg-card px-4 py-3 min-w-[140px] flex flex-col justify-between">
              <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground">Contrato</div>
              <div className={`text-sm mt-2 ${CONTRATO.status === 'assinado' ? 'text-foreground' : 'text-muted-foreground'}`}>
                {CONTRATO.status === 'assinado' ? "✓ Assinado" : "Pendente"}
              </div>
              <div className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground mt-1">
                Prazo: {CONTRATO.prazo}
              </div>
            </div>
            {/* Tile 4: Termo */}
            <div className="bg-card px-4 py-3 min-w-[140px] flex flex-col justify-between">
              <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground">Termo (TCLE)</div>
              <div className={`text-sm mt-2 ${TERMO.status === 'assinado' ? 'text-foreground' : 'text-muted-foreground'}`}>
                {TERMO.status === 'assinado' ? "✓ Assinado" : "Pendente"}
              </div>
              <div className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground mt-1">
                Prazo: {TERMO.prazo}
              </div>
            </div>
            {/* Tile 5: Handoff */}
            <div className="bg-card px-4 py-3 min-w-[140px] flex flex-col justify-between">
              <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground">Handoff</div>
              <div className={`text-sm mt-2 ${HANDOFF_APROVADO ? 'text-foreground' : 'text-muted-foreground'}`}>
                {HANDOFF_APROVADO ? "✓ Aprovado" : "Pendente"}
              </div>
              <div className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground mt-1">
                Status Vendas
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="max-w-[1920px] mx-auto px-8 py-8 flex items-start gap-12">
        {/* Sticky Preview Rail */}
        <div className="w-[340px] shrink-0 sticky top-[160px]">
          <PhonePreview />
        </div>

        {/* Operational Area */}
        <div className="flex-1 min-w-0 pb-32">
          {/* SWITCHER */}
          <div className="flex items-center gap-1 p-1 bg-card w-max mb-10">
            {[
              { id: 'entrega', label: '05. Entrega & Link' },
              { id: 'dados', label: '04. Dados Paciente' },
              { id: 'docs', label: '07-09. Docs & Legal' },
              { id: 'timeline', label: '06. Timeline & Histórico' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-6 py-2.5 text-sm transition-colors ${activeTab === tab.id ? 'bg-background text-foreground border border-border' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* CONTENT */}
          <div className="space-y-16">
            
            {activeTab === 'entrega' && (
              <div className="space-y-12 animate-in fade-in duration-300">
                <section>
                  <h2 className="font-['Spectral'] text-2xl mb-6 flex items-center gap-3">
                    <Diamond /> 02. Link da Paciente
                  </h2>
                  <div className="bg-card p-6 flex items-center gap-4">
                    <div className="font-['IBM_Plex_Mono'] text-sm bg-background px-4 py-3 flex-1">{LINK_PACIENTE}</div>
                    <button className="bg-primary text-primary-foreground px-6 py-3 text-sm">Copiar</button>
                    <button className="border border-border text-foreground px-6 py-3 text-sm hover:bg-card/40">Abrir</button>
                  </div>
                </section>

                <section>
                  <h2 className="font-['Spectral'] text-2xl mb-6 flex items-center gap-3">
                    <Diamond /> 05. Entrega
                  </h2>
                  <div className="grid grid-cols-3 gap-8">
                    <div className="col-span-2 space-y-8">
                      <div className="space-y-4">
                        <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground">Entrega Principal</div>
                        <div className="bg-card p-6 whitespace-pre-wrap leading-relaxed text-sm">
                          {ENTREGA.mensagemUnica}
                        </div>
                        <button className="bg-primary text-primary-foreground px-6 py-3 text-sm w-full">Copiar mensagem com link</button>
                      </div>

                      <div className="space-y-4">
                        <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground">Envios Operacionais</div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-card p-5">
                            <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-3">Centro Cirúrgico</div>
                            <div className="font-['IBM_Plex_Mono'] text-xs text-muted-foreground whitespace-pre-wrap">{ENTREGA.centroCirurgico}</div>
                          </div>
                          <div className="bg-card p-5">
                            <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-3">Anestesia</div>
                            <div className="font-['IBM_Plex_Mono'] text-xs text-muted-foreground whitespace-pre-wrap">{ENTREGA.anestesia}</div>
                          </div>
                        </div>
                        {ENTREGA.avisoOperacional && (
                          <div className="bg-card border-l-2 border-l-accent p-4 text-sm">
                            {ENTREGA.avisoOperacional}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="col-span-1">
                      <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground mb-4">Passo a Passo</div>
                      <ol className="space-y-4 list-decimal list-inside text-sm text-muted-foreground ml-4">
                        {ENTREGA.passoAPasso.map((passo, i) => (
                          <li key={i} className="pl-2 leading-relaxed">{passo}</li>
                        ))}
                      </ol>

                      <div className="mt-8 pt-8 border-t border-border">
                        <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground mb-4">Fallback Manual</div>
                        <div className="space-y-3">
                          <div className="bg-card p-4 text-xs whitespace-pre-wrap text-muted-foreground">{ENTREGA.fallback.a6}</div>
                          <div className="bg-card p-4 text-xs whitespace-pre-wrap text-muted-foreground">{ENTREGA.fallback.a7}</div>
                          <div className="bg-card p-4 text-xs whitespace-pre-wrap text-muted-foreground">{ENTREGA.fallback.a8}</div>
                        </div>
                        <div className="mt-6">
                          <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground mb-3">Checklist Medx</div>
                          <div className="space-y-2">
                            {ENTREGA.fallback.checklistMedx.map((item, i) => (
                              <div key={i} className="flex items-center gap-3 text-xs text-foreground">
                                <span className={`w-1.5 h-1.5 rotate-45 shrink-0 ${item.incluido ? 'bg-accent' : 'bg-border'}`} />
                                <span>{item.titulo}</span>
                                {!item.sempre && <span className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground">condicional</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'dados' && (
              <div className="space-y-12 animate-in fade-in duration-300">
                <section>
                  <h2 className="font-['Spectral'] text-2xl mb-6 flex items-center gap-3">
                    <Diamond /> 04. Dados da Paciente
                  </h2>
                  <div className="bg-card p-8 grid grid-cols-2 md:grid-cols-4 gap-8">
                    <div>
                      <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-2">CPF</div>
                      <div className="font-['IBM_Plex_Mono'] text-sm">{PACIENTE.cpf}</div>
                    </div>
                    <div>
                      <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-2">Telefone</div>
                      <div className="font-['IBM_Plex_Mono'] text-sm">{PACIENTE.telefone}</div>
                    </div>
                    <div>
                      <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-2">Data Cirurgia</div>
                      <div className="font-['IBM_Plex_Mono'] text-sm">{PACIENTE.dataCirurgia}</div>
                    </div>
                    <div>
                      <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-2">Horário</div>
                      <div className="font-['IBM_Plex_Mono'] text-sm">{PACIENTE.horario}</div>
                    </div>
                    <div className="col-span-2">
                      <div className="font-['Archivo_Expanded'] text-[9px] uppercase tracking-widest text-muted-foreground mb-2">Procedimentos</div>
                      <div className="text-sm">{PACIENTE.procedimentos.join(", ")} {PACIENTE.laser && "(+ Laser CO₂)"}</div>
                    </div>
                  </div>
                </section>
                
                <section>
                  <h2 className="font-['Spectral'] text-2xl mb-6 flex items-center gap-3">
                    <Diamond /> 09. Pós-operatório
                  </h2>
                  <div className="space-y-4">
                    {POSOP.map(item => (
                      <div key={item.id} className="bg-card p-5 flex items-start gap-6">
                        <div className="font-['IBM_Plex_Mono'] text-sm text-accent w-20 shrink-0">{item.quando}</div>
                        <div>
                          <div className="font-medium text-sm mb-1">{item.titulo}</div>
                          <div className="text-sm text-muted-foreground">{item.descricao}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'docs' && (
              <div className="space-y-12 animate-in fade-in duration-300">
                <div className="grid grid-cols-2 gap-8">
                  <section>
                    <h2 className="font-['Spectral'] text-2xl mb-6 flex items-center gap-3">
                      <Diamond /> 07. Contrato
                    </h2>
                    <div className="bg-card p-6 border-l-2 border-l-accent">
                      <div className="flex items-center justify-between mb-6">
                        <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground">Status Autentique</div>
                        <span className={`px-2 py-1 text-xs font-['IBM_Plex_Mono'] ${CONTRATO.status === 'assinado' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground'}`}>
                          {CONTRATO.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="space-y-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Prazo limite</span>
                          <span className="font-['IBM_Plex_Mono']">{CONTRATO.prazo}</span>
                        </div>
                        {CONTRATO.assinadoEm && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Assinado em</span>
                            <span className="font-['IBM_Plex_Mono']">{CONTRATO.assinadoEm}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Última verificação</span>
                          <span className="font-['IBM_Plex_Mono']">{new Date(CONTRATO.verificadoEm).toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="pt-1">
                          <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Link de assinatura</div>
                          <div className="font-['IBM_Plex_Mono'] text-xs text-muted-foreground truncate">{CONTRATO.linkAssinatura}</div>
                        </div>
                        <div className="pt-4 flex gap-3">
                          <button className="flex-1 bg-primary text-primary-foreground py-2.5 text-sm">Baixar PDF</button>
                          <button className="flex-1 border border-border bg-transparent py-2.5 text-sm">Abrir Link</button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section>
                    <h2 className="font-['Spectral'] text-2xl mb-6 flex items-center gap-3">
                      <Diamond /> 08. Termo (TCLE)
                    </h2>
                    <div className="bg-card p-6 border-l-2 border-l-transparent">
                      <div className="flex items-center justify-between mb-6">
                        <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground">Status Autentique</div>
                        <span className={`px-2 py-1 text-xs font-['IBM_Plex_Mono'] ${TERMO.status === 'assinado' ? 'bg-primary text-primary-foreground' : 'bg-background border border-border text-foreground'}`}>
                          {TERMO.status.toUpperCase()}
                        </span>
                      </div>
                      <div className="space-y-4">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Prazo limite</span>
                          <span className="font-['IBM_Plex_Mono']">{TERMO.prazo}</span>
                        </div>
                        {TERMO.assinadoEm && (
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Assinado em</span>
                            <span className="font-['IBM_Plex_Mono']">{TERMO.assinadoEm}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Última verificação</span>
                          <span className="font-['IBM_Plex_Mono']">{new Date(TERMO.verificadoEm).toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="pt-1">
                          <div className="font-['Archivo_Expanded'] text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Link de assinatura</div>
                          <div className="font-['IBM_Plex_Mono'] text-xs text-muted-foreground truncate">{TERMO.linkAssinatura}</div>
                        </div>
                        <div className="pt-4 flex gap-3">
                          <button className="flex-1 border border-border bg-transparent py-2.5 text-sm">Cobrar Assinatura</button>
                          <button className="flex-1 border border-border bg-transparent py-2.5 text-sm">Abrir Link</button>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <section>
                  <h2 className="font-['Spectral'] text-2xl mb-6 flex items-center gap-3">
                    <Diamond /> 09. Documentos
                  </h2>
                  <div className="bg-card">
                    {DOCUMENTOS.map((doc, i) => (
                      <div key={doc.id} className={`p-4 flex items-center justify-between ${i > 0 ? 'border-t border-border/50' : ''}`}>
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 bg-background flex items-center justify-center font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground">PDF</div>
                          <div>
                            <div className="text-sm text-foreground">{doc.nome}</div>
                            <div className="font-['IBM_Plex_Mono'] text-[11px] text-muted-foreground mt-0.5">{doc.tipo} · {doc.data}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-['IBM_Plex_Mono'] text-xs text-muted-foreground">{doc.tamanho}</span>
                          <button className="text-xs border border-border px-3 py-1.5 hover:bg-background">Baixar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className="grid grid-cols-2 gap-12 animate-in fade-in duration-300">
                <section>
                  <h2 className="font-['Spectral'] text-2xl mb-6 flex items-center gap-3">
                    <Diamond /> 06. Acompanhamento
                  </h2>
                  <div className="space-y-6">
                    <div className="flex gap-3">
                      <input type="text" placeholder="Adicionar nota..." className="flex-1 bg-card border-none px-4 py-3 text-sm focus:outline-none" />
                      <button className="bg-primary text-primary-foreground px-6 py-3 text-sm">Salvar</button>
                    </div>

                    <div className="relative pl-4 space-y-8 before:absolute before:inset-y-0 before:left-[3px] before:w-px before:bg-border">
                      {TIMELINE.map(evento => (
                        <div key={evento.id} className="relative">
                          <div className="absolute -left-[17px] top-1.5 w-2 h-2 bg-accent rotate-45" />
                          <div className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground mb-1">
                            {new Date(evento.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            {evento.automatico && " · Automático"}
                          </div>
                          <div className="text-sm font-medium mb-1">{evento.titulo}</div>
                          {evento.descricao && <div className="text-sm text-muted-foreground">{evento.descricao}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="space-y-12">
                  <div>
                    <h2 className="font-['Spectral'] text-2xl mb-6 flex items-center gap-3">
                      <Diamond /> Histórico
                    </h2>
                    <div className="bg-card p-6 space-y-4">
                      {HISTORICO.map(entry => (
                        <div key={entry.id} className="flex justify-between items-start gap-4 text-sm">
                          <div className="text-muted-foreground">{entry.acao}</div>
                          <div className="text-right shrink-0">
                            <div>{entry.autor}</div>
                            <div className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground mt-1">
                              {new Date(entry.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h2 className="font-['Spectral'] text-2xl mb-6 flex items-center gap-3">
                      <Diamond /> Atividade da Paciente
                    </h2>
                    <div className="bg-card p-6 space-y-4">
                      {ATIVIDADE.eventos.map(evento => (
                        <div key={evento.id} className="text-sm border-b border-border/50 pb-3 last:border-0 last:pb-0">
                          <div className="mb-1">{evento.descricao}</div>
                          <div className="font-['IBM_Plex_Mono'] text-[10px] text-muted-foreground">
                            {new Date(evento.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            )}
            
          </div>
        </div>
      </div>
    </div>
  );
}

export default Cockpit;
