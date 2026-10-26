import { Hono } from "hono";
import {
  formatKnowledgeContext,
  retrieveKnowledge,
  type RetrievedKnowledge,
} from "./knowledge/retrieve";

const app = new Hono<{ Bindings: Env }>();

const LAYA_URL = "http://localhost:8000/v1/systemone";
const LAYA_TIMEOUT_MS = 3000;

const ALLOWED_CATEGORIES = [
  "registration",
  "prerequisites",
  "schedule",
  "grading",
  "course_content",
  "instructor_contact",
  "other",
] as const;

const ALLOWED_ROUTES = [
  "registrar",
  "department_admin",
  "instructor",
  "advising",
  "student_support",
  "escalate",
] as const;

const ALLOWED_CONFIDENCE = ["high", "medium", "low"] as const;
const ALLOWED_RATIONALES = [
  "clear_intent",
  "mixed_topics",
  "ambiguous",
  "policy_dependent",
  "context_needed",
] as const;

type Category = (typeof ALLOWED_CATEGORIES)[number];
type RouteTo = (typeof ALLOWED_ROUTES)[number];
type Confidence = (typeof ALLOWED_CONFIDENCE)[number];
type EscalateToHuman = "yes" | "no";
type Rationale = (typeof ALLOWED_RATIONALES)[number];

type ClassificationResult = {
  category: Category;
  route_to: RouteTo;
  confidence: Confidence;
  escalate_to_human: EscalateToHuman;
  rationale: Rationale;
  source: "model" | "fallback_rules";
};

function isInSet<T extends string>(value: unknown, set: readonly T[]): value is T {
  return typeof value === "string" && (set as readonly string[]).includes(value);
}

function ruleBasedClassify(
  inquiryText: string,
  knowledgeHits: RetrievedKnowledge[] = []
): ClassificationResult {
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

  return {
    category: "other",
    route_to: "escalate",
    confidence: "low",
    escalate_to_human: "yes",
    rationale: "ambiguous",
    source: "fallback_rules",
  };
}

function getAnswerChoice(answers: Record<string, unknown>, key: string): unknown {
  const answer = answers[key];

  if (!answer || typeof answer !== "object" || Array.isArray(answer)) {
    return undefined;
  }

  return (answer as { choice?: unknown }).choice;
}

function validateModelOutput(answers: unknown): { ok: boolean; result?: ClassificationResult } {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { ok: false };
  }

  const answerMap = answers as Record<string, unknown>;
  const category = getAnswerChoice(answerMap, "category");
  const routeTo = getAnswerChoice(answerMap, "route_to");
  const confidence = getAnswerChoice(answerMap, "confidence");
  const escalate = getAnswerChoice(answerMap, "escalate_to_human");
  const rationale = getAnswerChoice(answerMap, "rationale");

  if (
    !isInSet(category, ALLOWED_CATEGORIES) ||
    !isInSet(routeTo, ALLOWED_ROUTES) ||
    !isInSet(confidence, ALLOWED_CONFIDENCE) ||
    !isInSet(rationale, ALLOWED_RATIONALES)
  ) {
    return { ok: false };
  }

  let escalateToHuman: EscalateToHuman = escalate === "yes" ? "yes" : "no";
  if (confidence === "low") {
    escalateToHuman = "yes";
  }

  return {
    ok: true,
    result: {
      category,
      route_to: routeTo,
      confidence,
      escalate_to_human: escalateToHuman,
      rationale,
      source: "model",
    },
  };
}

