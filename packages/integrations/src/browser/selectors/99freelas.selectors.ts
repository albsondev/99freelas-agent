export const selectors99Freelas = {
  projectTitle: '[data-testid="project-title"], h1',
  projectDescription: '[data-testid="project-description"], .project-description',
  averageBid: 'text="Média das propostas"',
  proposalForm: "form",
  proposalAmountInput: 'input[name="amount"]',
  proposalDeadlineInput: 'input[name="deadline"]',
  proposalDetailsTextarea: 'textarea[name="details"]',
  submitButton: 'button[type="submit"]',
} as const;

