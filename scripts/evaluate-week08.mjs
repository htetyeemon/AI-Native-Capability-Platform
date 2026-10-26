import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import {
  retrieveKnowledge,
  formatKnowledgeContext,
} from "../src/worker/knowledge/retrieve.ts";

const LAYA_URL = process.env.LAYA_URL ?? "http://localhost:8000/v1/systemone";
const REPETITIONS = Number(process.env.REPETITIONS ?? "5");
const IMPROVEMENT = process.env.IMPROVEMENT ?? "context";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MS ?? "60000");
const OUTPUT =
  process.env.OUTPUT ??
  fileURLToPath(new URL("../eval-results-week08.json", import.meta.url));

const dataset = JSON.parse(
  fs.readFileSync(new URL("../eval-cases.json", import.meta.url), "utf8")
);

const CATEGORIES = {
  registration: "Course registration, add/drop, waitlists, enrollment holds",
  prerequisites: "Prerequisite checks, waivers, course sequencing",
  schedule: "Meeting times, rooms, sections, conflicts, exams",
  grading: "Grades, grade appeals, incomplete, grading policies",
  course_content: "Syllabus, assignments, textbooks, learning materials",
  instructor_contact: "Questions directed to instructor/section issues",
  other: "Unclear or doesn't fit above categories",
};

const ROUTES = {
  registrar: "Registrar/Enrollment Services",
  department_admin: "Department/Program Admin",
  instructor: "Course Instructor",
  advising: "Academic Advising",
  student_support: "Student Support/Help Desk",
  escalate: "Escalate to Human Triage",
};

const ALLOWED_CATEGORIES = Object.keys(CATEGORIES);
const ALLOWED_ROUTES = Object.keys(ROUTES);
const ALLOWED_CONFIDENCE = ["high", "medium", "low"];
const ALLOWED_RATIONALES = [
  "clear_intent",
  "mixed_topics",
  "ambiguous",
  "policy_dependent",
  "context_needed",
];

function buildBaselineBody(inquiryText, courseContext) {
  return {
    state: {
      inquiry_text: inquiryText,
      course_context: courseContext || {},
    },
    questions: {
      category: {
        type: "choice",
        instructions:
          "Classify this course inquiry into the most appropriate category.",
        criteria: CATEGORIES,
      },
      route_to: {
        type: "choice",
        instructions: "Which team should this be routed to?",
        criteria: ROUTES,
      },
      confidence: {
        type: "choice",
        instructions: "How confident are you in this classification?",
        criteria: {
          high: "Very confident (>0.8)",
          medium: "Moderately confident (0.5-0.8)",
          low: "Uncertain (<0.5)",
        },
      },
      escalate_to_human: {
        type: "choice",
        instructions: "Should this be escalated to a human for review?",
        criteria: {
          yes: "Yes, needs human judgment",
          no: "No, safe to auto-route",
        },
      },
      rationale: {
        type: "choice",
        instructions: "Select the best explanation for this routing decision.",
        criteria: {
          clear_intent: "Intent is explicit and matches category keywords",
          mixed_topics: "Inquiry mixes multiple topics requiring clarification",
          ambiguous: "Ambiguous phrasing, needs human interpretation",
          policy_dependent: "Requires policy interpretation beyond text",
          context_needed: "Missing course/section context to decide",
        },
      },
    },
  };
}

function buildImprovedBody(inquiryText, courseContext) {
  const body = buildBaselineBody(inquiryText, courseContext);
  const knowledgeHits = retrieveKnowledge(inquiryText, courseContext);
  body.state.retrieved_policies = formatKnowledgeContext(knowledgeHits);

  if (IMPROVEMENT === "context_guidance") {
    body.state.knowledge_guidance =
      "Use retrieved_policies as the authoritative policy context. Prefer the most relevant policy's default_route. If any selected policy has human_review=required, set escalate_to_human to yes. If policies conflict or the inquiry mixes topics, prefer escalation.";
  }

  return { body, knowledgeHits };
}

