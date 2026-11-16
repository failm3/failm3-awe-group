import type {
  CapabilityKind,
  Classification,
  HazardFlag,
  KindBasis,
  NoxCapability,
  SourceRow,
} from './types.js';
import { NOX_CAPABILITIES } from './types.js';

/**
 * Capability inference.
 *
 * Nox ships `awe/tool_registry/taxonomy.mjs` with the same idea. We keep the
 * vocabulary identical so records stay discoverable through Nox's own
 * `createDiscovery()`, and we extend the hazard screen, because this library
 * indexes far noisier publisher text than Nox's fixture set.
 *
 * Invariant: nothing here establishes safety, compatibility or permission.
 * Every capability is `INFERRED_FROM_DESCRIPTION`, and every hazard forces a
 * security review before discovery will surface the record as a verified tool.
 */

interface CapabilityRule {
  readonly capability: NoxCapability;
  readonly pattern: RegExp;
}

const CAPABILITY_RULES: readonly CapabilityRule[] = [
  { capability: 'browser.screenshot', pattern: /(?:playwright|puppeteer|selenium|скриншот|screenshot)/i },
  { capability: 'browser.automation', pattern: /(?:playwright|puppeteer|selenium|browser.?automat|браузерн.{0,25}автоматизац|автоматизац.{0,25}браузер)/i },
  { capability: 'document.generate', pattern: /(?:pandoc|docx|python-docx|reportlab|pdfkit|генерац.{0,30}документ|создан.{0,30}документ)/i },
  { capability: 'document.convert', pattern: /(?:pandoc|конверт.{0,30}(?:pdf|документ)|document.?conver)/i },
  { capability: 'code.test', pattern: /(?:pytest|vitest|jest\b|unittest|test.?runner|тестировани.{0,30}код|тест.{0,20}фреймворк)/i },
  { capability: 'code.develop', pattern: /(?:\bIDE\b|code.?editor|код.{0,20}редактор|coding|разработк)/i },
  { capability: 'mcp.server', pattern: /(?:\bmcp\b|model context protocol)/i },
  { capability: 'agent.orchestrate', pattern: /(?:orchestrat|оркестр|multi.agent|мультиагент)/i },
  { capability: 'search.web', pattern: /(?:web.?search|поиск.{0,20}интернет|search.?engine|поисковая система)/i },
  { capability: 'memory.retrieve', pattern: /(?:\bRAG\b|vector.?database|векторн.{0,20}баз|retrieval)/i },
  { capability: 'data.store', pattern: /(?:postgres|sqlite|database|база данных|базами данных)/i },
  { capability: 'security.scan', pattern: /(?:vulnerability|уязвимост|security.?scan|антивирус)/i },
  { capability: 'media.image', pattern: /(?:image|изображен|картинк)/i },
  { capability: 'media.audio', pattern: /(?:audio|аудио|speech|речи)/i },
  { capability: 'media.video', pattern: /(?:video|видео)/i },
  { capability: 'model.inference', pattern: /(?:inference|инференс|llm|языков.{0,10}модел)/i },
  { capability: 'infra.observe', pattern: /(?:observability|мониторинг|tracing|наблюдаемост)/i },
  { capability: 'backup.restore', pattern: /(?:backup|бэкап|резервн.{0,15}коп|restore)/i },
];

/**
 * Prompt-injection / social-engineering markers. A description that contains
 * these is *still data*: we index it, we never follow it. The flag exists so an
 * operator can see that the text tried to address the reader as a system.
 */
const INJECTION_PATTERNS: readonly RegExp[] = [
  /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above)\s+(?:instructions|prompts?|rules)/i,
  /disregard\s+(?:all\s+|any\s+)?(?:previous|prior|above)/i,
  /(?:^|\n)\s*(?:system|assistant|developer)\s*(?:prompt|message)\s*:/i,
  /you\s+are\s+now\s+(?:a|an|the)\b/i,
  /(?:^|\n)\s*<\|?(?:im_start|im_end|system|endoftext)\|?>?/i,
  /new\s+instructions?\s*:/i,
  /(?:забудь|игнорируй)\s+(?:все\s+)?(?:предыдущ|инструкц)/i,
  /(?:act|behave)\s+as\s+(?:if\s+you\s+are|a|an)\s+(?:admin|root|system|developer)/i,
];

const DANGEROUS_TEXT_PATTERNS: readonly RegExp[] = [
  /(?:sudo\s+|curl[^\n]{0,80}\|\s*(?:sh|bash))/i,
  /powershell\s+(?:-\w+\s+)*-enc/i,
  /(?:malware|ransomware|вредонос|jailbreak|обход.{0,20}защит|exfiltrat|credential.?steal|keylogger)/i,
];

