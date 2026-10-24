export type CourseStatus = "active" | "inactive";

export type Course = {
	id: string;
	course_code: string;
	course_name: string;
	description: string | null;
	instructor: string | null;
	credits: number;
	status: CourseStatus;
	created_at: string;
	updated_at: string;
};

export type CreateCourseForm = {
	course_code: string;
	course_name: string;
	description: string;
	instructor: string;
	credits: string;
};

export type UpdateCourseForm = CreateCourseForm & {
	status: CourseStatus | "";
};

export type ApiDataResponse<T> = {
	data: T;
};

export type ApiErrorResponse = {
	error?: string;
};

export type CreateCoursePayload = {
	course_code: string;
	course_name: string;
	description?: string;
	instructor?: string;
	credits: number;
};

export type UpdateCoursePayload = Partial<{
	course_code: string;
	course_name: string;
	description: string;
	instructor: string;
	credits: number;
	status: CourseStatus;
}>;
