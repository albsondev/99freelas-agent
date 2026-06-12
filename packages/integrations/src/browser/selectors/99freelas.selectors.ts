export const selectors99Freelas = {
  loginUrl: "https://www.99freelas.com.br/login",
  dashboardUrl: "https://www.99freelas.com.br/projetos",
  projectListUrl: "https://www.99freelas.com.br/projects",
  recommendedNotificationsUrl:
    "https://www.99freelas.com.br/project-notifications/view?limit=20",
  homeUrl: "https://www.99freelas.com.br/",
  notificationsBell: 'a[href*="/project-notifications"], a[href*="/notifications"]',
  notificationProjectLinks:
    'a[href*="/project/"]:not([href*="/project/message/"]):not([href*="/project/bid/"])',
  projectListCards:
    '[data-testid="project-card"], .project-item, .project-list-item, article, li',
  projectListLinks:
    'a[href*="/project/"]:not([href*="/project/message/"]):not([href*="/project/bid/"])',
  authenticatedMarkers: [
    'a[href*="logout"]',
    'a[href*="sair"]',
    'a[href*="/dashboard"]',
    'a[href*="/projetos"]',
    'a[href*="/mensagens"]',
    'a[href*="/perfil"]',
    '[data-testid="user-menu"]',
  ],
  loginMarkers: [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="login"]',
    'input[type="password"]',
    'button[type="submit"]',
  ],
  projectTitle: '[data-testid="project-title"], h1',
  projectDescription: '[data-testid="project-description"], .project-description',
  averageBidLabel: "Valor médio das propostas:",
  averageDeadlineLabel: "Duração média estimada:",
  connectionsLabel: "Esta proposta requer",
  proposalForm: "#formProposta, form:has(#btnConcluirEnvioProposta), form:has(#proposta)",
  proposalAmountInput: "#oferta",
  proposalFinalAmountInput: "#oferta-final",
  proposalDeadlineInput: "#duracao-estimada",
  proposalDetailsTextarea: "#proposta",
  minimumOfferText: '(Oferta mínima:',
  submitButton: "#btnConcluirEnvioProposta",
  askQuestionLink: 'a[href*=\"/project/message/\"]',
} as const;
