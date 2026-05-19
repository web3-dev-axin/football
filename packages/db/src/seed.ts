import { createDemoState } from "./client";

const state = createDemoState();
console.log(JSON.stringify({ fixtures: state.fixtures.length, snapshots: state.snapshots.length, comparisons: state.comparisons.length }, null, 2));