function ruleBasedClassify(inquiryText, knowledgeHits = [], useKnowledge = false) {
  const text = (inquiryText || "").toLowerCase();

  if (/tuition|bill|invoice|refund|paid|payment|balance/.test(text)) {
    return {
      category: "other",
      route_to: "student_support",
      confidence: "low",
      escalate_to_human: "yes",
      rationale: "policy_dependent",
      source: "fallback_rules",
    };
  }
  if (/prereq|requirement|waiv|take .* before|prerequisite/.test(text)) {
    return {
      category: "prerequisites",
      route_to: "advising",
      confidence: "low",
      escalate_to_human: "yes",
      rationale: "policy_dependent",
      source: "fallback_rules",
    };
  }
  if (/register|enroll|add class|drop class|waitlist|hold|registration/.test(text)) {
    return {
      category: "registration",
      route_to: "registrar",
      confidence: "low",
      escalate_to_human: "yes",
      rationale: "policy_dependent",
      source: "fallback_rules",
    };
  }
  if (/grade|appeal|incomplete|mark|gpa/.test(text)) {
    return {
      category: "grading",
      route_to: "instructor",
      confidence: "low",
      escalate_to_human: "yes",
      rationale: "policy_dependent",
      source: "fallback_rules",
    };
  }
  if (/time|room|section|schedule|conflict|exam|when is|where is/.test(text)) {
    return {
      category: "schedule",
      route_to: "department_admin",
      confidence: "low",
      escalate_to_human: "yes",
      rationale: "context_needed",
      source: "fallback_rules",
    };
  }
  if (/syllabus|assignment|textbook|material|log in|login|portal.*not working|site.*down|canvas|blackboard/.test(text)) {
    return {
      category: "course_content",
      route_to: "student_support",
      confidence: "low",
      escalate_to_human: "yes",
      rationale: "context_needed",
      source: "fallback_rules",
    };
  }
  if (/instructor|professor|teacher|contact.*prof/.test(text)) {
    return {
      category: "instructor_contact",
      route_to: "instructor",
      confidence: "low",
      escalate_to_human: "yes",
      rationale: "clear_intent",
      source: "fallback_rules",
    };
  }

  if (useKnowledge) {
    const topHit = knowledgeHits[0];
    if (topHit && topHit.score >= 3) {
      return {
        category: topHit.record.category,
        route_to: topHit.record.default_route,
        confidence: "low",
        escalate_to_human:
          topHit.record.human_review === "not_required" ? "no" : "yes",
        rationale:
          topHit.record.human_review === "required"
            ? "policy_dependent"
            : "clear_intent",
        source: "fallback_rules",
      };
    }
  }

  return {
    category: "other",
    route_to: "escalate",
    confidence: "low",
    escalate_to_human: "yes",
    rationale: "ambiguous",
    source: "fallback_rules",
  };
}

function getChoice(answers, key) {
  const answer = answers?.[key];
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
    return undefined;
  }
  return answer.choice;
}

function validateModelOutput(answers) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return null;
  }

  const category = getChoice(answers, "category");
  const routeTo = getChoice(answers, "route_to");
  const confidence = getChoice(answers, "confidence");
  const escalate = getChoice(answers, "escalate_to_human");
  const rationale = getChoice(answers, "rationale");

  if (
    !ALLOWED_CATEGORIES.includes(category) ||
    !ALLOWED_ROUTES.includes(routeTo) ||
    !ALLOWED_CONFIDENCE.includes(confidence) ||
    !ALLOWED_RATIONALES.includes(rationale)
  ) {
    return null;
  }

  let escalateToHuman = escalate === "yes" ? "yes" : "no";
  if (confidence === "low") {
    escalateToHuman = "yes";
  }

  return {
    category,
    route_to: routeTo,
    confidence,
    escalate_to_human: escalateToHuman,
    rationale,
    source: "model",
  };
}

