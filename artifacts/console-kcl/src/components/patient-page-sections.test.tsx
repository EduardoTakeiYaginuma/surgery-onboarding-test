// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent, within } from "@testing-library/react";
import {
  AgoraConfirmacoes,
  LogoClinicaLockup,
  MedicaIdentidade,
} from "./patient-page-sections";

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Structural serializer
// Extracts the element tag hierarchy of a container as a nested array of
// lowercase tag names, ignoring text nodes, attributes, and CSS classes.
// Used to assert that variant="page" and variant="preview" produce the SAME
// DOM shape: a future wrapper change, element removal, or sibling-order drift
// will produce different arrays and fail the parity test deterministically.
// ---------------------------------------------------------------------------
function tagTree(el: Element): unknown {
  const children = Array.from(el.children).map(tagTree);
  return children.length > 0
    ? [el.tagName.toLowerCase(), ...children]
    : el.tagName.toLowerCase();
}

// ---------------------------------------------------------------------------
// LogoClinicaLockup — behavioral tests (variant="page")
// ---------------------------------------------------------------------------

describe("LogoClinicaLockup — logo fallback", () => {
  it("shows logo <img> when medicoLogoUrl is present", () => {
    const { container } = render(
      <LogoClinicaLockup
        variant="page"
        clinica="Clínica KCL"
        medicoLogoUrl="https://example.com/logo.png"
      />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/logo.png");
  });

  it("shows 'K' emblem when medicoLogoUrl is null", () => {
    const { container, queryByText } = render(
      <LogoClinicaLockup variant="page" clinica="Clínica KCL" medicoLogoUrl={null} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(queryByText("K")).not.toBeNull();
  });

  it("falls back to 'K' emblem after image onError (page)", () => {
    const { container, queryByText } = render(
      <LogoClinicaLockup
        variant="page"
        clinica="Clínica KCL"
        medicoLogoUrl="https://example.com/broken.png"
      />,
    );
    const img = container.querySelector("img")!;
    expect(img).not.toBeNull();
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(queryByText("K")).not.toBeNull();
  });

  it("falls back to 'K' emblem after image onError (preview)", () => {
    const { container, queryByText } = render(
      <LogoClinicaLockup
        variant="preview"
        clinica="Clínica KCL"
        medicoLogoUrl="https://example.com/broken.png"
      />,
    );
    const img = container.querySelector("img")!;
    expect(img).not.toBeNull();
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(queryByText("K")).not.toBeNull();
  });

  it("shows clinic name when clinica is truthy", () => {
    const { queryByText } = render(
      <LogoClinicaLockup variant="page" clinica="Clínica KCL" medicoLogoUrl={null} />,
    );
    expect(queryByText("Clínica KCL")).not.toBeNull();
  });

  it("omits clinic name when clinica is empty string", () => {
    const { queryByText } = render(
      <LogoClinicaLockup variant="page" clinica="" medicoLogoUrl={null} />,
    );
    expect(queryByText("Clínica KCL")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// MedicaIdentidade — behavioral tests (variant="page")
// ---------------------------------------------------------------------------

describe("MedicaIdentidade — photo and initials fallback", () => {
  it("shows photo <img> when medicoFotoUrl is present", () => {
    const { container } = render(
      <MedicaIdentidade
        variant="page"
        medica="Dra. Karla Caetano Lobo"
        crm="12345"
        rqe="6789"
        medicoFotoUrl="https://example.com/foto.jpg"
      />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/foto.jpg");
  });

  it("shows initials when medicoFotoUrl is null", () => {
    const { queryByText } = render(
      <MedicaIdentidade
        variant="page"
        medica="Dra. Karla Caetano Lobo"
        crm="12345"
        rqe="6789"
        medicoFotoUrl={null}
      />,
    );
    expect(queryByText("KCL")).not.toBeNull();
  });

  it("falls back to initials after image onError (page)", () => {
    const { container, queryByText } = render(
      <MedicaIdentidade
        variant="page"
        medica="Dra. Karla Caetano Lobo"
        crm="12345"
        rqe="6789"
        medicoFotoUrl="https://example.com/broken.jpg"
      />,
    );
    const img = container.querySelector("img")!;
    expect(img).not.toBeNull();
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(queryByText("KCL")).not.toBeNull();
  });

  it("falls back to initials after image onError (preview)", () => {
    const { container, queryByText } = render(
      <MedicaIdentidade
        variant="preview"
        medica="Dra. Karla Caetano Lobo"
        crm="12345"
        rqe="6789"
        medicoFotoUrl="https://example.com/broken.jpg"
      />,
    );
    const img = container.querySelector("img")!;
    expect(img).not.toBeNull();
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(queryByText("KCL")).not.toBeNull();
  });

  it("shows CRM/RQE line when both are present", () => {
    const { getByText } = render(
      <MedicaIdentidade
        variant="page"
        medica="Dra. Karla Caetano Lobo"
        crm="12345"
        rqe="6789"
        medicoFotoUrl={null}
      />,
    );
    expect(getByText(/CRM 12345 · RQE 6789/)).not.toBeNull();
  });

  it("omits CRM/RQE line when CRM is missing", () => {
    const { queryByText } = render(
      <MedicaIdentidade
        variant="page"
        medica="Dra. Karla Caetano Lobo"
        crm=""
        rqe="6789"
        medicoFotoUrl={null}
      />,
    );
    expect(queryByText(/CRM/)).toBeNull();
  });

  it("omits CRM/RQE line when RQE is missing", () => {
    const { queryByText } = render(
      <MedicaIdentidade
        variant="page"
        medica="Dra. Karla Caetano Lobo"
        crm="12345"
        rqe=""
        medicoFotoUrl={null}
      />,
    );
    expect(queryByText(/CRM/)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Variant structural parity
// Compares the tag-name tree of variant="page" vs variant="preview" so any
// future wrapper change, element removal, or sibling reorder fails the test,
// regardless of CSS class differences between the two scales.
// ---------------------------------------------------------------------------

describe("variant parity — page vs preview DOM structure must match", () => {
  describe("LogoClinicaLockup", () => {
    it("same tag tree when logo URL is present", () => {
      const logoUrl = "https://example.com/logo.png";
      const { container: pg } = render(
        <LogoClinicaLockup variant="page" clinica="C" medicoLogoUrl={logoUrl} />,
      );
      const { container: pv } = render(
        <LogoClinicaLockup variant="preview" clinica="C" medicoLogoUrl={logoUrl} />,
      );
      expect(tagTree(pg)).toEqual(tagTree(pv));
    });

    it("same tag tree when logo URL is null (K emblem branch)", () => {
      const { container: pg } = render(
        <LogoClinicaLockup variant="page" clinica="C" medicoLogoUrl={null} />,
      );
      const { container: pv } = render(
        <LogoClinicaLockup variant="preview" clinica="C" medicoLogoUrl={null} />,
      );
      expect(tagTree(pg)).toEqual(tagTree(pv));
    });

    it("same tag tree after onError fallback fires in both variants", () => {
      const { container: pg } = render(
        <LogoClinicaLockup variant="page" clinica="C" medicoLogoUrl="https://example.com/x.png" />,
      );
      const { container: pv } = render(
        <LogoClinicaLockup variant="preview" clinica="C" medicoLogoUrl="https://example.com/x.png" />,
      );
      fireEvent.error(pg.querySelector("img")!);
      fireEvent.error(pv.querySelector("img")!);
      expect(tagTree(pg)).toEqual(tagTree(pv));
    });

    it("same tag tree when clinica is empty (name element absent)", () => {
      const { container: pg } = render(
        <LogoClinicaLockup variant="page" clinica="" medicoLogoUrl={null} />,
      );
      const { container: pv } = render(
        <LogoClinicaLockup variant="preview" clinica="" medicoLogoUrl={null} />,
      );
      expect(tagTree(pg)).toEqual(tagTree(pv));
    });
  });

  describe("MedicaIdentidade", () => {
    it("same tag tree when photo URL is present", () => {
      const fotoUrl = "https://example.com/foto.jpg";
      const { container: pg } = render(
        <MedicaIdentidade variant="page" medica="Dra. A B" crm="1" rqe="2" medicoFotoUrl={fotoUrl} />,
      );
      const { container: pv } = render(
        <MedicaIdentidade variant="preview" medica="Dra. A B" crm="1" rqe="2" medicoFotoUrl={fotoUrl} />,
      );
      expect(tagTree(pg)).toEqual(tagTree(pv));
    });

    it("same tag tree when photo URL is null (initials branch)", () => {
      const { container: pg } = render(
        <MedicaIdentidade variant="page" medica="Dra. A B C" crm="1" rqe="2" medicoFotoUrl={null} />,
      );
      const { container: pv } = render(
        <MedicaIdentidade variant="preview" medica="Dra. A B C" crm="1" rqe="2" medicoFotoUrl={null} />,
      );
      expect(tagTree(pg)).toEqual(tagTree(pv));
    });

    it("same tag tree after onError fallback fires in both variants", () => {
      const { container: pg } = render(
        <MedicaIdentidade variant="page" medica="Dra. K" crm="1" rqe="2" medicoFotoUrl="https://example.com/x.jpg" />,
      );
      const { container: pv } = render(
        <MedicaIdentidade variant="preview" medica="Dra. K" crm="1" rqe="2" medicoFotoUrl="https://example.com/x.jpg" />,
      );
      fireEvent.error(pg.querySelector("img")!);
      fireEvent.error(pv.querySelector("img")!);
      expect(tagTree(pg)).toEqual(tagTree(pv));
    });

    it("same tag tree when CRM/RQE are both present", () => {
      const { container: pg } = render(
        <MedicaIdentidade variant="page" medica="Dra. K" crm="99" rqe="11" medicoFotoUrl={null} />,
      );
      const { container: pv } = render(
        <MedicaIdentidade variant="preview" medica="Dra. K" crm="99" rqe="11" medicoFotoUrl={null} />,
      );
      expect(tagTree(pg)).toEqual(tagTree(pv));
    });

    it("same tag tree when CRM/RQE are absent (line omitted)", () => {
      const { container: pg } = render(
        <MedicaIdentidade variant="page" medica="Dra. K" crm="" rqe="" medicoFotoUrl={null} />,
      );
      const { container: pv } = render(
        <MedicaIdentidade variant="preview" medica="Dra. K" crm="" rqe="" medicoFotoUrl={null} />,
      );
      expect(tagTree(pg)).toEqual(tagTree(pv));
    });

    it("page and preview CRM/RQE parity: both show or both hide together", () => {
      const propsWithCrm = { medica: "Dra. K", crm: "99", rqe: "11", medicoFotoUrl: null } as const;
      const propsNoCrm   = { medica: "Dra. K", crm: "",   rqe: "",   medicoFotoUrl: null } as const;
      const { container: pgWith } = render(<MedicaIdentidade variant="page" {...propsWithCrm} />);
      const { container: pvWith } = render(<MedicaIdentidade variant="preview" {...propsWithCrm} />);
      expect(within(pgWith).queryByText(/CRM 99 · RQE 11/)).not.toBeNull();
      expect(within(pvWith).queryByText(/CRM 99 · RQE 11/)).not.toBeNull();
      cleanup();
      const { container: pgNone } = render(<MedicaIdentidade variant="page" {...propsNoCrm} />);
      const { container: pvNone } = render(<MedicaIdentidade variant="preview" {...propsNoCrm} />);
      expect(within(pgNone).queryByText(/CRM/)).toBeNull();
      expect(within(pvNone).queryByText(/CRM/)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// AgoraConfirmacoes — confirmation list branches
// Shared between the public patient page and the Console preview. The first two
// lines (date/time, location) are always present; contrato, termo and honorários
// lines appear only when there is real data. These cover the conditional logic
// (assinado vs pending vs absent, prazo formatting, pagamentoQuitado gating) so
// a subtle change to any branch fails deterministically.
// ---------------------------------------------------------------------------

describe("AgoraConfirmacoes — data/hora and local lines", () => {
  it("shows date+time and location lines when the data is present", () => {
    const { queryByText } = render(
      <AgoraConfirmacoes dataCirurgia="2026-08-10" horario="06:00" local="Hospital X" />,
    );
    expect(queryByText("Data e horário confirmados")).not.toBeNull();
    expect(queryByText("Local da cirurgia definido")).not.toBeNull();
  });

  it("degrades to 'Data confirmada' when the date is present but the time is missing", () => {
    const { queryByText } = render(<AgoraConfirmacoes dataCirurgia="2026-08-10" />);
    expect(queryByText("Data confirmada")).not.toBeNull();
    expect(queryByText("Data e horário confirmados")).toBeNull();
  });

  it("omits the date line entirely when there is no surgery date", () => {
    const { queryByText } = render(<AgoraConfirmacoes horario="06:00" local="Hospital X" />);
    expect(queryByText(/Data/)).toBeNull();
    expect(queryByText("Local da cirurgia definido")).not.toBeNull();
  });

  it("omits the location line when there is no location", () => {
    const { queryByText } = render(<AgoraConfirmacoes dataCirurgia="2026-08-10" horario="06:00" />);
    expect(queryByText("Local da cirurgia definido")).toBeNull();
  });

  it("treats blank strings as missing (no invented confirmations)", () => {
    const { container } = render(
      <AgoraConfirmacoes dataCirurgia="   " horario="06:00" local="  " />,
    );
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });

  it("renders no lines at all when given no data (generic preview)", () => {
    const { container } = render(<AgoraConfirmacoes />);
    expect(container.querySelectorAll("li")).toHaveLength(0);
  });
});

describe("AgoraConfirmacoes — contrato branch", () => {
  it("shows 'Contrato assinado' with date when signed and date present", () => {
    const { getByText, queryByText } = render(
      <AgoraConfirmacoes contratoStatus="assinado" contratoAssinadoEm="2026-07-15" />,
    );
    expect(getByText(/Contrato assinado em 15\/07\/2026/)).not.toBeNull();
    expect(queryByText(/assinar até/)).toBeNull();
  });

  it("shows 'Contrato assinado' without date when signed but no date", () => {
    const { getByText } = render(<AgoraConfirmacoes contratoStatus="assinado" />);
    const node = getByText(/Contrato assinado/);
    expect(node.textContent).toBe("Contrato assinado");
  });

  it("shows pending with prazo when actionable and prazo present", () => {
    const { getByText } = render(
      <AgoraConfirmacoes contratoStatus="pendente" contratoPrazo="2026-08-01" />,
    );
    expect(getByText(/Contrato ·/).textContent).toContain("assinar até 01/08/2026");
  });

  it("shows pending 'aguardando assinatura' when actionable but no prazo", () => {
    const { getByText } = render(<AgoraConfirmacoes contratoStatus="pendente" />);
    expect(getByText(/Contrato ·/).textContent).toContain("aguardando assinatura");
  });

  it("renders nothing for contrato when status is null", () => {
    const { queryByText } = render(<AgoraConfirmacoes contratoStatus={null} />);
    expect(queryByText(/Contrato/)).toBeNull();
  });

  it("renders nothing for contrato when status is 'ausente'", () => {
    const { queryByText } = render(<AgoraConfirmacoes contratoStatus="ausente" />);
    expect(queryByText(/Contrato/)).toBeNull();
  });
});

describe("AgoraConfirmacoes — termo branch", () => {
  it("shows 'Termo de consentimento assinado' with date when signed and date present", () => {
    const { getByText, queryByText } = render(
      <AgoraConfirmacoes termoStatus="assinado" termoAssinadoEm="2026-07-20" />,
    );
    expect(getByText(/Termo de consentimento assinado em 20\/07\/2026/)).not.toBeNull();
    expect(queryByText(/assinar até/)).toBeNull();
  });

  it("shows 'Termo de consentimento assinado' without date when signed but no date", () => {
    const { getByText } = render(<AgoraConfirmacoes termoStatus="assinado" />);
    const node = getByText(/Termo de consentimento assinado/);
    expect(node.textContent).toBe("Termo de consentimento assinado");
  });

  it("shows pending with prazo when actionable and prazo present", () => {
    const { getByText } = render(
      <AgoraConfirmacoes termoStatus="pendente" termoPrazo="2026-08-05" />,
    );
    expect(getByText(/Termo de consentimento ·/).textContent).toContain(
      "assinar até 05/08/2026",
    );
  });

  it("shows pending 'aguardando assinatura' when actionable but no prazo", () => {
    const { getByText } = render(<AgoraConfirmacoes termoStatus="pendente" />);
    expect(getByText(/Termo de consentimento ·/).textContent).toContain(
      "aguardando assinatura",
    );
  });

  it("renders nothing for termo when status is null", () => {
    const { queryByText } = render(<AgoraConfirmacoes termoStatus={null} />);
    expect(queryByText(/Termo de consentimento/)).toBeNull();
  });

  it("renders nothing for termo when status is 'ausente'", () => {
    const { queryByText } = render(<AgoraConfirmacoes termoStatus="ausente" />);
    expect(queryByText(/Termo de consentimento/)).toBeNull();
  });
});

describe("AgoraConfirmacoes — honorários branch", () => {
  it("omits honorários line when pagamentoQuitado is undefined", () => {
    const { queryByText } = render(<AgoraConfirmacoes />);
    expect(queryByText(/Honorários/)).toBeNull();
  });

  it("shows 'pagamento confirmado' when pagamentoQuitado is true", () => {
    const { getByText } = render(<AgoraConfirmacoes pagamentoQuitado={true} />);
    expect(getByText(/Honorários · pagamento confirmado/)).not.toBeNull();
  });

  it("shows 'pagar até <data>' when not quitado and vencimento present", () => {
    const { getByText } = render(
      <AgoraConfirmacoes pagamentoQuitado={false} pagamentoVencimento="2026-09-10" />,
    );
    expect(getByText(/Honorários ·/).textContent).toContain("pagar até 10/09/2026");
  });

  it("shows 'pagamento pendente' when not quitado and no vencimento", () => {
    const { getByText } = render(<AgoraConfirmacoes pagamentoQuitado={false} />);
    expect(getByText(/Honorários ·/).textContent).toContain("pagamento pendente");
  });
});
