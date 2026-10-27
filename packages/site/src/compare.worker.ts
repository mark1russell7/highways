import { computePanels } from "./compare-data.ts";
import type { CompareReply, CompareRequest } from "./protocol.ts";

// Each strategy of the step routes and measures here, so the page stays responsive.
self.addEventListener("message", (event: MessageEvent<CompareRequest>) => {
  const { id, state } = event.data;
  let reply: CompareReply;
  try {
    reply = { id, ok: true, panels: computePanels(state) };
  } catch (err) {
    reply = { id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  self.postMessage(reply);
});
