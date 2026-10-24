const baseUrl = process.env.LAYA_URL || "http://localhost:8000/v1/systemone";

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

async function classifyInquiry(inquiry) {
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      state: {
        inquiry_text: inquiry.text,
        course_context: inquiry.context || {}
      },
      questions: {
        category: {
          type: "choice",
          instructions: "Classify this course inquiry into the most appropriate category.",
          criteria: categories
        },
        route_to: {
          type: "choice",
          instructions: "Which team should this be routed to?",
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
          instructions: "Should this be escalated to a human for review?",
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