async function callLaya(body) {
  const started = performance.now();
  const response = await fetch(LAYA_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  const decision = validateModelOutput(data?.answers);
  if (!decision) {
    throw new Error("Invalid model output");
  }

  return {
    decision,
    latency_ms: performance.now() - started,
    usage: data.usage ?? null,
  };
}

function routingFields() {
  return ["category", "route_to", "escalate_to_human"];
}

function strictFields() {
  return [
    "category",
    "route_to",
    "confidence",
    "escalate_to_human",
    "rationale",
    "source",
  ];
}

function matches(actual, expected, fields) {
  return fields.every((field) => actual[field] === expected[field]);
}

async function runCase(version, testCase) {
  const inquiryText = testCase.input.inquiry_text;
  const courseContext = testCase.input.course_context;
  const knowledgeHits = retrieveKnowledge(inquiryText, courseContext);
  const knowledgeIds = knowledgeHits.map((hit) => hit.record.id);

  if (testCase.case_type === "fallback") {
    const started = performance.now();
    const decision =
      version === "baseline"
        ? ruleBasedClassify(inquiryText)
        : ruleBasedClassify(inquiryText, knowledgeHits, true);
    return {
      decision,
      latency_ms: performance.now() - started,
      usage: { input_tokens: 0, output_tokens: 0 },
      knowledge_ids: version === "baseline" ? [] : knowledgeIds,
      path: "fallback_simulated",
      model_error: null,
    };
  }

  try {
    const body =
      version === "baseline"
        ? buildBaselineBody(inquiryText, courseContext)
        : buildImprovedBody(inquiryText, courseContext).body;
    const result = await callLaya(body);
    return {
      ...result,
      knowledge_ids: version === "baseline" ? [] : knowledgeIds,
      path: "model",
      model_error: null,
    };
  } catch (error) {
    const decision =
      version === "baseline"
        ? ruleBasedClassify(inquiryText)
        : ruleBasedClassify(inquiryText, knowledgeHits, true);
    return {
      decision,
      latency_ms: 0,
      usage: { input_tokens: 0, output_tokens: 0 },
      knowledge_ids: version === "baseline" ? [] : knowledgeIds,
      path: "fallback_after_model_error",
      model_error: error instanceof Error ? error.message : String(error),
    };
  }
}

function percentile(values, p) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

function summarize(values) {
  if (values.length === 0) {
    return { count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    min_ms: Number(sorted[0].toFixed(2)),
    median_ms: Number(percentile(sorted, 50).toFixed(2)),
    mean_ms: Number((sum / sorted.length).toFixed(2)),
    p95_ms: Number(percentile(sorted, 95).toFixed(2)),
    max_ms: Number(sorted[sorted.length - 1].toFixed(2)),
  };
}

function usageSummary(records) {
  const modelRecords = records.filter((record) => record.path === "model");
  const inputTokens = modelRecords.reduce(
    (total, record) => total + (record.usage?.input_tokens ?? 0),
    0
  );
  const outputTokens = modelRecords.reduce(
    (total, record) => total + (record.usage?.output_tokens ?? 0),
    0
  );
  return {
    model_requests: modelRecords.length,
    input_tokens_total: inputTokens,
    output_tokens_total: outputTokens,
    avg_input_tokens_per_model_request:
      modelRecords.length > 0
        ? Number((inputTokens / modelRecords.length).toFixed(2))
        : 0,
    avg_output_tokens_per_model_request:
      modelRecords.length > 0
        ? Number((outputTokens / modelRecords.length).toFixed(2))
        : 0,
    pricing: "N/A - self-hosted Laya; no metered API pricing",
  };
}

async function checkHealth() {
  const healthUrl = new URL("/health", LAYA_URL).href;
  const response = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) {
    throw new Error(`Laya health check failed: HTTP ${response.status}`);
  }
  return response.json();
}

async function warmup() {
  for (let index = 0; index < 2; index += 1) {
    await callLaya(
      buildBaselineBody("Warm up question about course registration.", {})
    );
  }
}

const health = await checkHealth();
console.log(
  `Laya health: ${health.status}; device: ${health.device}; loaded: ${(health.loaded || []).join(", ")}`
);
await warmup();
console.log("Warmup complete. Starting measurement...");

const records = { baseline: [], improved: [] };

for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
  for (const testCase of dataset.cases) {
    const baseline = await runCase("baseline", testCase);
    records.baseline.push({ case_id: testCase.case_id, repetition, ...baseline });

    const improved = await runCase("improved", testCase);
    records.improved.push({ case_id: testCase.case_id, repetition, ...improved });
  }
  console.log(`Completed repetition ${repetition}/${REPETITIONS}`);
}

