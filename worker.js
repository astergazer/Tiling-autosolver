import { solveTilings } from "./solver.js";

self.onmessage = ({ data }) => {
  try {
    const result = solveTilings(data.board, data.tiles, data.options);
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
