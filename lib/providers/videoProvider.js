/**
 * Provider contract used by generation orchestration.
 *
 * @typedef {Object} VideoProvider
 * @property {(input: object) => Promise<object>} createVideoTask
 * @property {(taskId: string, kind?: string) => Promise<object>} getTaskStatus
 * @property {(taskId: string, kind?: string) => Promise<object>} downloadResult
 */

export const PROVIDER_TASK_STATUS = Object.freeze({
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  SUCCEEDED: "SUCCEEDED",
  FAILED: "FAILED",
  TIMED_OUT: "TIMED_OUT",
});

