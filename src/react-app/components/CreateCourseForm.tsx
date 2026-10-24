import type { FormEvent } from "react";
import type { CreateCourseForm as CreateCourseFormState } from "../types";

type CreateCourseFormProps = {
	form: CreateCourseFormState;
	onFieldChange: (field: keyof CreateCourseFormState, value: string) => void;
	onSubmit: (event: FormEvent<HTMLFormElement>) => void;
	onCancel: () => void;
};

export function CreateCourseForm({
	form,
	onFieldChange,
	onSubmit,
	onCancel,
}: CreateCourseFormProps) {
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
						placeholder="SE201"
						required
					/>
				</label>
				<label>
					Course Name
					<input
						value={form.course_name}
						onChange={(event) =>
							onFieldChange("course_name", event.target.value)
						}
						placeholder="Web Application Development"
						required
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
						required
					/>
				</label>
				<label>
					Instructor
					<input
						value={form.instructor}
						onChange={(event) =>
							onFieldChange("instructor", event.target.value)
						}
						placeholder="Dr. Smith"
					/>
				</label>
				<label className="span-2">
					Description
					<textarea
						value={form.description}
						onChange={(event) =>
							onFieldChange("description", event.target.value)
						}
						placeholder="Learn web application development"
					/>
				</label>
			</div>
			<div className="form-actions">
				<button type="button" onClick={onCancel}>
					Cancel
				</button>
				<button type="submit">Create</button>
			</div>
		</form>
	);
}
