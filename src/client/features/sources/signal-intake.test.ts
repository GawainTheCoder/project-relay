import { describe, expect, it } from "vitest";

import { buildSignalImportInput } from "./signal-intake";

const baseInput = {
  title: "HBM capacity update",
  publisher: "Example Research",
  sourceKind: "other" as const,
  sourceUrl: "https://example.com/research/hbm",
  content: "A permitted excerpt with enough source context.",
};

describe("buildSignalImportInput", () => {
  it("links a trusted profile to URL intake", () => {
    expect(
      buildSignalImportInput({
        ...baseInput,
        mode: "url",
        sourceProfileId: "source-profile-example",
      }),
    ).toEqual({
      title: baseInput.title,
      publisher: baseInput.publisher,
      sourceUrl: baseInput.sourceUrl,
      sourceKind: "other",
      sourceProfileId: "source-profile-example",
    });
  });

  it("links the same profile to excerpt intake", () => {
    expect(
      buildSignalImportInput({
        ...baseInput,
        mode: "excerpt",
        sourceProfileId: "source-profile-example",
      }),
    ).toEqual({
      title: baseInput.title,
      publisher: baseInput.publisher,
      sourceUrl: baseInput.sourceUrl,
      content: baseInput.content,
      sourceKind: "other",
      sourceProfileId: "source-profile-example",
    });
  });

  it("keeps excerpt intake valid without a source URL", () => {
    expect(
      buildSignalImportInput({
        ...baseInput,
        mode: "excerpt",
        sourceProfileId: "",
        sourceUrl: "",
      }),
    ).toEqual({
      title: baseInput.title,
      publisher: baseInput.publisher,
      content: baseInput.content,
      sourceKind: "other",
    });
  });

  it("keeps generic Add signal intake profile-free", () => {
    expect(
      buildSignalImportInput({
        ...baseInput,
        mode: "url",
        sourceProfileId: "",
      }),
    ).not.toHaveProperty("sourceProfileId");
  });
});
