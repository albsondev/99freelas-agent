export type Scrape99FreelasProjectPageInput = {
  projectUrl: string;
};

export type Scrape99FreelasProjectPageResult = {
  currentUrl: string;
  projectUrl: string;
  title: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  budgetText: string | null;
  proposalCountText: string | null;
  interestedCountText: string | null;
  minimumOfferText: string | null;
  skills: string[];
};

export function build99FreelasProjectUrl(projectUrl: string): string {
  const withoutBidPath = projectUrl.replace("/project/bid/", "/project/");
  const withoutHash = withoutBidPath.split("#").at(0) ?? withoutBidPath;
  return withoutHash.split("?").at(0) ?? withoutHash;
}
