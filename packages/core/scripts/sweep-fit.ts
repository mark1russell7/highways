// The fit of a sweep record. This file reads no file, so its test gives it the data.
// A draw adds the input dimensions of each family (SPACE-INPUTS). Each option is seen with each of them, so the expansion `seen` can pass `RESPONSE_MAX_TERMS`.
import { fitResponse, RESPONSE_MAX_TERMS, type ResponseData, type ResponseFitOptions, type ResponseRecord } from "@mark1russell7/rigor-statistics";

/** A fitted sweep record, with the interactions that its models have. */
export interface SweepFit {
  readonly record: ResponseRecord;
  readonly interactions: "seen" | false;
}

/**
 * This function fits the models of a sweep record with the interactions `seen`.
 * When that expansion has more than `RESPONSE_MAX_TERMS` terms, the function fits again without interactions.
 * The result tells which fit it gives. An error of the second fit goes to the caller.
 */
export function fitSweep(data: ResponseData, options: Omit<ResponseFitOptions, "interactions" | "terms"> = {}): SweepFit {
  try {
    return { record: fitResponse(data, { ...options, interactions: "seen" }), interactions: "seen" };
  } catch (error) {
    if (!(error instanceof RangeError) || !error.message.includes(`${RESPONSE_MAX_TERMS - 1}`)) throw error;
    return { record: fitResponse(data, { ...options, interactions: false }), interactions: false };
  }
}
