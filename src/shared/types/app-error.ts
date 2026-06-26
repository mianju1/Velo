export type AppError = {
  code: string;
  message: string;
  detail?: string;
  recoverable: boolean;
};

export function toAppError(error: unknown): AppError {
  if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
    return error as AppError;
  }

  return {
    code: "unknown_error",
    message: error instanceof Error ? error.message : "发生未知错误",
    recoverable: true,
  };
}
