# One library, two consumers

The Unified Capability Library (UCL) is a single read-only index at
`data/db/ucl.sqlite` (4 466 catalogued records, 4 504 preserved source rows,
2 414 tag rows across 1 949 records). Two independent programs read it, and
neither can change it.

| | AWE GROUP | OpenCode (or any MCP client) |
|---|---|---|
| Entry point | `src/tools/ucl-search.ts`, tool `capability_library` | `src/ucl-mcp/main.ts`, MCP server `awe-ucl` |
| Transport | in-process call during a mission | stdio, JSON-RPC |
| Enabled by | `UCL_ENABLED=1` plus a mission grant for `capability_library` | the client's MCP configuration |
| Tools | `capability_library` | `capability_search`, `capability_inventory` |
| Shared code | `src/ucl/db.ts`, `src/ucl/librarian.ts`, `src/ucl/types.ts` | the same three modules, unmodified |
| Can install, execute, grant, qualify | no | no |
| Credentials needed | the mission's own provider key | none |

Both consumers call the same `search()` from `src/ucl/librarian.ts`, so the same
query ranks identically in both. The regression
`src/tests/r2-ucl-mcp.test.ts` asserts exactly that, byte for byte, against the
delivered index.

## Why a second consumer

AWE GROUP acquires capabilities autonomously while it runs a mission. A human
developing AWE GROUP needs the same catalogue from outside a mission. Without a
second entry point the only way to consult the library is to start a mission,
which is the wrong shape for "what tool should I reuse for this piece of work".
The MCP server is a thin adapter over the delivered librarian: it adds no
storage, no ranking, no cache and no second index.

## AWE GROUP

```bash
export UCL_ENABLED=1
export UCL_DB="$PWD/data/db/ucl.sqlite"   # optional; this is the default location
```

The mission must also hold the `capability_library` grant. A missing index or a
disabled flag returns a `DISABLED` / `UNAVAILABLE` payload; the mission proceeds
without it.

## OpenCode / any MCP client

Register a local (stdio) MCP server. For OpenCode this is a stanza in its own
config; nothing in this repository modifies OpenCode's installation.

```jsonc
{
  "mcp": {
    "awe-ucl": {
      "type": "local",
      "command": ["npx", "tsx", "/absolute/path/to/r2-final-autonomy/src/ucl-mcp/main.ts"],
      "enabled": true,
      "environment": {
        "UCL_DB": "/absolute/path/to/r2-final-autonomy/data/db/ucl.sqlite"
      }
    }
  }
}
```

From a built tree the command is `["node", "/absolute/path/to/dist/ucl-mcp/main.js"]`.

The server needs no API key and no network. It opens the index read-only, which
also means a foreign SQLite file is refused rather than read as if it were the
library, and the delivered index is byte-identical after every call (asserted by
the regression).

## Separated credentials

The two consumers share one library and nothing else:

- AWE GROUP authenticates with the model provider key supplied through
  `AWE_RUNTIME_ENV_FILE`; that key is scoped to missions and never reaches the
  MCP server's environment.
- The MCP server holds no provider credentials at all. It reads one local file.
- The library itself needs no credential: it is a static, delivered index.

A catalogue entry grants no execution right. Neither consumer can promote an
entry to "runs". That stays with AWE GROUP's admission path (qualification plus
an explicit grant) or an equivalent decision by the operator.

## Hazard policy

Records carrying a hazard flag are a security-review trigger and are hidden by
default. `include_hazardous: true` is only honoured when the server operator has
set `UCL_ALLOW_HAZARDOUS=1` in the server's own environment. In AWE GROUP the
same rule is enforced by the mission host, not by the model. A hazard flag is
metadata for review; it is never an approval.
