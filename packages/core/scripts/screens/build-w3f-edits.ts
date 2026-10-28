// The strategies of BUILD-W3F with a Z10 win, for the screen over edits: the consensus (HWY-035) against the finders that vote,
// and the scale space with persistence (HWY-053) against one scale (`p0` 0) and against `nested`.
// Start: `pnpm screen --step highway --strategy consensus,scale-space,corridors,quickbundles,wspd,road-classes,nested,shared-ways --module scripts/screens/build-w3f-edits.ts --edits 5`.
export { consensusC03, consensusSingle, scaleSpaceP0 } from "./build-w3f.ts";
