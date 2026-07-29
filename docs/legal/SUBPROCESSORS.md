# Subprocessors

Last reviewed: 29 July 2026

The hosted service may use the following providers. A self-hoster chooses and
contracts with its own providers.

| Provider | Purpose | Data involved | When used |
| --- | --- | --- | --- |
| Cloudflare | Workers, D1, R2, Queues, Email Service, AI Gateway, DNS, delivery, security, and logs | Account, configuration, source, generated, request, email, and operational data | Core hosted service |
| OpenAI | Relevance review and summary generation through Cloudflare AI Gateway | Selected public-source text, prompts, model inputs and outputs | Model-backed processing is enabled |
| Apify | Google News, X, LinkedIn, and generic actor execution | Public identifiers, queries, actor inputs, public results, and run metadata | Corresponding provider is enabled |
| Brave Search | Optional secondary news search | Search query and public result metadata | Explicitly enabled with storage rights confirmed |
| GitHub | Source control, CI, security advisories, and release automation | Contributor data, repository content, CI metadata, and security reports | Project development and releases |

Provider use is controlled by explicit runtime switches. LinkedIn, generic
Apify, and Brave are off by default. Provider terms, privacy notices, locations,
and transfer mechanisms apply to their processing.

Material additions or purpose changes will update this list before or when the
new provider begins processing hosted-service data. Questions or objections may
be sent to `privacy@distilled.news`.
