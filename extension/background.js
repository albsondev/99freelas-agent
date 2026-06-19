importScripts("shared.js", "prompt.js", "parser.js");

const {
  buildProposalBidUrl,
  compactWhitespace,
  ensureSentenceLimit,
  getExtensionSettings,
  normalizeProjectUrl,
  sanitizeProposalText,
  splitSentences
} = globalThis.NineFreelasShared;
const {
  buildGeminiProposalPrompt,
  buildGeminiProposalReviewPrompt
} = globalThis.NineFreelasPrompt;
const {
  assessProposalNarrativeQuality,
  parseGeminiProposalResponse,
  parseGeminiReviewDecision
} = globalThis.NineFreelasParser;

chrome.runtime.onInstalled.addListener(async () => {
  await getExtensionSettings();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "RUN_PREFILL_FROM_POPUP") {
    runPrefillFlow(message.projectUrl)
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "GET_SETTINGS") {
    getExtensionSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "SAVE_SETTINGS") {
    globalThis.NineFreelasShared
      .saveExtensionSettings(message.settings)
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  return false;
});

async function runPrefillFlow(projectUrl) {
  let activeTabId = null;

  try {
    const settings = await getExtensionSettings();

    if (!settings.geminiApiKey) {
      throw new Error("Configure a chave do Gemini nas opcoes da extensao antes de usar.");
    }

    const normalizedProjectUrl = normalizeProjectUrl(projectUrl || "");
    if (!/^https:\/\/www\.99freelas\.com\.br\/project\//i.test(normalizedProjectUrl)) {
      throw new Error("Informe uma URL valida de projeto do 99Freelas.");
    }

    const tab = await chrome.tabs.create({
      url: normalizedProjectUrl,
      active: true
    });

    if (!tab.id) {
      throw new Error("Nao foi possivel abrir a aba do projeto.");
    }

    activeTabId = tab.id;

    await waitForTabComplete(tab.id);
    await ensureTabAutomationReady(tab.id);
    await sendTabMessageWithRetry(tab.id, {
      type: "REPORT_STEP",
      message: "Projeto aberto com sucesso. Iniciando leitura da pagina.",
      tone: "success"
    });

    const projectResult = await sendTabMessageWithRetry(tab.id, {
      type: "SCRAPE_PROJECT_PAGE"
    });

    if (!projectResult?.ok) {
      throw new Error(projectResult?.error || "Falha ao ler o projeto.");
    }

    await sendTabMessageWithRetry(tab.id, {
      type: "REPORT_STEP",
      message: "Projeto lido. Agora vou abrir a tela de proposta pelo proprio DOM.",
      tone: "info"
    });

    const project = projectResult.project;
    const bidUrl = buildProposalBidUrl(project.url);

    await sendTabMessageWithRetry(tab.id, {
      type: "NAVIGATE_TO_PROPOSAL_FORM"
    });
    const movedToBidPage = await waitForTabUrlMatch(tab.id, /\/project\/bid\//i, 6000);

    if (!movedToBidPage) {
      await sendTabMessageWithRetry(tab.id, {
        type: "REPORT_STEP",
        message: "O clique visual nao mudou a pagina a tempo. Vou abrir a URL da proposta como fallback.",
        tone: "error"
      });

      await chrome.tabs.update(tab.id, {
        url: bidUrl
      });
    }

    await waitForTabComplete(tab.id);
    await ensureTabAutomationReady(tab.id);
    await sendTabMessageWithRetry(tab.id, {
      type: "REPORT_STEP",
      message: "Tela de proposta carregada. Validando formulario.",
      tone: "success"
    });

    const proposalPageResult = await sendTabMessageWithRetry(tab.id, {
      type: "SCRAPE_PROPOSAL_PAGE"
    });

    if (!proposalPageResult?.ok) {
      throw new Error(proposalPageResult?.error || "Falha ao abrir a pagina de proposta.");
    }

    if (proposalPageResult.hasExistingProposal) {
      throw new Error("Este projeto ja possui proposta enviada. Nada foi preenchido.");
    }

    if (!proposalPageResult.hasProposalForm) {
      throw new Error("O formulario de proposta nao foi encontrado nesta pagina.");
    }

    const prompt = buildGeminiProposalPrompt({
      project,
      proposalPage: proposalPageResult,
      settings
    });

    await sendTabMessageWithRetry(tab.id, {
      type: "REPORT_STEP",
      message: "Formulario encontrado. Agora vou gerar a proposta com Gemini.",
      tone: "info"
    });

    const geminiDraft = await generateProposalWithGemini({
      apiKey: settings.geminiApiKey,
      model: settings.geminiModel,
      prompt,
      project,
      proposalPage: proposalPageResult,
      settings,
      tabId: tab.id
    });

    const commercialPlan = computeCommercialPlan({
      geminiDraft,
      proposalPage: proposalPageResult,
      project,
      settings
    });

    await sendTabMessageWithRetry(tab.id, {
      type: "REPORT_STEP",
      message: `Gemini respondeu com sucesso. Valor sugerido: R$ ${commercialPlan.amount}. Prazo: ${commercialPlan.deadlineDays} dia(s).`,
      tone: "success"
    });

    const fillResult = await sendTabMessageWithRetry(tab.id, {
      type: "FILL_PROPOSAL_FORM",
      amount: commercialPlan.amount,
      deadlineDays: commercialPlan.deadlineDays,
      detailsText: geminiDraft.detailsText
    });

    if (!fillResult?.ok) {
      throw new Error(fillResult?.error || "Falha ao preencher o formulario.");
    }

    return {
      projectTitle: project.title,
      projectUrl: normalizedProjectUrl,
      bidUrl,
      amount: commercialPlan.amount,
      deadlineDays: commercialPlan.deadlineDays,
      detailsLength: geminiDraft.detailsText.length
    };
  } catch (error) {
    if (activeTabId) {
      await safeReportStep(activeTabId, error?.message || String(error), "error");
    }
    throw error;
  }
}

async function generateProposalWithGemini({
  apiKey,
  model,
  prompt,
  project,
  proposalPage,
  settings,
  tabId
}) {
  let lastError = "Gemini nao retornou um texto adequado.";
  let lastParsed = null;
  let lastRawText = "";
  let rewriteReason = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (tabId) {
      await safeReportStep(
        tabId,
        `Gerando proposta com Gemini (tentativa ${attempt + 1}/2)...`,
        "info"
      );
    }

    try {
      const payload = await callGeminiGenerateContent({
        apiKey,
        model,
        promptText:
          prompt +
          (rewriteReason
            ? `\n\nCORREÇÃO OBRIGATÓRIA DA NOVA VERSÃO:\nRefaça a proposta inteira corrigindo especificamente este problema: ${rewriteReason}\n\nA nova resposta precisa vir completa, forte, natural e sem repetir o erro acima.`
            : ""),
        temperature: 0.35,
        maxOutputTokens: 1600
      });
      const rawText = extractGeminiText(payload);
      lastRawText = rawText || "";
      if (!rawText) {
        lastError = "Gemini nao retornou conteudo textual.";
        continue;
      }

      const parsed = parseGeminiProposalResponse(rawText);
      lastParsed = parsed;
      if (tabId) {
        await safeReportStep(
          tabId,
          `Gemini respondeu. Texto bruto com ${rawText.length} caracteres; proposta extraida com ${parsed.detailsText.length} caracteres.`,
          "info"
        );
      }

      const quality = assessProposalNarrativeQuality(parsed.detailsText, 650);
      if (!quality.isAcceptable) {
        lastError = quality.reasons.join(" ");
        rewriteReason = `O texto falhou nas checagens objetivas: ${lastError}`;
        if (tabId) {
          await safeReportStep(
            tabId,
            `Texto reprovado nas checagens internas: ${lastError}`,
            "error"
          );
        }
        continue;
      }

      if (tabId) {
        await safeReportStep(
          tabId,
          "Texto passou nas checagens internas. Agora vou pedir uma revisão final ao Gemini.",
          "success"
        );
      }

      const candidateDraft = finalizeProposalDraft(parsed, {
        project,
        proposalPage,
        settings
      });

      const reviewPayload = await callGeminiGenerateContent({
        apiKey,
        model,
        promptText: buildGeminiProposalReviewPrompt({
          project,
          proposalPage,
          detailsText: candidateDraft.detailsText
        }),
        temperature: 0.1,
        maxOutputTokens: 120
      });

      const reviewText = extractGeminiText(reviewPayload);
      const reviewDecision = parseGeminiReviewDecision(reviewText);

      if (reviewDecision.approved) {
        if (tabId) {
          await safeReportStep(
            tabId,
            "Revisão final do Gemini aprovou a proposta. Seguindo para preenchimento do formulário.",
            "success"
          );
        }
        return candidateDraft;
      }

      rewriteReason = reviewDecision.reason || "O revisor do Gemini não aprovou a proposta.";
      lastError = rewriteReason;
      if (tabId) {
        await safeReportStep(
          tabId,
          `Revisão final reprovou a proposta: ${rewriteReason}`,
          "error"
        );
      }
    } catch (error) {
      lastError =
        error?.name === "AbortError"
          ? "Tempo esgotado aguardando resposta do Gemini."
          : error?.message || String(error);
      if (tabId) {
        await safeReportStep(tabId, lastError, "error");
      }
    }
  }

  if (tabId) {
    await safeReportStep(
      tabId,
      "Nao consegui aprovar uma proposta boa com o Gemini. Vou montar uma versao local reforcada para nao travar o fluxo.",
      "error"
    );
  }

  return finalizeProposalDraft(
    buildFallbackProposalDraft({
      project,
      proposalPage,
      settings,
      lastParsed,
      lastRawText
    }),
    {
      project,
      proposalPage,
      settings
    }
  );
}

