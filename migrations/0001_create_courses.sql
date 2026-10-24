-- Migration number: 0001 	 2026-08-23T11:14:08.656Z
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