function buildLayaBody(
  inquiryText: string,
  courseContext: unknown,
  knowledgeHits: RetrievedKnowledge[]
) {
  const knowledgeContext = formatKnowledgeContext(knowledgeHits);
  const hasKnowledge = knowledgeContext.length > 0;
  const categories = {
    registration: "Course registration, add/drop, waitlists, enrollment holds",
    prerequisites: "Prerequisite checks, waivers, course sequencing",
    schedule: "Meeting times, rooms, sections, conflicts, exams",
    grading: "Grades, grade appeals, incomplete, grading policies",
    course_content: "Syllabus, assignments, textbooks, learning materials",
    instructor_contact: "Questions directed to instructor/section issues",
    other: "Unclear or doesn't fit above categories",
  };

  const routes = {
    registrar: "Registrar/Enrollment Services",
    department_admin: "Department/Program Admin",
    instructor: "Course Instructor",
    advising: "Academic Advising",
    student_support: "Student Support/Help Desk",
    escalate: "Escalate to Human Triage",
  };

  return {
    state: {
      inquiry_text: inquiryText,
      course_context: courseContext || {},
      retrieved_policies: knowledgeContext,
      knowledge_guidance: hasKnowledge
        ? "Treat retrieved_policies as the authoritative policy context. Prefer the most relevant policy's default_route. If any selected policy has human_review=required, set escalate_to_human to yes. If policies conflict or the inquiry mixes topics, prefer escalation."
        : "No matching policy was retrieved. Classify from the inquiry text only, and escalate when the decision depends on policy or missing context.",
    },
    questions: {
      category: {
        type: "choice",
        instructions: hasKnowledge
          ? "Classify this course inquiry into the most appropriate category. Use retrieved_policies to resolve terminology and policy-dependent wording."
          : "Classify this course inquiry into the most appropriate category.",
        criteria: categories,
      },
      route_to: {
        type: "choice",
        instructions: hasKnowledge
          ? "Which team should this be routed to? Prefer the default_route of the most relevant retrieved policy; if policies disagree, choose escalate."
          : "Which team should this be routed to?",
        criteria: routes,
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
        instructions: hasKnowledge
          ? "Should this be escalated to a human for review? Policies marked human_review=required must be escalated. Conditional policies may be auto-routed only when the inquiry is routine and well supported."
          : "Should this be escalated to a human for review?",
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

function summarizeKnowledgeHits(hits: RetrievedKnowledge[]) {
  return hits.map(({ record, score, matched_keywords }) => ({
    id: record.id,
    title: record.title,
    score: Number(score.toFixed(2)),
    matched_keywords,
  }));
}

type Course = {
  id: string;
  course_code: string;
  course_name: string;
  description: string | null;
  instructor: string | null;
  credits: number;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

type CreateCourseInput = {
  course_code?: unknown;
  course_name?: unknown;
  description?: unknown;
  instructor?: unknown;
  credits?: unknown;
};

type UpdateValue = string | number | null;

app.get("/api/health", (c) => {
  return c.json({
    status: "ok",
  });
});

app.get("/api/courses", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT
      id,
      course_code,
      course_name,
      description,
      instructor,
      credits,
      status,
      created_at,
      updated_at
    FROM courses
    ORDER BY created_at DESC`
  ).all<Course>();

  return c.json({
    data: results,
  });
});

app.get("/api/courses/:id", async (c) => {
  const id = c.req.param("id");
  const course = await c.env.DB.prepare(
    `SELECT
      id,
      course_code,
      course_name,
      description,
      instructor,
      credits,
      status,
      created_at,
      updated_at
    FROM courses
    WHERE id = ?
    LIMIT 1`
  )
    .bind(id)
    .first<Course>();

  if (!course) {
    return c.json({ error: "Course not found" }, 404);
  }

  return c.json({ data: course });
});

app.post("/api/courses", async (c) => {
  let body: CreateCourseInput;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const courseCode =
    typeof body.course_code === "string" ? body.course_code.trim() : "";
  const courseName =
    typeof body.course_name === "string" ? body.course_name.trim() : "";
  const credits = body.credits;

  if (!courseCode) {
    return c.json({ error: "course_code is required" }, 400);
  }

  if (!courseName) {
    return c.json({ error: "course_name is required" }, 400);
  }

  if (typeof credits !== "number" || !Number.isInteger(credits) || credits <= 0) {
    return c.json({ error: "credits must be a positive integer" }, 400);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const course: Course = {
    id,
    course_code: courseCode,
    course_name: courseName,
    description:
      typeof body.description === "string" ? body.description.trim() : null,
    instructor:
      typeof body.instructor === "string" ? body.instructor.trim() : null,
    credits,
    status: "active",
    created_at: now,
    updated_at: now,
  };

  await c.env.DB.prepare(
    `INSERT INTO courses (
      id,
      course_code,
      course_name,
      description,
      instructor,
      credits,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      course.id,
      course.course_code,
      course.course_name,
      course.description,
      course.instructor,
      course.credits,
      course.status,
      course.created_at,
      course.updated_at
    )
    .run();

  return c.json({ data: course }, 201);
});

app.patch("/api/courses/:id", async (c) => {
  const id = c.req.param("id");
  const existingCourse = await c.env.DB.prepare(
    "SELECT id FROM courses WHERE id = ? LIMIT 1"
  )
    .bind(id)
    .first<{ id: string }>();

  if (!existingCourse) {
    return c.json({ error: "Course not found" }, 404);
  }

  let body: Record<string, unknown>;

  try {
    const parsedBody = await c.req.json();

    if (
      !parsedBody ||
      typeof parsedBody !== "object" ||
      Array.isArray(parsedBody)
    ) {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    body = parsedBody as Record<string, unknown>;
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if ("id" in body || "created_at" in body || "updated_at" in body) {
    return c.json({ error: "id, created_at, and updated_at cannot be modified" }, 400);
  }

  const updates: string[] = [];
  const values: UpdateValue[] = [];

  if ("course_code" in body) {
    if (typeof body.course_code !== "string" || !body.course_code.trim()) {
      return c.json({ error: "course_code cannot be empty" }, 400);
    }

    updates.push("course_code = ?");
    values.push(body.course_code.trim());
  }

  if ("course_name" in body) {
    if (typeof body.course_name !== "string" || !body.course_name.trim()) {
      return c.json({ error: "course_name cannot be empty" }, 400);
    }

    updates.push("course_name = ?");
    values.push(body.course_name.trim());
  }

  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      return c.json({ error: "description must be a string" }, 400);
    }

    updates.push("description = ?");
    values.push(
      typeof body.description === "string" ? body.description.trim() : null
    );
  }

  if ("instructor" in body) {
    if (body.instructor !== null && typeof body.instructor !== "string") {
      return c.json({ error: "instructor must be a string" }, 400);
    }

    updates.push("instructor = ?");
    values.push(
      typeof body.instructor === "string" ? body.instructor.trim() : null
    );
  }

  if ("credits" in body) {
    if (
      typeof body.credits !== "number" ||
      !Number.isInteger(body.credits) ||
      body.credits <= 0
    ) {
      return c.json({ error: "credits must be a positive integer" }, 400);
    }

    updates.push("credits = ?");
    values.push(body.credits);
  }

  if ("status" in body) {
    if (body.status !== "active" && body.status !== "inactive") {
      return c.json({ error: "status must be active or inactive" }, 400);
    }

    updates.push("status = ?");
    values.push(body.status);
  }

  if (updates.length === 0) {
    return c.json({ error: "No valid fields provided" }, 400);
  }

  const updatedAt = new Date().toISOString();
  updates.push("updated_at = ?");
  values.push(updatedAt, id);

  await c.env.DB.prepare(
    `UPDATE courses
    SET ${updates.join(", ")}
    WHERE id = ?`
  )
    .bind(...values)
    .run();

  const updatedCourse = await c.env.DB.prepare(
    `SELECT
      id,
      course_code,
      course_name,
      description,
      instructor,
      credits,
      status,
      created_at,
      updated_at
    FROM courses
    WHERE id = ?
    LIMIT 1`
  )
    .bind(id)
    .first<Course>();

  return c.json({ data: updatedCourse });
});

app.delete("/api/courses/:id", async (c) => {
  const id = c.req.param("id");
  const existingCourse = await c.env.DB.prepare(
    "SELECT id FROM courses WHERE id = ? LIMIT 1"
  )
    .bind(id)
    .first<{ id: string }>();

  if (!existingCourse) {
    return c.json({ error: "Course not found" }, 404);
  }

  await c.env.DB.prepare("DELETE FROM courses WHERE id = ?").bind(id).run();

  return c.body(null, 204);
});

app.post("/api/inquiries/classify", async (c) => {
  let body: unknown;

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const bodyRecord =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const inquiryText =
    typeof bodyRecord.inquiry_text === "string"
      ? bodyRecord.inquiry_text.trim()
      : "";
  const courseContext =
    bodyRecord.course_context &&
    typeof bodyRecord.course_context === "object"
      ? bodyRecord.course_context
      : {};

  if (inquiryText.length < 10 || inquiryText.length > 2000) {
    return c.json(
      { error: "Inquiry text must be between 10 and 2000 characters" },
      400
    );
  }

  const knowledgeHits = retrieveKnowledge(inquiryText, courseContext);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LAYA_TIMEOUT_MS);

  try {
    const res = await fetch(LAYA_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        buildLayaBody(inquiryText, courseContext, knowledgeHits)
      ),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = (await res.json()) as { answers?: unknown };
    const validated = validateModelOutput(data?.answers);

    if (!validated.ok || !validated.result) {
      throw new Error("Invalid model output");
    }

    return c.json({
      status: "routed",
      classification: validated.result,
      knowledge_context: summarizeKnowledgeHits(knowledgeHits),
      ticket: {
        id: `T-${crypto.randomUUID().slice(0, 8)}`,
        destination: validated.result.route_to,
        escalated: validated.result.escalate_to_human === "yes",
      },
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const fallback = ruleBasedClassify(inquiryText, knowledgeHits);

    return c.json({
      status: "routed_with_fallback",
      classification: fallback,
      knowledge_context: summarizeKnowledgeHits(knowledgeHits),
      ticket: {
        id: `T-${crypto.randomUUID().slice(0, 8)}`,
        destination: fallback.route_to,
        escalated: fallback.escalate_to_human === "yes",
      },
      error: err instanceof Error ? err.message : "model_unavailable",
    });
  }
});


export default app;
