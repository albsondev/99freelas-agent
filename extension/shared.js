(function initShared(globalScope) {
  const DEFAULT_SETTINGS = {
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash",
    freelancerProfile: {
      displayName: "Andre Albson",
      headline:
        "Desenvolvedor Web Full Stack focado em JavaScript, TypeScript, PHP, React, Vue, Next.js e Node.js",
      seniority: "senior",
      mainSkills: [
        "JavaScript",
        "TypeScript",
        "React",
        "Vue.js",
        "Next.js",
        "Node.js",
        "PHP"
      ],
      secondarySkills: [
        "WordPress",
        "Landing Pages",
        "Correcao de bugs",
        "APIs",
        "Integrações",
        "Supabase"
      ],
      preferredProjectTypes: [
        "Sites pessoais",
        "Sites educacionais",
        "Sites para advogados",
        "Landing Pages",
        "Projetos PHP",
        "Projetos React.js",
        "Projetos Vue.js",
        "Projetos Next.js",
        "Projetos Node.js",
        "Correcao de erros e bugs",
        "Ajustes simples em WordPress"
      ],
      blockedProjectTypes: [
        "AWS",
        "Microsoft Azure",
        "Java",
        "Ecommerce completo",
        "React Native complexo"
      ],
      proposalTone: "consultivo_direto",
      portfolioSummary:
        "Experiencia com sistemas web sob medida, manutencao evolutiva, correcao de bugs, integracoes, landing pages e entregas objetivas para projetos web."
    },
    pricing: {
      discountAgainstAverage: 0.2,
      minProposalAmountBrl: 150,
      minDeadlineDays: 1
    }
  };

  function compactWhitespace(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function sanitizeProposalText(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .split("\n\n")
      .map((paragraph) => compactWhitespace(paragraph))
      .filter(Boolean)
      .join("\n\n");
  }

  function normalizeNumberishToken(token) {
    const normalized = compactWhitespace(token)
      .toLowerCase()
      .replace(/r\$/g, "")
      .replace(/reais?/g, "");

    if (!normalized) {
      return null;
    }

    const multiplier = /\bmil\b|\bk\b/.test(normalized) ? 1000 : 1;
    const numeric = normalized
      .replace(/\bmil\b/g, "")
      .replace(/\bk\b/g, "")
      .replace(/[^\d.,-]/g, "")
      .trim();

    if (!numeric) {
      return null;
    }

    let parsed = numeric;
    const hasComma = parsed.includes(",");
    const hasDot = parsed.includes(".");

    if (hasComma && hasDot) {
      parsed = parsed.replace(/\./g, "").replace(",", ".");
    } else if (hasComma) {
      parsed = parsed.replace(",", ".");
    } else if (hasDot) {
      const fractional = parsed.split(".").at(-1) || "";
      const dotCount = parsed.split(".").length - 1;
      if (dotCount > 1 || fractional.length === 3) {
        parsed = parsed.replace(/\./g, "");
      }
    }

    const value = Number(parsed);
    if (!Number.isFinite(value)) {
      return null;
    }

    return value * multiplier;
  }

  function normalizeCurrencyBRL(text) {
    const source = compactWhitespace(String(text || "").toLowerCase());
    const rangeMatch = source.match(/(\d[\d.,\s]*(?:mil|k)?)\s*(?:a|at[ée]|-|e)\s*(\d[\d.,\s]*(?:mil|k)?)/i);
    if (rangeMatch) {
      const min = normalizeNumberishToken(rangeMatch[1]);
      const max = normalizeNumberishToken(rangeMatch[2]);
      if (min !== null && max !== null) {
        return Math.round((((min + max) / 2) * 100)) / 100;
      }
    }

    const singleMatch = source.match(/(?:r\$\s*)?(\d[\d.,\s]*(?:mil|k)?)/i);
    return singleMatch ? normalizeNumberishToken(singleMatch[1]) : null;
  }

  function normalizeDeadlineDays(text) {
    const source = compactWhitespace(String(text || "").toLowerCase());
    const match = source.match(/(\d+(?:[.,]\d+)?)\s*(dia|dias|semana|semanas|m[eê]s|mes|m[eê]ses|hora|horas)\b/i);
    if (!match) {
      return null;
    }

    const amount = Number(String(match[1]).replace(",", "."));
    if (!Number.isFinite(amount)) {
      return null;
    }

    const unit = String(match[2]).toLowerCase();
    if (unit.startsWith("hora")) {
      return Math.max(1, Math.ceil(amount / 8));
    }
    if (unit.startsWith("semana")) {
      return Math.ceil(amount * 7);
    }
    if (unit.startsWith("m")) {
      return Math.ceil(amount * 30);
    }
    return Math.ceil(amount);
  }

  function formatMoneyInput(amount) {
    return Number(amount || 0).toFixed(2).replace(".", ",");
  }

  function buildProposalBidUrl(projectUrl) {
    const cleaned = String(projectUrl || "").split("#")[0].trim();
    if (/\/project\/bid\//i.test(cleaned)) {
      return cleaned;
    }
    return cleaned.replace("/project/", "/project/bid/");
  }

  function normalizeProjectUrl(projectUrl) {
    return String(projectUrl || "")
      .replace("/project/bid/", "/project/")
      .split("#")[0]
      .split("?")[0]
      .trim();
  }

  function ensureSentenceLimit(text, maxLength) {
    const normalized = sanitizeProposalText(text);
    if (normalized.length <= maxLength) {
      return normalized;
    }

    const sentences = normalized.split(/(?<=[.!?])\s+/);
    let output = "";
    for (const sentence of sentences) {
      const nextValue = output ? `${output} ${sentence}` : sentence;
      if (nextValue.length > maxLength) {
        break;
      }
      output = nextValue;
    }

    return output || normalized.slice(0, maxLength).trim();
  }

  function sentenceCase(value) {
    const text = compactWhitespace(value);
    if (!text) {
      return "";
    }
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function splitSentences(value) {
    return sanitizeProposalText(value)
      .split(/(?<=[.!?])\s+/)
      .map((sentence) => compactWhitespace(sentence))
      .filter(Boolean);
  }

  async function getExtensionSettings() {
    const stored = await chrome.storage.local.get("settings");
    return deepMerge(DEFAULT_SETTINGS, stored.settings || {});
  }

  async function saveExtensionSettings(settings) {
    const merged = deepMerge(DEFAULT_SETTINGS, settings || {});
    await chrome.storage.local.set({ settings: merged });
    return merged;
  }

  function deepMerge(base, extra) {
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) {
      return structuredClone(base);
    }

    const result = structuredClone(base);
    for (const [key, value] of Object.entries(extra)) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        result[key] &&
        typeof result[key] === "object" &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key], value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  globalScope.NineFreelasShared = {
    DEFAULT_SETTINGS,
    buildProposalBidUrl,
    compactWhitespace,
    ensureSentenceLimit,
    formatMoneyInput,
    getExtensionSettings,
    normalizeCurrencyBRL,
    normalizeDeadlineDays,
    normalizeProjectUrl,
    sentenceCase,
    splitSentences,
    sanitizeProposalText,
    saveExtensionSettings
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
