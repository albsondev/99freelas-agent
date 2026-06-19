(function initContent(globalScope) {
  if (globalScope.__nineFreelasContentInitialized) {
    return;
  }
  globalScope.__nineFreelasContentInitialized = true;

  const {
    buildProposalBidUrl,
    compactWhitespace,
    formatMoneyInput,
    normalizeCurrencyBRL,
    normalizeDeadlineDays,
    normalizeProjectUrl
  } = globalScope.NineFreelasShared;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });

  async function handleMessage(message) {
    if (message?.type === "PING") {
      return {
        ok: true,
        url: location.href,
        ready: true
      };
    }

    if (message?.type === "SCRAPE_PROJECT_PAGE") {
      showOverlay("Lendo dados do projeto...");
      return {
        ok: true,
        project: scrapeProjectPage()
      };
    }

    if (message?.type === "REPORT_STEP") {
      reportStep(message.message || "Etapa em execucao.", message.tone || "info");
      return {
        ok: true
      };
    }

    if (message?.type === "NAVIGATE_TO_PROPOSAL_FORM") {
      return navigateToProposalForm();
    }

    if (message?.type === "SCRAPE_PROPOSAL_PAGE") {
      showOverlay("Lendo dados da pagina de proposta...");
      await waitForProposalFormReadiness();
      return {
        ok: true,
        ...scrapeProposalPage()
      };
    }

    if (message?.type === "FILL_PROPOSAL_FORM") {
      showOverlay("Preenchendo formulario da proposta...");
      const result = await fillProposalForm(message);
      showOverlay("Formulario preenchido. Revise e envie manualmente.", "success");
      return {
        ok: true,
        ...result
      };
    }

    return {
      ok: false,
      error: "Mensagem nao suportada nesta pagina."
    };
  }

  function scrapeProjectPage() {
    reportStep("Projeto carregado. Lendo título, descrição e sinais comerciais.", "info");
    const bodyText = document.body ? document.body.innerText : "";
    const title = compactWhitespace(
      document.querySelector("h1")?.textContent || document.title || ""
    );

    return {
      url: normalizeProjectUrl(location.href),
      bidUrl: buildProposalBidUrl(location.href),
      title,
      description: readProjectDescription(bodyText),
      category: readLabeledValue(bodyText, "Categoria"),
      subcategory: readLabeledValue(bodyText, "Subcategoria"),
      budgetText: readLabeledValue(bodyText, "Orçamento") || readLabeledValue(bodyText, "Orcamento"),
      proposalCountText: readLabeledValue(bodyText, "Propostas"),
      interestedCountText: readLabeledValue(bodyText, "Interessados"),
      minimumOfferText: readLabeledValue(bodyText, "Valor Mínimo") || readLabeledValue(bodyText, "Valor Minimo"),
      skills: extractSkills(bodyText)
    };
  }

  function scrapeProposalPage() {
    const bodyText = document.body ? document.body.innerText : "";
    const offerInput = document.querySelector("#oferta");
    const finalOfferInput = document.querySelector("#oferta-final");
    const hasExistingProposal =
      /Melhorar proposta|Você já enviou uma proposta|Voce ja enviou uma proposta|Em andamento/i.test(
        bodyText
      );

    return {
      currentUrl: location.href,
      averageBidAmount: normalizeCurrencyBRL(
        readLine(bodyText, /Valor m[eé]dio das propostas:\s*R\$\s*[\d.,]+/i)
      ),
      averageDeadlineDays: normalizeDeadlineDays(
        readLine(bodyText, /Dura[cç][aã]o m[eé]dia estimada:\s*\d+\s*dias?/i)
      ),
      minimumOfferAmount: normalizeCurrencyBRL(
        readLine(bodyText, /Oferta m[ií]nima:\s*R\$\s*[\d.,]+/i) ||
          readLine(bodyText, /Valor m[ií]nimo:\s*R\$\s*[\d.,]+/i)
      ),
      currentOfferAmount: normalizeCurrencyBRL(offerInput?.value || ""),
      currentFinalOfferAmount: normalizeCurrencyBRL(finalOfferInput?.value || ""),
      hasProposalForm: Boolean(
        document.querySelector("#oferta") &&
          document.querySelector("#duracao-estimada") &&
          document.querySelector("#proposta")
      ),
      hasExistingProposal
    };
  }

  async function fillProposalForm({ amount, deadlineDays, detailsText }) {
    await waitForProposalFormReadiness();

    const amountInput = document.querySelector("#oferta");
    const finalAmountInput = document.querySelector("#oferta-final");
    const deadlineInput = document.querySelector("#duracao-estimada");
    const detailsTextarea = document.querySelector("#proposta");

    if (!amountInput || !deadlineInput || !detailsTextarea) {
      throw new Error("Campos do formulario nao foram encontrados.");
    }

    highlightElement(amountInput);
    reportStep(`Preenchendo campo de valor com R$ ${amount}.`, "info");
    await fillFieldLikeHuman(amountInput, formatMoneyInput(amount));
    await delay(700);

    highlightElement(deadlineInput);
    reportStep(`Preenchendo campo de prazo com ${Math.max(1, Math.round(deadlineDays))} dia(s).`, "info");
    await fillFieldLikeHuman(deadlineInput, String(Math.max(1, Math.round(deadlineDays))));
    await delay(350);

    highlightElement(detailsTextarea);
    reportStep("Preenchendo campo de detalhes da proposta.", "info");
    await fillFieldLikeHuman(detailsTextarea, detailsText);
    await delay(450);

    detailsTextarea.focus();
    detailsTextarea.dispatchEvent(new Event("change", { bubbles: true }));
    validateFilledTextarea(detailsTextarea, detailsText);
    reportStep("Formulario preenchido com sucesso. Revisao manual liberada.", "success");

    return {
      filledAmount: amountInput.value,
      filledFinalAmount: finalAmountInput ? finalAmountInput.value : null,
      filledDeadlineDays: deadlineInput.value,
      detailsLength: detailsTextarea.value.length
    };
  }

  async function waitForProposalFormReadiness() {
    const timeoutAt = Date.now() + 30000;

    while (Date.now() < timeoutAt) {
      const amountInput = document.querySelector("#oferta");
      const deadlineInput = document.querySelector("#duracao-estimada");
      const detailsTextarea = document.querySelector("#proposta");

      if (amountInput && deadlineInput && detailsTextarea) {
        reportStep("Formulario detectado na pagina de proposta.", "success");
        return;
      }

      await delay(300);
    }

    throw new Error("O formulario de proposta nao ficou pronto a tempo.");
  }

  function setElementValue(element, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      element.constructor.prototype,
      "value"
    )?.set;

    if (nativeSetter) {
      nativeSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function fillFieldLikeHuman(element, value) {
    element.focus();
    await delay(120);
    setElementValue(element, "");
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Backspace" }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Backspace" }));
    await delay(80);

    setElementValue(element, value);
    element.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
    element.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Tab" }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    await delay(120);
  }

  function validateFilledTextarea(element, expectedValue) {
    const actual = String(element?.value || "");
    const expected = String(expectedValue || "");
    const actualNormalized = compactWhitespace(actual);
    const expectedNormalized = compactWhitespace(expected);

    if (!actualNormalized) {
      throw new Error("O campo de detalhes ficou vazio apos o preenchimento.");
    }

    const expectedPrefix = expectedNormalized.slice(0, 180);
    if (expectedPrefix && !actualNormalized.startsWith(expectedPrefix)) {
      throw new Error(
        "O texto salvo no campo de detalhes nao corresponde ao inicio esperado da proposta."
      );
    }

    if (actualNormalized.length < Math.max(300, Math.floor(expectedNormalized.length * 0.8))) {
      throw new Error(
        `O texto salvo no campo de detalhes ficou menor do que o esperado (${actualNormalized.length}/${expectedNormalized.length}).`
      );
    }

    reportStep(
      `Campo de detalhes validado no DOM com ${actualNormalized.length} caracteres preenchidos.`,
      "success"
    );
  }

  function readProjectDescription(bodyText) {
    const match = bodyText.match(
      /Descri[cç][aã]o do Projeto:\s*([\s\S]*?)(?:\n(?:Habilidades|Atividades do cliente nesse projeto|Informações adicionais|Informacoes adicionais|Cliente)\s*:|\nHabilidades|\nCliente|\nInformações adicionais|\nInformacoes adicionais|$)/i
    );
    return compactWhitespace(match?.[1] || "");
  }

  function readLabeledValue(bodyText, label) {
    const pattern = new RegExp(`${label}:\\s*(.+)`, "i");
    const match = bodyText.match(pattern);
    return compactWhitespace(match?.[1] || "");
  }

  function readLine(source, pattern) {
    return source.match(pattern)?.[0] || "";
  }

  function extractSkills(bodyText) {
    const skills = [];
    const source = bodyText.toLowerCase();
    const entries = [
      ["JavaScript", /\bjavascript\b|\bjs\b/],
      ["TypeScript", /\btypescript\b|\bts\b/],
      ["React", /\breact(?:\.js)?\b/],
      ["Vue.js", /\bvue(?:\.js)?\b|\bvuejs\b/],
      ["Next.js", /\bnext(?:\.js)?\b/],
      ["Node.js", /\bnode(?:\.js)?\b/],
      ["PHP", /\bphp\b/],
      ["WordPress", /\bwordpress\b/],
      ["WooCommerce", /\bwoocommerce\b/],
      ["API", /\bapi\b/],
      ["Automação", /\bautoma(?:ç|c)(?:a|ã)o\b/],
      ["IA", /\bia\b|\bintelig[êe]ncia artificial\b/],
      ["Bugfix", /\bbug\b|\bcorre(?:ç|c)(?:a|ã)o\b/]
    ];

    for (const [label, regex] of entries) {
      if (regex.test(source)) {
        skills.push(label);
      }
    }

    return skills;
  }

  function showOverlay(message, tone) {
    const overlay = ensureOverlay();
    overlay.textContent = message;
    overlay.style.background =
      tone === "success" ? "#18804b" : tone === "error" ? "#b42318" : "#0f4c81";
  }

  function ensureOverlay() {
    let overlay = document.getElementById("nf-prefill-overlay");
    if (overlay) {
      return overlay;
    }

    overlay = document.createElement("div");
    overlay.id = "nf-prefill-overlay";
    overlay.style.position = "fixed";
    overlay.style.right = "16px";
    overlay.style.bottom = "16px";
    overlay.style.zIndex = "2147483647";
    overlay.style.maxWidth = "420px";
    overlay.style.padding = "12px 14px";
    overlay.style.borderRadius = "12px";
    overlay.style.boxShadow = "0 12px 30px rgba(0,0,0,0.18)";
    overlay.style.fontFamily = "Arial, sans-serif";
    overlay.style.fontSize = "14px";
    overlay.style.lineHeight = "1.4";
    overlay.style.color = "#ffffff";
    document.body.appendChild(overlay);
    return overlay;
  }

  function ensureDiagnosticsPanel() {
    let panel = document.getElementById("nf-prefill-diagnostics");
    if (panel) {
      return panel;
    }

    panel = document.createElement("div");
    panel.id = "nf-prefill-diagnostics";
    panel.style.position = "fixed";
    panel.style.left = "16px";
    panel.style.bottom = "16px";
    panel.style.width = "360px";
    panel.style.maxHeight = "42vh";
    panel.style.overflow = "auto";
    panel.style.zIndex = "2147483647";
    panel.style.background = "rgba(20, 28, 36, 0.96)";
    panel.style.color = "#f7fafc";
    panel.style.borderRadius = "14px";
    panel.style.boxShadow = "0 12px 30px rgba(0,0,0,0.22)";
    panel.style.padding = "12px";
    panel.style.fontFamily = "Arial, sans-serif";
    panel.style.fontSize = "12px";
    panel.style.lineHeight = "1.45";

    const title = document.createElement("div");
    title.textContent = "99Freelas Extension Diagnostics";
    title.style.fontWeight = "700";
    title.style.marginBottom = "8px";
    panel.appendChild(title);

    const list = document.createElement("div");
    list.id = "nf-prefill-diagnostics-list";
    panel.appendChild(list);

    document.body.appendChild(panel);
    return panel;
  }

  function reportStep(message, tone) {
    ensureDiagnosticsPanel();
    const list = document.getElementById("nf-prefill-diagnostics-list");
    if (!list) {
      return;
    }

    const item = document.createElement("div");
    item.style.marginTop = "6px";
    item.style.padding = "8px 10px";
    item.style.borderRadius = "10px";
    item.style.background =
      tone === "success"
        ? "rgba(24, 121, 78, 0.22)"
        : tone === "error"
          ? "rgba(180, 35, 24, 0.24)"
          : "rgba(14, 107, 168, 0.2)";
    item.textContent = `${new Date().toLocaleTimeString("pt-BR")} - ${message}`;
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
    showOverlay(message, tone);
  }

  function highlightElement(element) {
    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });

    const previousOutline = element.style.outline;
    const previousTransition = element.style.transition;
    element.style.transition = "outline 0.2s ease";
    element.style.outline = "3px solid #ff8a00";

    setTimeout(() => {
      element.style.outline = previousOutline;
      element.style.transition = previousTransition;
    }, 1800);
  }

  async function navigateToProposalForm() {
    reportStep("Tentando localizar o botao ou link de enviar proposta.", "info");

    const candidates = [
      'a[href*="/project/bid/"]',
      '[href*="/project/bid/"]',
      '[class*="proposal"]',
      '[class*="proposta"]',
      'button[data-testid*="proposal"]',
      'a[data-testid*="proposal"]',
      "a.btn",
      "button",
      "a"
    ];

    for (const selector of candidates) {
      const elements = Array.from(document.querySelectorAll(selector));
      const match = elements.find((element) => {
        const text = compactWhitespace(element.textContent || "");
        const href = element.getAttribute("href") || "";
        return (
          /enviar proposta|fazer proposta|proposta/i.test(text) ||
          /\/project\/bid\//i.test(href)
        );
      });

      if (match) {
        highlightElement(match);
        reportStep("CTA de proposta encontrado. Clicando no elemento destacado.", "success");
        await delay(500);
        match.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            view: window
          })
        );
        return {
          ok: true,
          method: "click",
          href: match.getAttribute("href") || null
        };
      }
    }

    const fallbackUrl = buildProposalBidUrl(location.href);
    reportStep("CTA visual nao encontrado. Usando redirecionamento de fallback para a URL de proposta.", "error");
    location.href = fallbackUrl;
    return {
      ok: true,
      method: "fallback-url",
      href: fallbackUrl
    };
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

})(typeof globalThis !== "undefined" ? globalThis : window);
