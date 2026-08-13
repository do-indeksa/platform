import {
  checkpointPracticeCloudRun,
  fetchPracticeCloudRun,
  recordPracticeCloudAttempt,
  startPracticeCloudRun,
  submitPracticeCloudRun,
} from "./practice-cloud-client";
import type { PracticeRuntimeTransport } from "./practice-runtime-sync-types";

export const defaultPracticeRuntimeTransport: PracticeRuntimeTransport = {
  start: startPracticeCloudRun,
  checkpoint: checkpointPracticeCloudRun,
  recordAttempt: recordPracticeCloudAttempt,
  submit: submitPracticeCloudRun,
  fetch: fetchPracticeCloudRun,
};
