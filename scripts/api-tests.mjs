import assert from "node:assert/strict";

const baseUrl = process.env.BASE_URL ?? "http://localhost:5173";
const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const createdIds = new Set();

async function request(method, path, body, headers = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    body: json,
  };
}

async function requestRaw(method, path, rawBody) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: rawBody,
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  return {
    status: response.status,
    body: json,
  };
}

async function createCourse(overrides = {}) {
  const result = await request("POST", "/api/courses", {
    course_code: `QA-${unique}`,
    course_name: "QA Test Course",
    description: "Created by API test",
    instructor: "QA Runner",
    credits: 3,
    ...overrides,
  });

  assert.equal(result.status, 201);
  assert.ok(result.body.data.id);
  createdIds.add(result.body.data.id);

  return result.body.data;
}

async function cleanup() {
  for (const id of createdIds) {
    await fetch(`${baseUrl}/api/courses/${id}`, { method: "DELETE" });
  }
}

const tests = [
  {
    name: "GET /api/courses returns course list",
    run: async () => {
      const result = await request("GET", "/api/courses");

      assert.equal(result.status, 200);
      assert.ok(Array.isArray(result.body.data));
    },
  },
  {
    name: "POST /api/courses creates a valid course",
    run: async () => {
      const course = await createCourse({
        course_code: `QA-CREATE-${unique}`,
      });

      assert.equal(course.course_code, `QA-CREATE-${unique}`);
      assert.equal(course.course_name, "QA Test Course");
      assert.equal(course.credits, 3);
      assert.equal(course.status, "active");
      assert.ok(course.created_at);
      assert.ok(course.updated_at);
    },
  },
  {
    name: "POST /api/courses rejects missing course_code",
    run: async () => {
      const result = await request("POST", "/api/courses", {
        course_name: "Missing Code",
        credits: 3,
      });

      assert.equal(result.status, 400);
      assert.equal(result.body.error, "course_code is required");
    },
  },
  {
    name: "POST /api/courses rejects empty course_code",
    run: async () => {
      const result = await request("POST", "/api/courses", {
        course_code: "   ",
        course_name: "Empty Code",
        credits: 3,
      });

      assert.equal(result.status, 400);
      assert.equal(result.body.error, "course_code is required");
    },
  },
  {
    name: "POST /api/courses rejects missing course_name",
    run: async () => {
      const result = await request("POST", "/api/courses", {
        course_code: `QA-MISSING-NAME-${unique}`,
        credits: 3,
      });

      assert.equal(result.status, 400);
      assert.equal(result.body.error, "course_name is required");
    },
  },
  {
    name: "POST /api/courses rejects invalid credits",
    run: async () => {
      const invalidCredits = [0, -1, 1.5, "3"];

      for (const credits of invalidCredits) {
        const result = await request("POST", "/api/courses", {
          course_code: `QA-BAD-CREDITS-${unique}-${String(credits)}`,
          course_name: "Bad Credits",
          credits,
        });

        assert.equal(result.status, 400);
        assert.equal(result.body.error, "credits must be a positive integer");
      }
    },
  },
  {
    name: "POST /api/courses rejects malformed JSON",
    run: async () => {
      const result = await requestRaw("POST", "/api/courses", "{bad json");

      assert.equal(result.status, 400);
      assert.equal(result.body.error, "Invalid JSON body");
    },
  },
  {
    name: "GET /api/courses/:id returns an existing course",
    run: async () => {
      const course = await createCourse({
        course_code: `QA-GET-${unique}`,
      });
      const result = await request("GET", `/api/courses/${course.id}`);

      assert.equal(result.status, 200);
      assert.equal(result.body.data.id, course.id);
      assert.equal(result.body.data.course_code, `QA-GET-${unique}`);
    },
  },
  {
    name: "GET /api/courses/:id returns 404 for invalid ID",
    run: async () => {
      const result = await request("GET", "/api/courses/not-a-real-id");

      assert.equal(result.status, 404);
      assert.equal(result.body.error, "Course not found");
    },
  },
  {
    name: "PATCH /api/courses/:id updates allowed fields",
    run: async () => {
      const course = await createCourse({
        course_code: `QA-PATCH-${unique}`,
      });
      const result = await request("PATCH", `/api/courses/${course.id}`, {
        course_code: `QA-PATCHED-${unique}`,
        course_name: "Patched Course",
        description: "Updated description",
        instructor: "Updated Instructor",
        credits: 4,
        status: "inactive",
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.data.course_code, `QA-PATCHED-${unique}`);
      assert.equal(result.body.data.course_name, "Patched Course");
      assert.equal(result.body.data.description, "Updated description");
      assert.equal(result.body.data.instructor, "Updated Instructor");
      assert.equal(result.body.data.credits, 4);
      assert.equal(result.body.data.status, "inactive");
      assert.notEqual(result.body.data.updated_at, course.updated_at);
    },
  },
  {
    name: "PATCH /api/courses/:id rejects invalid credits",
    run: async () => {
      const course = await createCourse({
        course_code: `QA-PATCH-BAD-CREDITS-${unique}`,
      });
      const result = await request("PATCH", `/api/courses/${course.id}`, {
        credits: 0,
      });

      assert.equal(result.status, 400);
      assert.equal(result.body.error, "credits must be a positive integer");
    },
  },
  {
    name: "PATCH /api/courses/:id rejects invalid status",
    run: async () => {
      const course = await createCourse({
        course_code: `QA-PATCH-BAD-STATUS-${unique}`,
      });
      const result = await request("PATCH", `/api/courses/${course.id}`, {
        status: "draft",
      });

      assert.equal(result.status, 400);
      assert.equal(result.body.error, "status must be active or inactive");
    },
  },
  {
    name: "PATCH /api/courses/:id rejects protected fields",
    run: async () => {
      const course = await createCourse({
        course_code: `QA-PATCH-PROTECTED-${unique}`,
      });
      const result = await request("PATCH", `/api/courses/${course.id}`, {
        id: "new-id",
      });

      assert.equal(result.status, 400);
      assert.equal(
        result.body.error,
        "id, created_at, and updated_at cannot be modified"
      );
    },
  },
  {
    name: "PATCH /api/courses/:id rejects empty update body",
    run: async () => {
      const course = await createCourse({
        course_code: `QA-PATCH-EMPTY-${unique}`,
      });
      const result = await request("PATCH", `/api/courses/${course.id}`, {});

      assert.equal(result.status, 400);
      assert.equal(result.body.error, "No valid fields provided");
    },
  },
  {
    name: "PATCH /api/courses/:id returns 404 for invalid ID",
    run: async () => {
      const result = await request("PATCH", "/api/courses/not-a-real-id", {
        course_name: "No Course",
      });

      assert.equal(result.status, 404);
      assert.equal(result.body.error, "Course not found");
    },
  },
  {
    name: "DELETE /api/courses/:id deletes an existing course",
    run: async () => {
      const course = await createCourse({
        course_code: `QA-DELETE-${unique}`,
      });
      const deleteResult = await request("DELETE", `/api/courses/${course.id}`);
      const getResult = await request("GET", `/api/courses/${course.id}`);

      createdIds.delete(course.id);
      assert.equal(deleteResult.status, 204);
      assert.equal(deleteResult.body, null);
      assert.equal(getResult.status, 404);
      assert.equal(getResult.body.error, "Course not found");
    },
  },
  {
    name: "DELETE /api/courses/:id returns 404 for invalid ID",
    run: async () => {
      const result = await request("DELETE", "/api/courses/not-a-real-id");

      assert.equal(result.status, 404);
      assert.equal(result.body.error, "Course not found");
    },
  },
  {
    name: "SQL-like input is handled as plain text",
    run: async () => {
      const result = await request("GET", "/api/courses/' OR 1=1 --");

      assert.equal(result.status, 404);
      assert.equal(result.body.error, "Course not found");
    },
  },
];

let failed = 0;

try {
  for (const test of tests) {
    try {
      await test.run();
      console.log(`PASS ${test.name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL ${test.name}`);
      console.error(error);
    }
  }
} finally {
  await cleanup();
}

if (failed > 0) {
  console.error(`${failed} test(s) failed`);
  process.exit(1);
}

console.log(`${tests.length} test(s) passed`);
