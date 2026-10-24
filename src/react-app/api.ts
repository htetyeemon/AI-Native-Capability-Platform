import type {
	ApiDataResponse,
	ApiErrorResponse,
	Course,
	CreateCoursePayload,
	UpdateCoursePayload,
} from "./types";

async function readJson<T>(response: Response): Promise<T | null> {
	const text = await response.text();
	return text ? (JSON.parse(text) as T) : null;
}

async function apiRequest<T>(
	path: string,
	options: RequestInit = {},
): Promise<T> {
	const response = await fetch(path, {
		headers: {
			"content-type": "application/json",
			...options.headers,
		},
		...options,
	});
	const body = await readJson<T & ApiErrorResponse>(response);

	if (!response.ok) {
		throw new Error(body?.error ?? `Request failed with ${response.status}`);
	}

	return body as T;
}

export async function getCourses() {
	const result = await apiRequest<ApiDataResponse<Course[]>>("/api/courses");
	return result.data;
}

export async function getCourse(id: string) {
	const result = await apiRequest<ApiDataResponse<Course>>(
		`/api/courses/${encodeURIComponent(id)}`,
	);
	return result.data;
}

export async function createCourse(payload: CreateCoursePayload) {
	const result = await apiRequest<ApiDataResponse<Course>>("/api/courses", {
		method: "POST",
		body: JSON.stringify(payload),
	});
	return result.data;
}

export async function updateCourse(id: string, payload: UpdateCoursePayload) {
	const result = await apiRequest<ApiDataResponse<Course>>(
		`/api/courses/${encodeURIComponent(id)}`,
		{
			method: "PATCH",
			body: JSON.stringify(payload),
		},
	);
	return result.data;
}

export async function deleteCourse(id: string) {
	const response = await fetch(`/api/courses/${encodeURIComponent(id)}`, {
		method: "DELETE",
	});

	if (!response.ok) {
		const body = await readJson<ApiErrorResponse>(response);
		throw new Error(body?.error ?? `Request failed with ${response.status}`);
	}
}
