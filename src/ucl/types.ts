/**
 * Canonical types for the Unified Capability Library.
 *
 * Design rule: a record in this library is METADATA, never an installed or
 * callable capability. Every record starts UNVETTED. Absence of evidence is
 * `UNKNOWN`, never `PASS`.
 */

/** Six-state admission lifecycle owned by Nox. This library never advances a
 * state on its own beyond DISCOVERED/INSPECTED; qualification and admission
 * belong to the existing Nox Capability Plane. */
export type TrustState =
  | 'UNVETTED'
  | 'INSPECTED'
  | 'QUALIFIED'
  | 'SCOPE_APPROVED'
  | 'ACTIVE'
  | 'QUARANTINED'
  | 'REVOKED';

/** Kind of capability. Only some kinds can ever be callable, and even then only
 * after Nox's own qualification. `reference_or_service` and `knowledge_source`
 * are never executable. */
export type CapabilityKind =
  | 'mcp_server'
  | 'api'
  | 'agent_skill'
  | 'script_cli'
  | 'knowledge_source'
  | 'workflow'
  | 'agent_recipe'
  | 'verifier'
  | 'reference_or_service'
  | 'unknown';

export const CAPABILITY_KINDS: readonly CapabilityKind[] = [
  'mcp_server', 'api', 'agent_skill', 'script_cli', 'knowledge_source',
  'workflow', 'agent_recipe', 'verifier', 'reference_or_service', 'unknown',
];

/** Kinds that may, after independent qualification, describe something
 * executable. Everything else is descriptive only. */
export const EXECUTABLE_KINDS: readonly CapabilityKind[] = [
  'mcp_server', 'api', 'agent_skill', 'script_cli', 'workflow', 'verifier',
];

/** Nox's capability vocabulary (awe/tool_registry/taxonomy.mjs). Kept identical
 * so records imported here are discoverable through Nox's existing
 * createDiscovery()/rankRecords() without changing Nox. */
export const NOX_CAPABILITIES = [
  'browser.screenshot', 'browser.automation', 'document.generate',
  'document.convert', 'code.test', 'code.develop', 'mcp.server',
  'agent.orchestrate', 'search.web', 'memory.retrieve', 'data.store',
  'security.scan', 'media.image', 'media.audio', 'media.video',
  'model.inference', 'infra.observe', 'backup.restore',
] as const;

export type NoxCapability = (typeof NOX_CAPABILITIES)[number];

/** A raw source row as delivered by the Cortex catalog. */
export interface SourceRow {
  readonly id: string;
  readonly source: string;
  readonly source_row: number;
  readonly url: string;
  readonly description: string;
  readonly host: string;
  readonly title: string;
  readonly category: string;
  readonly confidence: string;
  readonly resource_type: string;
  readonly multi_service_description?: boolean;
  readonly exact_duplicate_group_size?: number;
  readonly address_group_size?: number;
  readonly note_path?: string;
  readonly secondary_categories?: string;
  readonly flags?: string;
}

/** Classification output. Certainty is always stated; inference is never proof. */
export interface Classification {
  readonly capabilities: readonly NoxCapability[];
  readonly certainty: 'INFERRED_FROM_DESCRIPTION' | 'UNRESOLVED';
  readonly hazards: readonly HazardFlag[];
  readonly kind: CapabilityKind;
  readonly kind_basis: KindBasis;
}

export type HazardFlag =
  | 'REQUIRES_SECURITY_REVIEW'
  | 'CLEARTEXT_SOURCE'
  | 'EXECUTION_IN_DESCRIPTION'
  | 'CREDENTIAL_IN_URL'
  | 'URL_CREDENTIALS';

export type KindBasis =
  | 'RESOURCE_TYPE'
  | 'URL_SHAPE'
  | 'DESCRIPTION_KEYWORD'
  | 'UNKNOWN';

/** The canonical registry record. Source bytes are preserved separately in
 * source_records; this is the reviewed, searchable projection. */
