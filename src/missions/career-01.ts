/**
 * CAREER-01: Job Search and Application Preparation on HeadHunter
 *
 * First real-world mission for AWE GROUP. Tests multi-agent research,
 * document creation, and external platform interaction.
 */

export const CAREER_01_MISSION = {
  title: "CAREER-01: Job Search & Applications on HeadHunter",
  objective: `Find 10+ relevant job vacancies on HeadHunter (hh.ru) for a senior software developer / AI engineer position, 
rank them by fit, and prepare 3 personalized cover letter responses based on verified candidate information.
The candidate profile is: experienced software/AI developer, familiar with LLMs, multi-agent systems, TypeScript/Python/Node.js, 
system architecture, and AI product development.

Note: hh.ru does not expose an open API. Use Tavily web_search and web_fetch to find and verify vacancies.`,
  acceptance_criteria: [
    "At least 10 job vacancies found with real hh.ru URLs in https://hh.ru/vacancy/NNNNNNNN format",
    "Each vacancy has: company name, role title, hh.ru direct URL, and key requirements (inferred from title/role if page content unavailable due to SSR limitations)",
    "Each vacancy has url_verified field (true if URL was fetched or found via search, false if not reachable)",
    "Each vacancy has status field ('active' or 'archived') based on best available information from search results or page content",
    "Vacancies ranked by fit score (1-10) with written justification explaining why each vacancy matches the candidate profile",
    "At least 3 personalized cover letters written, each addressing a specific ranked vacancy by name and URL",
    "Cover letters are substantive and detailed (each covering the role, company, specific technical requirements, and candidate's relevant experience), written in Russian, and reference the specific role and company",
    "All artifacts saved: vacancies JSON file + ranked vacancies file + cover letters file with correct mission_id",
  ],
  context: `
Target platform: hh.ru (HeadHunter Russia)
Candidate: Senior software/AI developer with expertise in:
- LLMs, multi-agent systems, AI product development
- TypeScript, Node.js, Python
- System architecture and distributed systems
- Product development and technical leadership

IMPORTANT: hh.ru API is blocked (returns 403). Use these strategies:
1. Use web_search (Tavily) with queries like:
   - "hh.ru вакансии AI разработчик senior 2026"
   - "site:hh.ru senior AI engineer LLM"
   - "hh.ru vacancy AI developer Python typescript senior"
2. Use web_fetch on individual hh.ru/vacancy/NNNNNNNN pages to get details
3. For url_verified: attempt web_fetch on the URL — if it loads any content, set url_verified=true
4. Note status: if page contains "в архиве" mark status="archived", otherwise "active"
5. Include both active AND archived vacancies — archived ones are still useful for research

The system does NOT have HH.ru credentials. Do not attempt to submit applications.
Focus on: finding, analyzing, ranking vacancies + preparing tailored application materials.
`,
  tags: ["career", "research", "writing", "job-search", "hh.ru"],
};
