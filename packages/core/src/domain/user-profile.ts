export type UserProfile = {
  id: string;
  displayName: string;
  headline?: string;
  seniority: string;
  mainSkills: string[];
  secondarySkills: string[];
  preferredProjectTypes: string[];
  blockedProjectTypes: string[];
  minimumAmountBrl: number;
  minimumDailyRateBrl: number;
  defaultHourlyRateBrl: number;
  proposalTone: string;
  portfolioSummary?: string;
};

