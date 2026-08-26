export class AppError extends Error {
	public StatusCode: number;
	constructor(statusCode: number, message: string, stack = "") {
		super(message);
		this.StatusCode = statusCode;
		if (stack) {
			this.stack = stack;
		} else {
			Error.captureStackTrace(this, this.constructor);
		}
	}
}
