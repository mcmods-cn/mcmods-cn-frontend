import type { ReviewStatus } from "./editor-types";

type ReviewStatusTranslationKey =
  | `reviewStatuses.${ReviewStatus}`
  | "reviewStatuses.protocolError";

export type ReviewStatusPresentation =
  | { status: ReviewStatus; translationKey: ReviewStatusTranslationKey }
  | { translationKey: "reviewStatuses.protocolError" };

export function resolveReviewStatusPresentation(value: unknown): ReviewStatusPresentation {
  switch (value) {
    case "draft":
    case "pending":
    case "approved":
    case "rejected":
      return { status: value, translationKey: `reviewStatuses.${value}` };
    default:
      return { translationKey: "reviewStatuses.protocolError" };
  }
}