function buildVersionSummary(version) {
  const versionRecords = records[version];
  const caseIds = dataset.cases.map((testCase) => testCase.case_id);
  const cases = [];

  for (const caseId of caseIds) {
    const testCase = dataset.cases.find((item) => item.case_id === caseId);
    const caseRecords = versionRecords.filter((record) => record.case_id === caseId);
    const first = caseRecords[0];
    const uniqueDecisions = new Set(
      caseRecords.map((record) => JSON.stringify(record.decision))
    );

    cases.push({
      case_id: caseId,
      case_type: testCase.case_type,
      expected: testCase.expected_decision,
      actual_first: first.decision,
      routing_correct: matches(
        first.decision,
        testCase.expected_decision,
        routingFields()
      ),
      strict_correct: matches(
        first.decision,
        testCase.expected_decision,
        strictFields()
      ),
      stable_across_repetitions: uniqueDecisions.size === 1,
      paths: [...new Set(caseRecords.map((record) => record.path))],
      model_errors: [
        ...new Set(caseRecords.map((record) => record.model_error).filter(Boolean)),
      ],
      knowledge_ids: first.knowledge_ids,
      latency: summarize(caseRecords.map((record) => record.latency_ms)),
    });
  }

  const routingCorrect = cases.filter((testCase) => testCase.routing_correct).length;
  const strictCorrect = cases.filter((testCase) => testCase.strict_correct).length;
  const allLatencies = versionRecords.map((record) => record.latency_ms);
  const modelLatencies = versionRecords
    .filter((record) => record.path === "model")
    .map((record) => record.latency_ms);

  return {
    cases,
    accuracy: {
      routing_correct_cases: routingCorrect,
      strict_correct_cases: strictCorrect,
      total_cases: cases.length,
      routing_accuracy_percent: Number(
        ((routingCorrect / cases.length) * 100).toFixed(2)
      ),
      strict_accuracy_percent: Number(
        ((strictCorrect / cases.length) * 100).toFixed(2)
      ),
    },
    latency: {
      all_requests: summarize(allLatencies),
      model_requests: summarize(modelLatencies),
    },
    usage: usageSummary(versionRecords),
  };
}

const summary = {
  generated_at: new Date().toISOString(),
  capability: "Week 08 course inquiry classification (Laya + fallback)",
  improvement:
    IMPROVEMENT === "context_guidance"
      ? "More relevant grounding context: retrieved policy records plus usage guidance in model state"
      : "More relevant grounding context: retrieved policy records in model state",
  repetitions: REPETITIONS,
  total_cases: dataset.cases.length,
  correctness_definition: {
    routing:
      "category, route_to, and escalate_to_human all match the pre-defined expected decision",
    strict:
      "category, route_to, confidence, escalate_to_human, rationale, and source all match the pre-defined expected decision",
  },
  fallback_simulation:
    "Cases marked fallback are run through the local fallback path without calling Laya; all other cases call Laya and fall back only on error.",
  health,
  before: buildVersionSummary("baseline"),
  after: buildVersionSummary("improved"),
  raw_records: records,
};

fs.writeFileSync(OUTPUT, JSON.stringify(summary, null, 2));

console.log("\n=== SUMMARY ===");
for (const version of ["before", "after"]) {
  const data = summary[version];
  console.log(`${version}:`);
  console.log(
    `  routing accuracy: ${data.accuracy.routing_correct_cases}/${data.accuracy.total_cases} (${data.accuracy.routing_accuracy_percent}%)`
  );
  console.log(
    `  strict accuracy:  ${data.accuracy.strict_correct_cases}/${data.accuracy.total_cases} (${data.accuracy.strict_accuracy_percent}%)`
  );
  console.log(
    `  p95 latency (all): ${data.latency.all_requests.p95_ms} ms; model-only: ${data.latency.model_requests.p95_ms} ms`
  );
}
console.log(`\nResults written to ${OUTPUT}`);
