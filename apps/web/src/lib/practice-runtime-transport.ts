import {
  abandonPracticeCloudRun,
  checkpointPracticeCloudRun,
  fetchPracticeCloudRun,
  recordPracticeCloudAttempt,
  startPracticeCloudRun,
  submitPracticeCloudRun,
} from "./practice-cloud-client";
import { acknowledgePracticeRuntimeRun } from "./attempts-store";
import type { PracticeRuntimeTransport } from "./practice-runtime-sync-types";

export const defaultPracticeRuntimeTransport: PracticeRuntimeTransport = {
  start: startPracticeCloudRun,
  checkpoint: checkpointPracticeCloudRun,
  recordAttempt: recordPracticeCloudAttempt,
  submit: submitPracticeCloudRun,
  acknowledge: acknowledgePracticeRuntimeRun,
  abandon: abandonPracticeCloudRun,
  fetch: fetchPracticeCloudRun,
};
