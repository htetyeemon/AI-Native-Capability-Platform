import type { FormEvent } from "react";
import type {
	CourseStatus,
	UpdateCourseForm as UpdateCourseFormState,
} from "../types";

type UpdateCourseFormProps = {
	form: UpdateCourseFormState;
	onFieldChange: (field: keyof UpdateCourseFormState, value: string) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onCancel: () => void;
};

export function UpdateCourseForm({
	form,
	onFieldChange,
	onSubmit,
	onCancel,
}: UpdateCourseFormProps) {
	return (
		<form className="form-panel" onSubmit={onSubmit}>
			<div className="field-grid">
				<label>
					Course Code
					<input
						value={form.course_code}
						onChange={(event) =>
							onFieldChange("course_code", event.target.value)
						}
					/>
				</label>
				<label>
					Course Name
					<input
						value={form.course_name}
						onChange={(event) =>
							onFieldChange("course_name", event.target.value)
						}
					/>
				</label>
				<label>
					Credits
					<input
						type="number"
						min="1"
						step="1"
						value={form.credits}
						onChange={(event) => onFieldChange("credits", event.target.value)}
					/>
				</label>
				<label>
					Status
					<select
						value={form.status}
						onChange={(event) =>
							onFieldChange("status", event.target.value as CourseStatus | "")
						}
					>
						<option value="">No change</option>
						<option value="active">active</option>
						<option value="inactive">inactive</option>
					</select>
				</label>
				<label>
					Instructor
					<input
						value={form.instructor}
						onChange={(event) =>
							onFieldChange("instructor", event.target.value)
						}
					/>
				</label>
				<label className="span-2">
					Description
					<textarea
						value={form.description}
						onChange={(event) =>
							onFieldChange("description", event.target.value)
						}
					/>
				</label>
			</div>
			<div className="form-actions">
				<button type="button" onClick={onCancel}>
					Cancel
				</button>
				<button type="submit">Update</button>
			</div>
		</form>
	);
}