/** Ordered kind rules. First positive match wins; ambiguity is reported as
 * `unknown`, never guessed into a callable kind. */
interface KindRule {
  readonly kind: CapabilityKind;
  readonly pattern: RegExp;
  readonly basis: KindBasis;
}

const KIND_RULES: readonly KindRule[] = [
  { kind: 'mcp_server', pattern: /(?:\bmcp\b|model context protocol|mcp server)/i, basis: 'DESCRIPTION_KEYWORD' },
  { kind: 'agent_skill', pattern: /(?:agent\s+skill|skills?\.md|claude skill|\bskill pack\b)/i, basis: 'DESCRIPTION_KEYWORD' },
  { kind: 'verifier', pattern: /(?:linter|static analysis|verifier|валидатор|проверк.{0,20}качеств|тест.{0,15}раннер)/i, basis: 'DESCRIPTION_KEYWORD' },
  { kind: 'workflow', pattern: /(?:workflow|n8n|zapier|airflow|пайплайн.{0,15}автоматизац)/i, basis: 'DESCRIPTION_KEYWORD' },
  { kind: 'script_cli', pattern: /(?:command.?line|\bcli\b|terminal tool|скрипт|консольн)/i, basis: 'DESCRIPTION_KEYWORD' },
  { kind: 'api', pattern: /(?:\bapi\b|rest endpoint|openapi|graphql endpoint|sdk for)/i, basis: 'DESCRIPTION_KEYWORD' },
];

const RESOURCE_TYPE_KIND: Readonly<Record<string, CapabilityKind>> = {
  github_repository: 'unknown',
  website_or_service: 'reference_or_service',
  model_or_demo: 'reference_or_service',
  app_store_listing: 'reference_or_service',
  post_or_media: 'knowledge_source',
  direct_file: 'unknown',
  github_index: 'reference_or_service',
};

function inferKind(row: SourceRow, text: string): { kind: CapabilityKind; basis: KindBasis } {
  for (const rule of KIND_RULES) {
    if (rule.pattern.test(text)) return { kind: rule.kind, basis: rule.basis };
  }
  const byResource = RESOURCE_TYPE_KIND[row.resource_type];
  if (byResource !== undefined) return { kind: byResource, basis: 'RESOURCE_TYPE' };
  return { kind: 'unknown', basis: 'UNKNOWN' };
}

export function classify(row: SourceRow): Classification {
  const text = [row.url, row.title, row.description].join(' ');

  const capabilities: NoxCapability[] = [];
  for (const rule of CAPABILITY_RULES) {
    if (rule.pattern.test(text) && !capabilities.includes(rule.capability)) {
      capabilities.push(rule.capability);
    }
  }
  // Guard: never emit a capability outside Nox's vocabulary.
  const known = capabilities.filter((c): c is NoxCapability =>
    (NOX_CAPABILITIES as readonly string[]).includes(c),
  );

  const hazards = new Set<HazardFlag>();
  if (INJECTION_PATTERNS.some((p) => p.test(row.description))) hazards.add('REQUIRES_SECURITY_REVIEW');
  if (DANGEROUS_TEXT_PATTERNS.some((p) => p.test(text))) hazards.add('EXECUTION_IN_DESCRIPTION');
  try {
    const u = new URL(row.url);
    if (u.protocol === 'http:') hazards.add('CLEARTEXT_SOURCE');
    if (u.username || u.password) hazards.add('CREDENTIAL_IN_URL');
  } catch {
    hazards.add('REQUIRES_SECURITY_REVIEW');
  }

  const { kind, basis } = inferKind(row, text);

  return {
    capabilities: known,
    certainty: known.length > 0 ? 'INFERRED_FROM_DESCRIPTION' : 'UNRESOLVED',
    hazards: [...hazards].sort(),
    kind,
    kind_basis: basis,
  };
}

/**
 * Derive a capability request from free text, for the Librarian to expand a
 * plain-language need into Nox's vocabulary. Deterministic and local.
 */
export function capabilitiesFromText(text: string): NoxCapability[] {
  const out: NoxCapability[] = [];
  for (const rule of CAPABILITY_RULES) {
    if (rule.pattern.test(text) && !out.includes(rule.capability)) out.push(rule.capability);
  }
  return out;
}

/** Does this text look like it is trying to instruct the reader? Exposed so the
 * import pipeline and the adapter can both refuse to elevate such text. */
export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((p) => p.test(text));
}
