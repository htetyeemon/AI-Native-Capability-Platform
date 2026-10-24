import type { ReactNode } from "react";

type ModalProps = {
	title: string;
	children: ReactNode;
	onClose: () => void;
};

export function Modal({ title, children, onClose }: ModalProps) {
	return (
		<div className="modal-backdrop" role="presentation">
			<div
				className="modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="modal-title"
			>
				<div className="modal-header">
					<h2 id="modal-title">{title}</h2>
					<button type="button" className="icon-button" onClick={onClose}>
						X
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}
