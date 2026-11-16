import { LibSQLStore } from "@mastra/libsql";
import { Memory } from "@mastra/memory";
import * as fs from "fs";
import path from "path";

const DATA_DIR = process.env.AWE_DATA_DIR
  ? path.resolve(process.env.AWE_DATA_DIR)
  : path.join(process.cwd(), ".awe-data");
export const MEMORY_DB_PATH = path.join(DATA_DIR, "memory.db");
fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * Creates a LibSQLStore backed by a local SQLite file.
 */
function createStore(storeId: string): LibSQLStore {
  return new LibSQLStore({
    id: storeId,
    url: `file:${MEMORY_DB_PATH}`,
  });
}

/**
 * Creates a Memory instance for a specific agent, backed by the shared SQLite
 * database. Keeps the last 20 messages in context by default.
 */
export function createAgentMemory(agentId: string): Memory {
  return new Memory({
    storage: createStore(`agent-store-${agentId}`),
    options: {
      lastMessages: 20,
      semanticRecall: false,
      workingMemory: {
        enabled: false,
      },
    },
  });
}

/**
 * Shared memory instance for recording mission history.
 */
export const missionMemory = new Memory({
  storage: createStore("mission-store"),
  options: {
    lastMessages: 50,
    semanticRecall: false,
    workingMemory: {
      enabled: false,
    },
  },
});
