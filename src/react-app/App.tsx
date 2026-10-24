import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import {
	createCourse,
	deleteCourse,
	getCourses,
	updateCourse,
} from "./api";
import "./App.css";
import { Alert } from "./components/Alert";
import { CourseDetail } from "./components/CourseDetail";
import { CourseTable } from "./components/CourseTable";
import { CreateCourseForm } from "./components/CreateCourseForm";
import { Modal } from "./components/Modal";
import { UpdateCourseForm } from "./components/UpdateCourseForm";
import type {
	Course,
	CreateCourseForm as CreateCourseFormState,
	CreateCoursePayload,
	UpdateCourseForm as UpdateCourseFormState,
	UpdateCoursePayload,
} from "./types";

const emptyCreateForm: CreateCourseFormState = {
	course_code: "",
	course_name: "",
	description: "",
	instructor: "",
	credits: "",
};

const emptyUpdateForm: UpdateCourseFormState = {
	course_code: "",
	course_name: "",
	description: "",
	instructor: "",
	credits: "",
	status: "",
};

type ActiveModal = "create" | "view" | "edit" | null;

function getErrorMessage(error: unknown, fallback: string) {
	return error instanceof Error ? error.message : fallback;
}

function createPayload(form: CreateCourseFormState): CreateCoursePayload {
	return {
		course_code: form.course_code,
		course_name: form.course_name,
		description: form.description || undefined,
		instructor: form.instructor || undefined,
		credits: Number(form.credits),
	};
}

function updatePayload(form: UpdateCourseFormState): UpdateCoursePayload {
	const payload: UpdateCoursePayload = {};

	if (form.course_code) payload.course_code = form.course_code;
	if (form.course_name) payload.course_name = form.course_name;
	if (form.description) payload.description = form.description;
	if (form.instructor) payload.instructor = form.instructor;
	if (form.credits) payload.credits = Number(form.credits);
	if (form.status) payload.status = form.status;

	return payload;
}

function App() {
	const [courses, setCourses] = useState<Course[]>([]);
	const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
	const [updateId, setUpdateId] = useState("");
	const [activeModal, setActiveModal] = useState<ActiveModal>(null);
	const [createForm, setCreateForm] =
		useState<CreateCourseFormState>(emptyCreateForm);
	const [updateForm, setUpdateForm] =
		useState<UpdateCourseFormState>(emptyUpdateForm);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const activeCount = useMemo(
		() => courses.filter((course) => course.status === "active").length,
		[courses],
	);

	async function loadCourses() {
		setLoading(true);
		setError("");

		try {
			setCourses(await getCourses());
		} catch (err) {
			setError(getErrorMessage(err, "Could not load courses"));
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		void loadCourses();
	}, []);

	async function handleCreate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError("");
		setMessage("");

		try {
			const course = await createCourse(createPayload(createForm));

			setCreateForm(emptyCreateForm);
			setSelectedCourse(course);
			setActiveModal(null);
			setMessage(`Created ${course.course_code}`);
			await loadCourses();
		} catch (err) {
			setError(getErrorMessage(err, "Could not create course"));
		}
	}

	async function handleUpdate(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError("");
		setMessage("");

		try {
			const course = await updateCourse(updateId, updatePayload(updateForm));

			setUpdateForm(emptyUpdateForm);
			setUpdateId("");
			setSelectedCourse(course);
			setActiveModal(null);
			setMessage(`Updated ${course.course_code}`);
			await loadCourses();
		} catch (err) {
			setError(getErrorMessage(err, "Could not update course"));
		}
	}

	async function handleDelete(course: Course) {
		const confirmed = window.confirm(
			`Delete ${course.course_code} - ${course.course_name}?`,
		);

		if (!confirmed) return;

		setError("");
		setMessage("");

		try {
			await deleteCourse(course.id);

			if (selectedCourse?.id === course.id) {
				setSelectedCourse(null);
				setActiveModal(null);
			}
			setMessage("Course deleted");
			await loadCourses();
		} catch (err) {
			setError(getErrorMessage(err, "Could not delete course"));
		}
	}

	function fillUpdate(course: Course) {
		setUpdateId(course.id);
		setUpdateForm({
			course_code: course.course_code,
			course_name: course.course_name,
			description: course.description ?? "",
			instructor: course.instructor ?? "",
			credits: String(course.credits),
			status: course.status,
		});
		setActiveModal("edit");
	}

	function openCreate() {
		setCreateForm(emptyCreateForm);
		setActiveModal("create");
	}

	function openView(course: Course) {
		setSelectedCourse(course);
		setActiveModal("view");
	}

	function closeModal() {
		setActiveModal(null);
	}

	return (
		<main className="app-shell">
			<header className="topbar">
				<div>
					<p className="eyebrow">Course Management API</p>
					<h1>Courses</h1>
				</div>
				<div className="summary">
					<span>{courses.length} total</span>
					<span>{activeCount} active</span>
				</div>
			</header>

			<Alert message={error} variant="error" />
			<Alert message={message} variant="success" />

			<section className="workspace">
				<CourseTable
					courses={courses}
					loading={loading}
					onRefresh={loadCourses}
					onCreate={openCreate}
					onSelect={openView}
					onEdit={fillUpdate}
					onDelete={(course) => void handleDelete(course)}
				/>
			</section>

			{activeModal === "create" && (
				<Modal title="Create Course" onClose={closeModal}>
					<CreateCourseForm
						form={createForm}
						onFieldChange={(field, value) =>
							setCreateForm((current) => ({ ...current, [field]: value }))
						}
						onSubmit={handleCreate}
						onCancel={closeModal}
					/>
				</Modal>
			)}

			{activeModal === "view" && (
				<Modal title="Course Details" onClose={closeModal}>
					<CourseDetail course={selectedCourse} />
				</Modal>
			)}

			{activeModal === "edit" && (
				<Modal title="Update Course" onClose={closeModal}>
					<UpdateCourseForm
						form={updateForm}
						onFieldChange={(field, value) =>
							setUpdateForm((current) => ({ ...current, [field]: value }))
						}
						onSubmit={handleUpdate}
						onCancel={closeModal}
					/>
				</Modal>
			)}
		</main>
	);
}

export default App;
