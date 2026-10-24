import type { Course } from "../types";
import { formatDate } from "../utils";

type CourseDetailProps = {
	course: Course | null;
};

export function CourseDetail({ course }: CourseDetailProps) {
	return (
		<div className="detail-panel">
			{course ? (
				<dl>
					<dt>ID</dt>
					<dd>{course.id}</dd>
					<dt>Code</dt>
					<dd>{course.course_code}</dd>
					<dt>Name</dt>
					<dd>{course.course_name}</dd>
					<dt>Description</dt>
					<dd>{course.description ?? "-"}</dd>
					<dt>Instructor</dt>
					<dd>{course.instructor ?? "-"}</dd>
					<dt>Credits</dt>
					<dd>{course.credits}</dd>
					<dt>Status</dt>
					<dd>{course.status}</dd>
					<dt>Created</dt>
					<dd>{formatDate(course.created_at)}</dd>
					<dt>Updated</dt>
					<dd>{formatDate(course.updated_at)}</dd>
				</dl>
			) : (
				<p className="muted">Select or look up a course.</p>
			)}
		</div>
	);
}
