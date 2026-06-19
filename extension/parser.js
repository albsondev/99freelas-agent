(function initParser(globalScope) {
  const { compactWhitespace, ensureSentenceLimit, sanitizeProposalText } =
    globalScope.NineFreelasShared;

  const COMPLETE_ENDING_PATTERN = /[.!?]"?$/;
  const DANGLING_ENDING_PATTERN =
    /\b(?:e|ou|com|para|de|da|do|em|na|no|que|se|por|aumentando|fazendo|criando|otimizando|desenvolvendo|implementando)\s*$/i;

  function normalizeParagraphs(value) {
    return String(value || "")
      .replace(/[*_`#]+/g, "")
      .replace(/\.\.\.+/g, ".")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .split(/\n{2,}/)
      .map((paragraph) => compactWhitespace(paragraph))
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  function extractSection(source, startPattern, endPattern) {
    const startMatch = startPattern.exec(source);
    if (!startMatch) {
      return source;
    }

    const tail = source.slice(startMatch.index + startMatch[0].length);
    if (!endPattern) {
      return tail.trim();
    }

    const endMatch = endPattern.exec(tail);
    return (endMatch ? tail.slice(0, endMatch.index) : tail).trim();
  }

  function stripSectionLabel(value) {
    return String(value || "")
      .replace(/^TEXTO-PROPOSTA\s*:\s*/i, "")
      .replace(/^(?:À|A)\s*parte\s*:\s*/i, "")
      .trim();
  }

  function extractLabeledValue(source, label) {
    const escaped = label.includes("(?:")
      ? label
      : label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `${escaped}\\s*:\\s*([\\s\\S]*?)(?=\\n(?:Complexidade|Risco|Prazo sugerido|Valor competitivo|Valor (?:mínimo|minimo) aceit[aá]vel|Cuidados)\\s*:|$)`,
      "i"
    );
    const match = pattern.exec(source);
    return match && match[1] ? compactWhitespace(match[1]) : "";
  }

  function parseBrlAmount(value) {
    if (!value) {
      return null;
    }

    const match = value.match(
      /(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i
    );
    if (!match || !match[1]) {
      return null;
    }

    const parsed = Number.parseFloat(match[1].replace(/\./g, "").replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parseDayCount(value) {
    const match = /(\d{1,3})/.exec(String(value || ""));
    return match && match[1] ? Number.parseInt(match[1], 10) : null;
  }

  function assessProposalNarrativeQuality(text, minCharacters) {
    const normalizedText = sanitizeProposalText(text);
    const effectiveMinCharacters = minCharacters || 320;
    const paragraphs = normalizedText
      ? normalizedText.split(/\n\s*\n/).filter(Boolean)
      : [];
    const sentences = normalizedText
      ? normalizedText
          .split(/(?<=[.!?])\s+/)
          .map((sentence) => sentence.trim())
          .filter(Boolean)
      : [];
    const reasons = [];

    if (normalizedText.length < effectiveMinCharacters) {
      reasons.push(`Texto curto demais (${normalizedText.length}/${effectiveMinCharacters}).`);
    }
    if (paragraphs.length < 2) {
      reasons.push("Texto sem estrutura minima de 2 paragrafos.");
    }
    if (sentences.length < 3) {
      reasons.push("Texto com poucas frases completas.");
    }
    if (normalizedText && !COMPLETE_ENDING_PATTERN.test(normalizedText)) {
      reasons.push("Texto nao termina com pontuacao final.");
    }
    if (DANGLING_ENDING_PATTERN.test(normalizedText)) {
      reasons.push("Texto aparenta terminar no meio do raciocinio.");
    }

    return {
      isAcceptable: reasons.length === 0,
      reasons,
      normalizedText
    };
  }

  function parseGeminiProposalResponse(rawText) {
    const normalized = String(rawText || "").replace(/\r\n/g, "\n").trim();
    const hasStructuredMarkers =
      /TEXTO-PROPOSTA\s*:/i.test(normalized) || /(?:^|\n)(?:À|A)\s*parte\s*:/i.test(normalized);

    const proposalText = hasStructuredMarkers
      ? extractSection(
          normalized,
          /TEXTO-PROPOSTA\s*:\s*/i,
          /(?:^|\n)(?:À|A)\s*parte\s*:\s*/i
        )
      : extractNarrativeFallback(normalized);
    const asideText = hasStructuredMarkers
      ? extractSection(normalized, /(?:À|A)\s*parte\s*:\s*/i, null)
      : extractAsideFallback(normalized);

    const detailsText = finalizeNarrativeText(
      ensureSentenceLimit(normalizeParagraphs(stripSectionLabel(proposalText)), 3000)
    );
    const aside = stripSectionLabel(asideText);

    return {
      detailsText,
      suggestedComplexity: extractLabeledValue(aside, "Complexidade") || null,
      suggestedRisk: extractLabeledValue(aside, "Risco") || null,
      suggestedDeadlineDays: parseDayCount(
        extractLabeledValue(aside, "Prazo sugerido")
      ),
      suggestedCompetitiveAmountBrl: parseBrlAmount(
        extractLabeledValue(aside, "Valor competitivo")
      ),
      suggestedMinimumAcceptableAmountBrl: parseBrlAmount(
        extractLabeledValue(aside, "Valor (?:mínimo|minimo) aceit[aá]vel")
      ),
      carePoints: compactWhitespace(extractLabeledValue(aside, "Cuidados"))
        .split(/\s*(?:•|-|\n)\s*/g)
        .map((item) => compactWhitespace(item))
        .filter(Boolean)
        .slice(0, 6)
    };
  }

  function parseGeminiReviewDecision(rawText) {
    const normalized = compactWhitespace(String(rawText || ""));
    if (/^APROVADA\b/i.test(normalized)) {
      return {
        approved: true,
        reason: ""
      };
    }

    const reprovalMatch = normalized.match(/^REPROVAR\s*:\s*(.+)$/i);
    if (reprovalMatch) {
      return {
        approved: false,
        reason: compactWhitespace(reprovalMatch[1] || "")
      };
    }

    return {
      approved: false,
      reason: normalized || "Revisor nao respondeu no formato esperado."
    };
  }

  function extractNarrativeFallback(source) {
    return source
      .split("\n")
      .filter((line) => {
        const text = compactWhitespace(line);
        return (
          text &&
          !/^(?:TEXTO-PROPOSTA|À parte|A parte|Complexidade|Risco|Prazo sugerido|Valor competitivo|Valor mínimo aceitável|Valor minimo aceitavel|Cuidados)\s*:/i.test(
            text
          )
        );
      })
      .join("\n");
  }

  function extractAsideFallback(source) {
    const lines = source
      .split("\n")
      .map((line) => compactWhitespace(line))
      .filter(Boolean);

    return lines
      .filter((line) =>
        /^(?:Complexidade|Risco|Prazo sugerido|Valor competitivo|Valor mínimo aceitável|Valor minimo aceitavel|Cuidados)\s*:/i.test(
          line
        )
      )
      .join("\n");
  }

  function finalizeNarrativeText(text) {
    const normalized = sanitizeProposalText(text);
    if (!normalized) {
      return "";
    }

    if (COMPLETE_ENDING_PATTERN.test(normalized)) {
      return normalized;
    }

    if (DANGLING_ENDING_PATTERN.test(normalized)) {
      return normalized.replace(/\s+$/, "").replace(/[,:;/-]+$/, "").trim() + ".";
    }

    return normalized + ".";
  }

  globalScope.NineFreelasParser = {
    assessProposalNarrativeQuality,
    parseGeminiProposalResponse,
    parseGeminiReviewDecision
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
