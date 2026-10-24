type AlertProps = {
	message: string;
	variant: "error" | "success";
};

export function Alert({ message, variant }: AlertProps) {
	if (!message) return null;

	return <div className={`alert ${variant}`}>{message}</div>;
}
