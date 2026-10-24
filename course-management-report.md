# Course Management Project Report

## Project Idea and Problem

The project is a Course Management web application for storing and managing course information. It solves the problem of keeping course records in a simple, centralized system instead of tracking them manually in spreadsheets or separate documents.

The application allows a user to:

- View all courses
- Create a new course
- View course details
- Update course information
- Delete a course
- Track whether a course is active or inactive

The system is built with React for the frontend, Hono for the backend API, Cloudflare Workers for deployment, and Cloudflare D1 as the database.

## Data Model / D1 Schema

The application uses one main D1 table: `courses`.

```sql
CREATE TABLE courses (
  id TEXT PRIMARY KEY,
  course_code TEXT NOT NULL UNIQUE,
  course_name TEXT NOT NULL,
  description TEXT,
  instructor TEXT,
  credits INTEGER NOT NULL
    CHECK(credits > 0),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK(status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_courses_status
ON courses(status);
```

### Field Explanation

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | `TEXT` | Unique course ID generated with `crypto.randomUUID()` |
| `course_code` | `TEXT` | Unique course code, such as `SE201` |
| `course_name` | `TEXT` | Course title |
| `description` | `TEXT` | Optional course description |
| `instructor` | `TEXT` | Optional instructor name |
| `credits` | `INTEGER` | Number of course credits; must be greater than 0 |
| `status` | `TEXT` | Course status: `active` or `inactive` |
| `created_at` | `TEXT` | ISO timestamp for when the course was created |
| `updated_at` | `TEXT` | ISO timestamp for the latest update |

The schema uses constraints to protect data quality. For example, `course_code` must be unique, `credits` must be positive, and `status` can only be `active` or `inactive`.

## API Endpoints

The backend API is implemented in `src/worker/index.ts` using Hono.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Checks whether the API is running |
| `GET` | `/api/courses` | Returns all courses ordered by newest first |
| `GET` | `/api/courses/:id` | Returns one course by ID |
| `POST` | `/api/courses` | Creates a new course |
| `PATCH` | `/api/courses/:id` | Updates an existing course |
| `DELETE` | `/api/courses/:id` | Deletes a course |

### Example Create Request

```json
{
  "course_code": "SE201",
  "course_name": "Web Application Development",
  "description": "Learn web application development",
  "instructor": "Dr. Smith",
  "credits": 3
}
```

### Validation Rules

The API validates incoming data before saving it to D1:

- `course_code` is required and cannot be empty.
- `course_name` is required and cannot be empty.
- `credits` must be a positive integer.
- `status` must be either `active` or `inactive`.
- Protected fields such as `id`, `created_at`, and `updated_at` cannot be modified.
- Malformed JSON returns a `400` error.
- Unknown course IDs return a `404` error.

The API uses prepared D1 statements with `.bind(...)`, which helps avoid SQL injection issues.

## Development Process

1. Started from a React, Vite, Hono, and Cloudflare Workers template.
2. Added Cloudflare D1 configuration in `wrangler.json`.
3. Created the D1 migration file in `migrations/0001_create_courses.sql`.
4. Implemented the backend CRUD API in `src/worker/index.ts`.
5. Added TypeScript types for course data and API payloads.
6. Built frontend API helper functions in `src/react-app/api.ts`.
7. Created React UI components for the course table, detail view, create form, update form, modal, and alerts.
8. Connected the frontend to the backend API.
9. Added validation and error handling on the backend.
10. Added automated API tests in `scripts/api-tests.mjs`.
11. Prepared the project for Cloudflare Workers deployment.

## Important AI Prompts Used

These are the most important AI prompts used during development:

```text
I am building a Course Management API using Cloudflare Workers, Hono, Cloudflare D1, and TypeScript. Design a REST API for create, list, get by ID, update, and delete courses. For each endpoint provide method, endpoint, request body, response body, and status code.
```

```text
Design a D1 schema for courses with course code, name, description, instructor, credits, status, created timestamp, and updated timestamp.
```

```text
Implement Hono API endpoints for creating, reading, updating, and deleting courses using Cloudflare D1 prepared statements.
```

```text
Add validation so course_code and course_name are required, credits must be a positive integer, and status must be active or inactive.
```

```text
Act as a QA engineer. Design test casess for GET, GET by ID, POST, PATCH, DELETE, validation errors, invalid IDs, boundary cases, and unexpected input.
```

## Problems Encountered and Solutions

### Problem 1 : Preventing invalid course data

Users could send empty course codes, missing course names, invalid credits, or invalid statuses.

**Solution:** Added backend validation in the Hono routes. The API now returns clear `400` error messages for invalid input.

### Problem 2: /api/health showed the default frontend page

The API route was being handled by the frontend SPA fallback instead of the Worker route.

**Solution:** I updated wrangler.json to force API routes through the Worker first:

"run_worker_first": [
  "/api/*"
]

### Problem 3:  Frontend became too large in one file

The first React UI placed too much logic and markup inside App.tsx.

**Solution:** I refactored the frontend into smaller components:

CourseTable
CourseDetail
CreateCourseForm
UpdateCourseForm
Modal
Alert
I also moved API calls into api.ts and shared types into types.ts.


## Production API Testing / Screenshots

## Short Reflection on How AI Helped

AI helped by breaking the project into clear steps. It helped design the REST API contract, generate endpoint logic, identify validation rules, and refactor the frontend into reusable React components.

AI was especially useful when debugging problems such as the SPA fallback issue, TypeScript validation problems, and organizing the frontend UI into cleaner components. Instead of only generating code, AI helped explain the reasoning behind each step, which made the project easier to understand and improve.

Overall, AI acted like a development assistant and reviewer. It helped speed up implementation while still keeping the code structured, tested, and easier to maintain.