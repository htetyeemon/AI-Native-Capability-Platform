import { readFileSync } from "node:fs";

const baseUrl = process.env.LAYA_URL || "http://localhost:8000/v1/systemone";

const knowledgeBase = JSON.parse(
  readFileSync(
    new URL("../src/worker/knowledge/course-policies.json", import.meta.url),
    "utf8"
  )
);

const MAX_KNOWLEDGE_RESULTS = 3;
const MIN_KNOWLEDGE_SCORE = 1.5;

const categories = {
  registration: "Course registration, add/drop, waitlists, enrollment holds",
  prerequisites: "Prerequisite checks, waivers, course sequencing",
  schedule: "Meeting times, rooms, sections, conflicts, exams",
  grading: "Grades, grade appeals, incomplete, grading policies",
  course_content: "Syllabus, assignments, textbooks, learning materials",
  instructor_contact: "Questions directed to instructor/section issues",
  other: "Unclear or doesn't fit above categories"
};

const routes = {
  registrar: "Registrar/Enrollment Services",
  department_admin: "Department/Program Admin",
  instructor: "Course Instructor",
  advising: "Academic Advising",
  student_support: "Student Support/Help Desk",
  escalate: "Escalate to Human Triage"
};

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function retrieveKnowledge(inquiryText, courseContext) {
  const contextText =
    courseContext && typeof courseContext === "object"
      ? Object.values(courseContext)
          .filter((value) => typeof value === "string")
          .join(" ")
      : "";
  const haystack = normalize(`${inquiryText || ""} ${contextText}`);

  if (!haystack) {
    return [];
  }

  return knowledgeBase.records
    .map((record) => {
      let score = 0;
      const matchedKeywords = [];

      for (const keyword of record.keywords) {
        const normalizedKeyword = normalize(keyword);
        if (!normalizedKeyword) {
          continue;
        }

        const regex = new RegExp(
          `\\b${escapeRegExp(normalizedKeyword)}\\b`,
          "g"
        );
        const matches = haystack.match(regex);

        if (!matches) {
          continue;
        }

        score += (normalizedKeyword.includes(" ") ? 3 : 1.5) * Math.min(matches.length, 2);
        matchedKeywords.push(keyword);
      }

      return { record, score, matched_keywords: matchedKeywords };
    })
    .filter((hit) => hit.score >= MIN_KNOWLEDGE_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_KNOWLEDGE_RESULTS);
}

function formatKnowledgeContext(hits) {
  return hits.map(({ record }) => ({
    id: record.id,
    title: record.title,
    policy: record.policy,
    default_route: record.default_route,
    human_review: record.human_review,
    review_note: record.review_note,
    source: record.source
  }));
}

async function classifyInquiry(inquiry) {
  const knowledgeContext = formatKnowledgeContext(
    retrieveKnowledge(inquiry.text, inquiry.context)
  );
  const hasKnowledge = knowledgeContext.length > 0;

  console.log(
    "Retrieved knowledge:",
    knowledgeContext.map((record) => record.id).join(", ") || "none"
  );

  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      state: {
        inquiry_text: inquiry.text,
        course_context: inquiry.context || {},
        retrieved_policies: knowledgeContext,
        knowledge_guidance: hasKnowledge
          ? "Treat retrieved_policies as the authoritative policy context. Prefer the most relevant policy's default_route. If any selected policy has human_review=required, set escalate_to_human to yes. If policies conflict or the inquiry mixes topics, prefer escalation."
          : "No matching policy was retrieved. Classify from the inquiry text only, and escalate when the decision depends on policy or missing context."
      },
      questions: {
        category: {
          type: "choice",
          instructions: hasKnowledge
            ? "Classify this course inquiry into the most appropriate category. Use retrieved_policies to resolve terminology and policy-dependent wording."
            : "Classify this course inquiry into the most appropriate category.",
          criteria: categories
        },
        route_to: {
          type: "choice",
          instructions: hasKnowledge
            ? "Which team should this be routed to? Prefer the default_route of the most relevant retrieved policy; if policies disagree, choose escalate."
            : "Which team should this be routed to?",
          criteria: routes
        },
        confidence: {
          type: "choice",
          instructions: "How confident are you in this classification?",
          criteria: {
            high: "Very confident (>0.8)",
            medium: "Moderately confident (0.5-0.8)",
            low: "Uncertain (<0.5)"
          }
        },
        escalate_to_human: {
          type: "choice",
          instructions: hasKnowledge
            ? "Should this be escalated to a human for review? Policies marked human_review=required must be escalated. Conditional policies may be auto-routed only when the inquiry is routine and well supported."
            : "Should this be escalated to a human for review?",
          criteria: {
            yes: "Yes, needs human judgment",
            no: "No, safe to auto-route"
          }
        },
        rationale: {
          type: "choice",
          instructions: "Select the best explanation for this routing decision.",
          criteria: {
            clear_intent: "Intent is explicit and matches category keywords",
            mixed_topics: "Inquiry mixes multiple topics requiring clarification",
            ambiguous: "Ambiguous phrasing, needs human interpretation",
            policy_dependent: "Requires policy interpretation beyond text",
            context_needed: "Missing course/section context to decide"
          }
        }
      }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Laya error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.answers;
}

const testInputs = [
  {
    text: "Can I take CS101 without the prerequisite?",
    context: { course_code: "CS201", course_name: "Data Structures" }
  },
  {
    text: "The portal says I owe tuition but I already paid yesterday. What's going on?",
    context: {}
  },
  {
    text: "What time is my Tuesday section for MATH 250 and which room?",
    context: { course_code: "MATH250" }
  },
  {
    text: "I need to appeal my midterm grade, could you tell me the process?",
    context: { instructor: "Dr. Smith" }
  },
  {
    text: "I can't log into the course site and the assignment isn't showing up at all.",
    context: {}
  }
];

async function runTests() {
  for (let i = 0; i < testInputs.length; i++) {
    console.log(`\n=== Test ${i + 1} ===`);
    console.log(`Input: ${testInputs[i].text}`);
    try {
      const result = await classifyInquiry(testInputs[i]);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error("Error:", err.message);
    }
  }
}

runTests();
