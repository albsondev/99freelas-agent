import { describe, expect, it } from "vitest";

import {
  build99FreelasProposalPageUrl,
  format99FreelasDeadlineInput,
  format99FreelasMoneyInput,
} from "./99freelas-proposal-form.js";

describe("99Freelas proposal form helpers", () => {
  it("builds the bid url from a public project url", () => {
    expect(
      build99FreelasProposalPageUrl(
        "https://www.99freelas.com.br/project/front-end-e-design-react-next-js-tailwind-para-ajustes-758611",
      ),
    ).toBe(
      "https://www.99freelas.com.br/project/bid/front-end-e-design-react-next-js-tailwind-para-ajustes-758611",
    );
  });

  it("preserves an existing bid url", () => {
    expect(
      build99FreelasProposalPageUrl(
        "https://www.99freelas.com.br/project/bid/front-end-e-design-react-next-js-tailwind-para-ajustes-758611",
      ),
    ).toBe(
      "https://www.99freelas.com.br/project/bid/front-end-e-design-react-next-js-tailwind-para-ajustes-758611",
    );
  });

  it("formats amount and deadline values for the real form inputs", () => {
    expect(format99FreelasMoneyInput(467.31)).toBe("467,31");
    expect(format99FreelasDeadlineInput(8)).toBe("8");
  });
});
