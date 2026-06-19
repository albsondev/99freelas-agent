(function initPrompt(globalScope) {
  const { compactWhitespace } = globalScope.NineFreelasShared;

  function buildGeminiProposalPrompt(context) {
    const profile = context.settings.freelancerProfile;
    const projectContext = {
      url: context.project.url,
      title: context.project.title,
      description: context.project.description,
      category: context.project.category,
      subcategory: context.project.subcategory,
      budgetText: context.project.budgetText,
      proposalCountText: context.project.proposalCountText,
      interestedCountText: context.project.interestedCountText,
      minimumOfferText: context.project.minimumOfferText,
      averageBidAmount: context.proposalPage.averageBidAmount,
      averageDeadlineDays: context.proposalPage.averageDeadlineDays,
      skills: context.project.skills
    };

    return [
      "Como você abordaria este cliente se tivesse bastante interesse em maximizar as chances de contratação nesta disputa com outros freelancers?",
      "",
      "Escreva uma mensagem de proposta comercial para este projeto do 99Freelas.",
      "",
      "A proposta deve ser forte, humana, profissional, natural e específica para este cliente e para este projeto.",
      "",
      "REGRAS:",
      "1. Gere primeiro apenas o TEXTO-PROPOSTA, em texto corrido, pronto para ser copiado e enviado na plataforma.",
      "2. O TEXTO-PROPOSTA deve ter no máximo 3000 caracteres.",
      "3. Não inclua prazo nem valor dentro do TEXTO-PROPOSTA, pois esses dados serão preenchidos em campos separados.",
      "4. Após o TEXTO-PROPOSTA, crie uma seção separada chamada “À parte”.",
      "5. Na seção “À parte”, informe:",
      "* Complexidade",
      "* Risco",
      "* Prazo sugerido",
      "* Valor competitivo",
      "* Valor mínimo aceitável, se fizer sentido",
      "* Cuidados",
      "",
      "CUIDADOS DE PLATAFORMA:",
      "Evite termos que possam acionar alerta de negociação fora da plataforma. Não cite pagamento por fora, comissão direta, liberação de valores, PayPal, Stripe, transferência direta, contato externo, WhatsApp pessoal para negociação ou qualquer frase que pareça tentativa de sair da plataforma.",
      "Quando o projeto envolver pagamentos, use termos neutros como estrutura preparada para integração conforme as regras da plataforma, fluxo administrativo, gestão de status, validação das etapas e organização das regras do sistema.",
      "",
      "REGRAS DE ESCOPO:",
      "Se o projeto parecer grande, trate como MVP ou entrega por fases.",
      "Se parecer pequeno, mantenha a proposta mais direta.",
      "Se houver risco de escopo crescer, mencione alinhamento inicial e priorização.",
      "",
      "REGRAS DE QUALIDADE:",
      "- A proposta deve demonstrar que o briefing foi realmente lido.",
      "- O texto deve soar humano, natural e específico para este projeto.",
      "- O texto deve ter profundidade suficiente para convencer.",
      "- O texto deve ter preferencialmente entre 900 e 1800 caracteres.",
      "- O texto deve ter 3 ou 4 parágrafos curtos, com começo, meio e fim.",
      "- O texto precisa terminar com raciocínio completo e pontuação final.",
      "- Não use reticências.",
      "- Nunca encerre a proposta no meio da frase ou no meio de uma ideia.",
      "- Não cite GitHub, portfólio, currículo ou links externos, a menos que o projeto peça isso explicitamente.",
      "- Não repita literalmente a descrição do cliente dentro da proposta.",
      "- Não explique ao cliente o objetivo do próprio projeto como se estivesse resumindo o briefing para ele.",
      "- Não liste tecnologias ou stacks dominadas, a menos que isso seja realmente necessário para sustentar a confiança da proposta.",
      "- Não reutilize uma abertura padronizada idêntica para todos os projetos.",
      "- Não reutilize a mesma sequência de parágrafos entre propostas diferentes.",
      "- Cada proposta deve ter voz, ritmo e estrutura próprios, coerentes com o tipo de projeto.",
      "- Você tem liberdade criativa para variar a forma de abrir, desenvolver e fechar a proposta, desde que continue profissional, clara e convincente.",
      "- Prefira escrever como um freelancer experiente que acabou de analisar este projeto específico, e não como alguém disparando um modelo pronto.",
      "- Se a proposta ficar curta, genérica ou incompleta, reescreva antes de responder.",
      "- Não entregue rascunho, resumo, frase interrompida ou resposta parcial.",
      "",
      "DIREÇÃO DE ESTILO PARA ESTA PROPOSTA:",
      buildProposalStyleDirection(projectContext),
      "",
      "FORMATO FINAL DA RESPOSTA:",
      "TEXTO-PROPOSTA:",
      "[proposta em texto corrido, pronta para copiar]",
      "",
      "À parte:",
      "Complexidade: [baixa/média/alta]",
      "Risco: [baixo/médio/alto]",
      "Prazo sugerido: [estimativa em dias]",
      "Valor competitivo: [estimativa em BRL]",
      "Valor mínimo aceitável: [estimativa em BRL, se aplicável]",
      "Cuidados: [lista curta e objetiva]",
      "",
      "Agora gere a proposta com base no projeto abaixo.",
      "",
      "Perfil do freelancer:",
      JSON.stringify(profile, null, 2),
      "",
      "Projeto do cliente:",
      JSON.stringify(projectContext, null, 2),
      "",
      "Regras comerciais locais:",
      JSON.stringify({
        discountAgainstAverage: context.settings.pricing.discountAgainstAverage,
        minProposalAmountBrl: context.settings.pricing.minProposalAmountBrl,
        minDeadlineDays: context.settings.pricing.minDeadlineDays
      }, null, 2),
      "",
      "Contexto adicional:",
      compactWhitespace(
        "Este projeto foi selecionado manualmente pelo freelancer como interessante. Gere um texto forte, natural, claro, convincente, com boa densidade técnica, sem citar GitHub ou links externos e sem cair em proposta com cara de modelo repetido."
      )
    ].join("\n");
  }

  function buildGeminiProposalReviewPrompt(context) {
    const projectContext = {
      url: context.project.url,
      title: context.project.title,
      description: context.project.description,
      category: context.project.category,
      subcategory: context.project.subcategory,
      skills: context.project.skills,
      averageBidAmount: context.proposalPage.averageBidAmount,
      averageDeadlineDays: context.proposalPage.averageDeadlineDays
    };

    return [
      "Você é um revisor técnico e comercial de propostas para 99Freelas.",
      "",
      "Sua função não é reescrever a proposta. Sua função é apenas revisar o TEXTO-PROPOSTA abaixo e decidir se ele está pronto para ser usado.",
      "",
      "Responda em formato estrito:",
      "APROVADA",
      "ou",
      "REPROVAR: [motivo objetivo em uma linha]",
      "",
      "Critérios obrigatórios para aprovar:",
      "- o texto está completo e não termina no meio do raciocínio;",
      "- o texto está aderente ao projeto;",
      "- o texto transmite segurança, clareza, organização e domínio técnico compatível com a demanda;",
      "- o texto não está genérico demais;",
      "- o texto não parece um modelo reaproveitado ou excessivamente padronizado;",
      "- o texto não cita GitHub, portfólio, currículo ou links externos sem necessidade;",
      "- o texto não tem reticências nem aparência de rascunho;",
      "- o texto tem boa redação, com começo, meio e fim.",
      "",
      "Se houver qualquer problema de incompletude, fraqueza comercial, baixa aderência ou redação estranha, reprove.",
      "",
      "Projeto:",
      JSON.stringify(projectContext, null, 2),
      "",
      "TEXTO-PROPOSTA PARA REVISÃO:",
      context.detailsText
    ].join("\n");
  }

  function buildProposalStyleDirection(projectContext) {
    const source = `${projectContext.title || ""} ${projectContext.description || ""}`.toLowerCase();

    if (/landing page|lp\b|convers[aã]o|tr[aá]fego/.test(source)) {
      return "Use um tom mais direto, comercial e orientado a resultado, com foco em clareza, conversão, responsividade e execução objetiva.";
    }
    if (/site institucional|empresa|advogado|escrit[oó]rio|presen[cç]a digital/.test(source)) {
      return "Use um tom consultivo, seguro e profissional, destacando organização, apresentação da marca, clareza das informações e consistência da entrega.";
    }
    if (/bug|erro|corre[cç][aã]o|ajuste|manuten[cç][aã]o/.test(source)) {
      return "Use um tom objetivo e técnico na medida certa, transmitindo segurança para diagnosticar, corrigir e estabilizar o problema sem exagerar na promessa.";
    }
    if (/sistema|painel|dashboard|api|integra|automa/.test(source)) {
      return "Use um tom mais estruturado e analítico, enfatizando organização da solução, fluxo principal, estabilidade, manutenção futura e evolução por etapas quando fizer sentido.";
    }
    if (/wordpress|elementor|site/.test(source)) {
      return "Use um tom prático e confiante, mostrando capacidade de organizar a entrega, refinar detalhes importantes e evitar retrabalho desnecessário.";
    }

    return "Use um tom natural, consultivo e adaptável, evitando rigidez. Varie a abertura e o fechamento para que a proposta soe escrita sob medida para este projeto.";
  }

  globalScope.NineFreelasPrompt = {
    buildGeminiProposalPrompt,
    buildGeminiProposalReviewPrompt
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