export interface CapabilityRecord {
  /** Stable id derived from the canonical URL, so duplicates collapse to one
   * entity while every original row keeps its own provenance. */
  readonly canonical_id: string;
  readonly original_id: string;
  readonly source: string;
  readonly source_row: number;
  readonly locator: string;
  readonly url: string;
  readonly canonical_url: string;
  readonly duplicate_group: string;
  readonly duplicate_ids: readonly string[];
  readonly title: string;
  /** Description is untrusted publisher text. It is indexed, never obeyed. */
  readonly description: string;
  readonly description_trust: 'UNTRUSTED_SOURCE_CLAIM';
  readonly host: string;
  readonly category: string;
  readonly kind: CapabilityKind;
  readonly capabilities: readonly NoxCapability[];
  readonly capability_certainty: 'INFERRED_FROM_DESCRIPTION' | 'UNRESOLVED';
  readonly hazards: readonly HazardFlag[];
  readonly license: Unknownable<string>;
  readonly version: Unknownable<string>;
  readonly trust_state: TrustState;
  readonly installed: 'UNKNOWN' | 'PRESENT' | 'ABSENT';
  readonly security: 'NOT_TESTED' | 'TESTED';
  readonly compatibility: 'NOT_TESTED' | 'TESTED';
  readonly cost: CostClaim;
  readonly raw_digest: string;
  readonly last_seen: string;
  readonly source_flags: string;
}

export interface Unknownable<T> {
  readonly value: T | 'UNKNOWN';
  readonly evidence: string | null;
}

export interface CostClaim {
  readonly amount_micros: string | null;
  readonly currency: string | null;
  readonly basis: 'SOURCE_CLAIM' | 'UNKNOWN';
}

/** What a search request asks for. Deterministic: no LLM involved. */
export interface SearchQuery {
  /** Free-text requirement. Treated as data; also used to derive capabilities. */
  readonly need?: string;
  readonly capabilities?: readonly NoxCapability[];
  readonly kinds?: readonly CapabilityKind[];
  readonly text_filter?: string;
  readonly trust?: readonly TrustState[];
  readonly hazards?: 'exclude' | 'only' | 'include';
  readonly limit?: number;
  /** Project scope for ACL. Absent = no ACL applied (standalone CLI use). */
  readonly project_id?: string;
}

export interface SearchHit {
  readonly canonical_id: string;
  readonly title: string;
  readonly url: string;
  readonly kind: CapabilityKind;
  readonly capabilities: readonly NoxCapability[];
  readonly trust_state: TrustState;
  readonly hazards: readonly HazardFlag[];
  readonly duplicate_count: number;
  readonly score: number;
  readonly rationale: string;
  /** Short metadata only: progressive disclosure. Never the full description. */
  readonly evidence: readonly string[];
}

export type SearchStatus = 'OK' | 'NOT_FOUND';

export interface SearchResult {
  readonly status: SearchStatus;
  readonly query_digest: string;
  readonly hits: readonly SearchHit[];
  readonly examined: number;
  readonly rationale: string;
  readonly permissions: 'NONE';
  readonly execution_authority: false;
}

/** Verified Agent Blueprint: a declarative recipe, never a live agent. */
export type BlueprintStatus = 'CANDIDATE' | 'VERIFIED_FOR_SCOPE' | 'DEPRECATED' | 'REVOKED';

export interface BlueprintEvidence {
  readonly kind: 'independent_acceptance' | 'qa_report' | 'artifact';
  readonly ref: string;
  readonly digest: string;
  /** Who verified, independent of the generator. */
  readonly verified_by: string;
  readonly verified_at: string;
}

export interface AgentBlueprint {
  readonly blueprint_id: string;
  readonly version: string;
  readonly status: BlueprintStatus;
  readonly role: string;
  readonly purpose: string;
  readonly instructions_template: string;
  /** Capabilities the recipe requires; must resolve against the registry. */
  readonly required_capabilities: readonly string[];
  readonly required_skills: readonly string[];
  readonly model_route_hint: string;
  readonly input_contract: unknown;
  readonly output_contract: unknown;
  /** Where the recipe was proven. Reuse outside this scope is not promised. */
  readonly applicability: readonly string[];
  readonly exclusions: readonly string[];
  readonly expected_success_criteria: readonly string[];
  readonly evidence: readonly BlueprintEvidence[];
  readonly created_at: string;
  readonly supersedes: string | null;
  readonly revoked_reason: string | null;
  /** Human-readable digest of the whole recipe, excluding status/evidence. */
  readonly recipe_digest: string;
}

export interface BlueprintSearchQuery {
  readonly need?: string;
  readonly role?: string;
  readonly capabilities?: readonly string[];
  readonly status?: readonly BlueprintStatus[];
  readonly project_id?: string;
  readonly limit?: number;
}