async function callGeminiGenerateContent({
  apiKey,
  model,
  promptText,
  temperature,
  maxOutputTokens
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          generationConfig: {
            temperature,
            maxOutputTokens
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: promptText
                }
              ]
            }
          ]
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      throw new Error(`Erro Gemini (${response.status}): ${await response.text()}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function extractGeminiText(payload) {
  if (payload?.promptFeedback?.blockReason) {
    throw new Error(`Gemini bloqueou a geracao: ${payload.promptFeedback.blockReason}.`);
  }

  const parts =
    payload?.candidates?.flatMap((candidate) =>
      candidate?.content?.parts?.map((part) => part?.text || "") || []
    ) || [];

  return parts.join("\n").trim();
}

function computeCommercialPlan({ geminiDraft, proposalPage, project, settings }) {
  const averageBid = proposalPage.averageBidAmount;
  const averageDeadline = proposalPage.averageDeadlineDays;
  const minimumOffer = proposalPage.minimumOfferAmount;
  const minAmount = Number(settings.pricing.minProposalAmountBrl || 150);
  const minDeadline = Number(settings.pricing.minDeadlineDays || 1);
  const discountFactor = 1 - Number(settings.pricing.discountAgainstAverage || 0.2);
  const feeMultiplier = inferFinalOfferMultiplier(proposalPage);

  let targetFinalAmount =
    geminiDraft.suggestedCompetitiveAmountBrl ||
    averageBid ||
    globalThis.NineFreelasShared.normalizeCurrencyBRL(project.budgetText || "") ||
    minAmount;

  if (averageBid && targetFinalAmount >= averageBid) {
    targetFinalAmount = averageBid * discountFactor;
  } else if (averageBid && !geminiDraft.suggestedCompetitiveAmountBrl) {
    targetFinalAmount = averageBid * discountFactor;
  }

  let amount = targetFinalAmount / feeMultiplier;
  amount = Math.max(amount, minimumOffer || 0, minAmount);
  amount = Math.round(amount);

  let estimatedFinalAmount = Math.round(amount * feeMultiplier);
  if (averageBid && estimatedFinalAmount >= averageBid) {
    const saferTargetFinal = Math.max(minimumOffer || 0, averageBid * 0.9);
    amount = Math.max(minAmount, Math.floor(saferTargetFinal / feeMultiplier));
    estimatedFinalAmount = Math.round(amount * feeMultiplier);
  }

  let deadlineDays =
    geminiDraft.suggestedDeadlineDays ||
    averageDeadline ||
    5;

  if (averageDeadline) {
    deadlineDays = Math.min(deadlineDays, Math.max(minDeadline, Math.ceil(averageDeadline * 0.9)));
  }

  deadlineDays = Math.max(minDeadline, Math.round(deadlineDays));

  return {
    amount,
    deadlineDays,
    estimatedFinalAmount
  };
}

function buildFallbackProposalDraft({
  project,
  proposalPage,
  settings,
  lastParsed,
  lastRawText
}) {
  const title = compactWhitespace(project.title || "seu projeto");
  const description = sanitizeProposalText(project.description || "");
  const profile = settings.freelancerProfile || {};
  const style = buildFallbackStyleProfile(project);

  const opening = style.opening;

  const understanding =
    buildProjectUnderstanding({ title, description }) ||
    "Minha leitura é que o ponto mais importante aqui é transformar a demanda em uma entrega objetiva, bem alinhada ao escopo e preparada para funcionar com consistência no uso real.";

  const approach = style.approach;

  const planning =
    "Minha proposta seria começar pelo escopo principal, validando os elementos mais importantes logo no início, para transformar a primeira entrega em uma base funcional e segura. Quando o projeto pede mais profundidade, o melhor caminho costuma ser estruturar bem a etapa inicial e evoluir com previsibilidade.";

  const trust =
    profile.portfolioSummary
      ? `${sentenceFromSummary(profile.portfolioSummary)} Isso me permite atuar com tranquilidade tanto em construções novas quanto em ajustes, correções e melhorias em projetos web.`
      : "Tenho experiência com projetos web sob medida, ajustes, correções e integrações, o que ajuda bastante a conduzir esse tipo de demanda com mais segurança técnica e visão prática de execução.";

  const close = style.close;

  let detailsText = [
    opening,
    understanding,
    approach,
    planning,
    trust,
    close
  ]
    .filter(Boolean)
    .join("\n\n")
    .replace(/\.\./g, ".")
    .trim();

  const lastParsedQuality = lastParsed?.detailsText
    ? assessProposalNarrativeQuality(lastParsed.detailsText, 650)
    : null;
  const lastRawQuality =
    lastRawText && lastRawText.length >= 260
      ? assessProposalNarrativeQuality(lastRawText, 650)
      : null;

  if (lastParsed?.detailsText && lastParsedQuality?.isAcceptable) {
    detailsText = upgradeNarrativeText(lastParsed.detailsText, {
      project,
      trust,
      close
    });
  } else if (lastRawText && lastRawQuality?.isAcceptable) {
    detailsText = upgradeNarrativeText(lastRawText, {
      project,
      trust,
      close
    });
  }

  detailsText = ensureMaxLengthWithEnding(detailsText, 3000);

  return {
    detailsText,
    suggestedComplexity:
      lastParsed?.suggestedComplexity ||
      inferComplexity(project, description),
    suggestedRisk:
      lastParsed?.suggestedRisk ||
      inferRisk(project, description),
    suggestedDeadlineDays:
      lastParsed?.suggestedDeadlineDays ||
      proposalPage.averageDeadlineDays ||
      5,
    suggestedCompetitiveAmountBrl:
      lastParsed?.suggestedCompetitiveAmountBrl ||
      proposalPage.averageBidAmount ||
      null,
    suggestedMinimumAcceptableAmountBrl:
      lastParsed?.suggestedMinimumAcceptableAmountBrl ||
      settings.pricing.minProposalAmountBrl ||
      null,
    carePoints:
      lastParsed?.carePoints?.length
        ? lastParsed.carePoints
        : [
            "Alinhar escopo inicial com clareza",
            "Validar prioridades antes da execucao",
            "Evitar crescimento descontrolado do escopo"
          ]
  };
}

function finalizeProposalDraft(draft, { project, settings }) {
  const normalizedDraft = {
    ...draft,
    detailsText: ensureMaxLengthWithEnding(
      sanitizeProposalText(stripForbiddenReferences(draft?.detailsText || "")),
      3000
    )
  };

  const quality = assessProposalNarrativeQuality(normalizedDraft.detailsText, 650);
  if (quality.isAcceptable) {
    return normalizedDraft;
  }

  const profile = settings.freelancerProfile || {};
  const description = sanitizeProposalText(project?.description || "");
  const style = buildFallbackStyleProfile(project);
  const focusSentence =
    buildProjectUnderstanding({
      title: compactWhitespace(project?.title || ""),
      description
    }) ||
    "Pelo contexto do anúncio, a demanda pede uma entrega organizada, objetiva e tecnicamente bem conduzida.";
  const technicalSentence = style.technical;
  const planningSentence =
    "Minha abordagem seria começar pelo fluxo principal e pelas entregas mais críticas, validando a base da solução antes de expandir o escopo, para evitar retrabalho e garantir uma evolução mais previsível do projeto.";
  const trustSentence = profile.portfolioSummary
    ? `${sentenceFromSummary(profile.portfolioSummary)} Isso ajuda bastante na condução de projetos web que precisam de leitura de contexto, execução prática e atenção aos detalhes que costumam impactar a entrega final.`
    : "Tenho experiência com desenvolvimento web sob medida, manutenção evolutiva, correção de bugs e ajustes de produto, o que ajuda bastante quando o projeto exige visão prática e boa execução.";
  const closeSentence = style.close;

  normalizedDraft.detailsText = ensureMaxLengthWithEnding(
    [
      style.opening,
      `${focusSentence} ${technicalSentence}`,
      planningSentence,
      `${trustSentence} ${closeSentence}`
    ]
      .filter(Boolean)
      .join("\n\n"),
    3000
  );

  return normalizedDraft;
}

function stripForbiddenReferences(text) {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bgithub\b[^.!?\n]*/gi, "")
    .replace(/\bportf[oó]lio\b[^.!?\n]*/gi, "")
    .replace(/\bcurr[ií]culo\b[^.!?\n]*/gi, "")
    .replace(/descri[cç][aã]o do trabalho\s*:\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function inferFinalOfferMultiplier(proposalPage) {
  const offer = Number(proposalPage?.currentOfferAmount || 0);
  const finalOffer = Number(proposalPage?.currentFinalOfferAmount || 0);
  if (offer > 0 && finalOffer > offer) {
    const ratio = finalOffer / offer;
    if (Number.isFinite(ratio) && ratio > 1 && ratio < 2) {
      return ratio;
    }
  }
  return 1.1112;
}

function inferComplexity(project, description) {
  const source = `${project.title || ""} ${description || ""}`.toLowerCase();
  if (/\bmvp\b|\bintegra|\bpainel\b|\bapi\b|\bsistema\b|\bautoma/i.test(source)) {
    return "média";
  }
  if (/\bmarketplace\b|\berp\b|\broblox\b|\bfintech\b/.test(source)) {
    return "alta";
  }
  return "baixa";
}

function inferRisk(project, description) {
  const source = `${project.title || ""} ${description || ""}`.toLowerCase();
  if (/\blegado\b|\bintegra|\bapi\b|\berp\b|\bchatwoot\b|\bevolution\b/.test(source)) {
    return "médio";
  }
  if (/\bfintech\b|\bmarketplace\b|\bsplit\b/.test(source)) {
    return "alto";
  }
  return "baixo";
}

function lowercaseFirst(value) {
  const text = compactWhitespace(value);
  if (!text) {
    return "";
  }
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function ensureMaxLengthWithEnding(text, maxLength) {
  let output = sanitizeProposalText(text);
  if (output.length > maxLength) {
    output = output.slice(0, maxLength).trim();
  }
  if (!/[.!?]"?$/.test(output)) {
    output = output.replace(/[,:;/-]+$/, "").trim() + ".";
  }
  return output;
}

function sentenceFromSummary(summary) {
  const sentences = splitSentences(summary);
  if (!sentences.length) {
    return "";
  }
  return sentences[0];
}

function upgradeNarrativeText(rawText, { project, trust, close }) {
  const normalized = sanitizeProposalText(rawText)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bgithub\S*/gi, "")
    .replace(/\bmeu GitHub\b.*?(?=[.!?]|$)/gi, "")
    .replace(/descri[cç][aã]o do trabalho\s*:\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const cleanedNarrative = removeProjectEcho(normalized, project);
  const sentences = splitSentences(cleanedNarrative);
  const selected = sentences.slice(0, 5).join(" ");
  const reinforcement =
    "Posso conduzir essa entrega com foco em clareza do fluxo, boa estrutura técnica, estabilidade da implementação e um escopo inicial bem resolvido desde o começo.";

  return [
    ensureSentenceLimit(selected, 1200),
    reinforcement,
    "Também considero importante alinhar bem o escopo inicial para que a primeira entrega já resolva o núcleo do problema sem inflar o projeto logo no começo.",
    trust,
    close
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildProjectUnderstanding({ title, description }) {
  const source = `${title || ""} ${description || ""}`.toLowerCase();

  if (/site institucional|presen[cç]a digital/.test(source)) {
    return "Minha leitura é que o projeto pede uma entrega enxuta, profissional e bem alinhada à apresentação do negócio, com atenção à experiência de navegação, clareza das informações e consistência da estrutura final.";
  }
  if (/landing page|lp\b/.test(source)) {
    return "Minha leitura é que o projeto precisa de uma entrega direta, bem organizada e orientada à conversão, sem complicar o escopo além do que realmente gera resultado.";
  }
  if (/card[aá]pio|reservas|restaurante/.test(source)) {
    return "Minha leitura é que o projeto precisa equilibrar apresentação, navegação simples e funcionamento consistente, para que a entrega fique realmente útil para o negócio e para quem vai acessar a solução.";
  }
  if (/bug|corre[cç][aã]o|ajuste|erro/.test(source)) {
    return "Minha leitura é que a prioridade aqui é atacar o problema com objetividade, entender a causa com clareza e aplicar uma correção segura, sem gerar efeito colateral no restante do sistema.";
  }
  if (/sistema|painel|cadastro|dashboard|api|integra/.test(source)) {
    return "Minha leitura é que a demanda pede uma implementação organizada, com atenção especial ao fluxo principal, à estabilidade da solução e à facilidade de manutenção depois da primeira entrega.";
  }

  return "Minha leitura é que a demanda pede uma entrega organizada, objetiva e bem alinhada ao escopo real do projeto, sem exagero na complexidade e com atenção ao que de fato precisa funcionar bem na prática.";
}

function removeProjectEcho(text, project) {
  const title = compactWhitespace(project?.title || "");
  return splitSentences(text)
    .filter((sentence) => {
      const normalizedSentence = compactWhitespace(sentence).toLowerCase();
      if (normalizedSentence.length < 40) {
        return false;
      }
      if (/descri[cç][aã]o do trabalho|estou buscando um desenvolvedor|o objetivo é|o projeto precisa incluir/.test(normalizedSentence)) {
        return false;
      }
      if (title && normalizedSentence.includes(title.toLowerCase())) {
        return false;
      }
      return true;
    })
    .join(" ");
}

function buildFallbackStyleProfile(project) {
  const source = `${project?.title || ""} ${project?.description || ""}`.toLowerCase();

  if (/landing page|lp\b|convers[aã]o|tr[aá]fego/.test(source)) {
    return {
      opening:
        "Olá! Vi potencial no projeto e acredito que dá para conduzir essa entrega com foco no que realmente influencia a percepção do usuário e o resultado da página.",
      approach:
        "Minha linha de trabalho aqui seria atacar primeiro a clareza da estrutura, a responsividade e a fluidez da experiência, para que a entrega não fique apenas bonita, mas também funcional e coerente com o objetivo da página.",
      technical:
        "Consigo tocar isso com segurança, mantendo atenção à estrutura da solução, à responsividade, à clareza da interface e aos detalhes que fazem diferença na experiência final.",
      close:
        "A ideia é entregar algo bem resolvido, com boa leitura visual, execução consistente e margem saudável para evolução depois da primeira versão."
    };
  }

  if (/bug|erro|corre[cç][aã]o|ajuste|manuten[cç][aã]o/.test(source)) {
    return {
      opening:
        "Olá! Tenho interesse no projeto e esse tipo de demanda combina bastante com um trabalho mais objetivo, cuidadoso e bem conduzido tecnicamente.",
      approach:
        "Minha linha de trabalho aqui seria entender a causa do problema com clareza, corrigir com segurança e validar o comportamento final para evitar retrabalho ou efeito colateral em outras partes do sistema.",
      technical:
        "Consigo tocar isso com segurança, mantendo atenção à estabilidade da solução, à clareza da implementação e à correção do problema sem comprometer o restante do projeto.",
      close:
        "A ideia é sair com uma correção confiável, bem aplicada e com a base mais estável para os próximos ajustes ou evoluções."
    };
  }

  if (/site institucional|empresa|advogado|presen[cç]a digital|wordpress|elementor/.test(source)) {
    return {
      opening:
        "Olá! Tenho interesse no projeto e vejo bastante espaço para conduzir essa entrega de forma organizada, profissional e alinhada ao que a apresentação do negócio precisa transmitir.",
      approach:
        "Minha linha de trabalho aqui seria organizar bem a estrutura da entrega, cuidar da experiência de navegação e garantir que o resultado final fique claro, funcional e consistente para quem acessar o site.",
      technical:
        "Consigo tocar isso com segurança, mantendo atenção à estrutura da solução, à clareza da interface, à responsividade e à estabilidade do que for desenvolvido.",
      close:
        "A ideia é entregar uma solução bem conduzida, com comunicação clara durante o processo e um resultado final útil, estável e fácil de evoluir."
    };
  }

  return {
    opening:
      "Olá! Tenho interesse no projeto e acredito que essa demanda pode ser conduzida de forma bem organizada, com foco no que realmente precisa ser entregue.",
    approach:
      "Minha linha de trabalho aqui seria começar pelo núcleo da entrega, estruturar bem a solução e tomar cuidado com clareza, consistência, manutenção futura e estabilidade do que for desenvolvido.",
    technical:
      "Consigo tocar isso com segurança, mantendo atenção à estrutura da solução, à responsividade, à clareza da interface, à estabilidade da implementação e à facilidade de evolução depois da primeira entrega.",
    close:
      "A ideia é entregar algo bem alinhado ao que você precisa hoje, sem prometer além do escopo, mas já deixando a base organizada para continuidade, melhorias e manutenção com mais tranquilidade."
  };
}

function waitForTabComplete(tabId, expectedUrl) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Tempo esgotado aguardando a aba carregar."));
    }, 45000);

    const listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId) {
        return;
      }

      if (changeInfo.status === "complete") {
        if (expectedUrl && tab?.url && !tab.url.startsWith(expectedUrl)) {
          return;
        }
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tab);
      }
    };

    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function waitForTabUrlMatch(tabId, pattern, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (pattern.test(tab?.url || "")) {
      return true;
    }
    await delay(250);
  }

  return false;
}

async function ensureTabAutomationReady(tabId) {
  const startedAt = Date.now();
  let lastError = "A automacao da aba ainda nao respondeu.";

  while (Date.now() - startedAt < 30000) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["shared.js", "content.js"]
      });
    } catch (error) {
      lastError = error?.message || String(error);
    }

    try {
      const ping = await sendTabMessage(tabId, { type: "PING" });
      if (ping?.ok) {
        await delay(500);
        return;
      }
    } catch (error) {
      lastError = error?.message || String(error);
    }

    await delay(400);
  }

  throw new Error(`A aba carregou, mas o content script nao ficou pronto: ${lastError}`);
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

async function sendTabMessageWithRetry(tabId, message, timeoutMs = 12000) {
  const startedAt = Date.now();
  let lastError = "Sem resposta do content script.";

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await sendTabMessage(tabId, message);
      if (response) {
        return response;
      }
      lastError = "Resposta vazia do content script.";
    } catch (error) {
      lastError = error?.message || String(error);
    }

    await delay(350);
  }

  throw new Error(lastError);
}

async function safeReportStep(tabId, message, tone) {
  try {
    await sendTabMessageWithRetry(
      tabId,
      {
        type: "REPORT_STEP",
        message,
        tone
      },
      4000
    );
  } catch {
    // noop
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
