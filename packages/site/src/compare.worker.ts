import { computePanels, type PanelProgress } from "./compare-data.ts";
import type { CompareReply, CompareRequest } from "./protocol.ts";

// Each strategy of the step routes and measures here, so the page stays responsive.
self.addEventListener("message", (event: MessageEvent<CompareRequest>) => {
  const { id, state } = event.data;
  let reply: CompareReply;
  try {
    // The page shows the progress after each strategy, because a step with many strategies runs for some seconds.
    const progress = (p: PanelProgress): void => self.postMessage({ id, ok: "progress", progress: p } satisfies CompareReply);
    reply = { id, ok: true, panels: computePanels(state, { progress }) };
  } catch (err) {
    reply = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(reply);
});
