import knowledgeBase from "./course-policies.json" with { type: "json" };

export type KnowledgeCategory =
  | "registration"
  | "prerequisites"
  | "schedule"
  | "grading"
  | "course_content"
  | "instructor_contact"
  | "other";

export type KnowledgeRoute =
  | "registrar"
  | "department_admin"
  | "instructor"
  | "advising"
  | "student_support"
  | "escalate";

export type HumanReview = "required" | "conditional" | "not_required";

export type KnowledgeRecord = {
  id: string;
  title: string;
  category: KnowledgeCategory;
  default_route: KnowledgeRoute;
  human_review: HumanReview;
  keywords: string[];
  policy: string;
  review_note: string;
  owner: string;
  source: string;
  updated: string;
};

export type RetrievedKnowledge = {
  record: KnowledgeRecord;
  score: number;
  matched_keywords: string[];
};

export type KnowledgeContextItem = {
  id: string;
  title: string;
  policy: string;
  default_route: KnowledgeRoute;
  human_review: HumanReview;
  review_note: string;
  source: string;
};

const MAX_RESULTS = 3;
const MIN_SCORE = 1.5;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type PreparedKeyword = {
  raw: string;
  normalized: string;
  regex: RegExp;
  weight: number;
};

type PreparedRecord = {
  record: KnowledgeRecord;
  keywords: PreparedKeyword[];
};

const PREPARED_RECORDS: PreparedRecord[] = (knowledgeBase.records as KnowledgeRecord[]).map(
  (record) => ({
    record,
    keywords: record.keywords.map((keyword) => {
      const normalizedKeyword = normalize(keyword);
      return {
        raw: keyword,
        normalized: normalizedKeyword,
        regex: new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, "g"),
        weight: normalizedKeyword.includes(" ") ? 3 : 1.5,
      };
    }),
  })
);

function contextToText(courseContext: unknown): string {
  if (!courseContext || typeof courseContext !== "object" || Array.isArray(courseContext)) {
    return "";
  }

  return Object.values(courseContext as Record<string, unknown>)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ");
}

export function retrieveKnowledge(
  inquiryText: string,
  courseContext?: unknown
): RetrievedKnowledge[] {
  const haystack = normalize(`${inquiryText || ""} ${contextToText(courseContext)}`);

  if (!haystack) {
    return [];
  }

  return PREPARED_RECORDS.map(({ record, keywords }) => {
    const matches = keywords.flatMap((keyword) => {
      const found = haystack.match(keyword.regex);
      return found
        ? [{ keyword, count: Math.min(found.length, 2) }]
        : [];
    });

    const nonOverlappingMatches = matches.filter((candidate, index) =>
      !matches.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.keyword.normalized.length > candidate.keyword.normalized.length &&
          other.keyword.normalized.includes(candidate.keyword.normalized)
      )
    );

    const score = nonOverlappingMatches.reduce(
      (total, match) => total + match.keyword.weight * match.count,
      0
    );
    const matchedKeywords = nonOverlappingMatches.map((match) => match.keyword.raw);

    return {
      record,
      score,
      matched_keywords: matchedKeywords,
    };
  })
    .filter((hit) => hit.score >= MIN_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_RESULTS);
}

export function formatKnowledgeContext(
  hits: RetrievedKnowledge[]
): KnowledgeContextItem[] {
  return hits.map(({ record }) => ({
    id: record.id,
    title: record.title,
    policy: record.policy,
    default_route: record.default_route,
    human_review: record.human_review,
    review_note: record.review_note,
    source: record.source,
  }));
}
