import type { Course } from "../types";
import { formatDate } from "../utils";

type CourseTableProps = {
	courses: Course[];
	loading: boolean;
	onRefresh: () => void;
	onCreate: () => void;
	onSelect: (course: Course) => void;
	onEdit: (course: Course) => void;
	onDelete: (course: Course) => void;
};

export function CourseTable({
	courses,
	loading,
	onRefresh,
	onCreate,
	onSelect,
	onEdit,
	onDelete,
}: CourseTableProps) {
	return (
		<div className="panel table-panel">
			<div className="panel-header">
				<h2>All Courses</h2>
				<div className="panel-actions">
					<button type="button" className="primary icon-button" onClick={onCreate}>
						+
					</button>
					<button type="button" onClick={onRefresh} disabled={loading}>
						{loading ? "Loading" : "Refresh"}
					</button>
				</div>
			</div>
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							<th>Code</th>
							<th>Name</th>
							<th>Instructor</th>
							<th>Credits</th>
							<th>Status</th>
							<th>Updated</th>
							<th>Actions</th>
						</tr>
					</thead>
					<tbody>
						{courses.map((course) => (
							<tr key={course.id}>
								<td>{course.course_code}</td>
								<td>{course.course_name}</td>
								<td>{course.instructor ?? "-"}</td>
								<td>{course.credits}</td>
								<td>
									<span className={`status ${course.status}`}>
										{course.status}
									</span>
								</td>
								<td>{formatDate(course.updated_at)}</td>
								<td>
									<div className="row-actions">
										<button type="button" onClick={() => onSelect(course)}>
											View
										</button>
										<button type="button" onClick={() => onEdit(course)}>
											Edit
										</button>
										<button
											type="button"
											className="danger"
											onClick={() => onDelete(course)}
										>
											Delete
										</button>
									</div>
								</td>
							</tr>
						))}
						{courses.length === 0 && (
							<tr>
								<td colSpan={7} className="empty-cell">
									No courses found
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
