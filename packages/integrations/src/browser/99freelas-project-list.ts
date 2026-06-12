export const PROJECT_NOTIFICATIONS_URL =
  "https://www.99freelas.com.br/project-notifications/view?limit=20";

export const PROJECT_LIST_URL = "https://www.99freelas.com.br/projects";

export type ProjectListingSourceKind =
  | "recommended-notifications"
  | "public-project-list";

export type Collected99FreelasProjectListItem = {
  title: string;
  url: string;
};

export type Collect99FreelasProjectListingsResult = {
  currentUrl: string;
  items: Collected99FreelasProjectListItem[];
  listingUrl: string;
  sourceKind: ProjectListingSourceKind;
};
