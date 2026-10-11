# [BRAND] — Prefab Offices, Homes & Site Accommodation (Thailand)

Working name: **[BRAND]** (to be chosen — check DBD company-name availability and the `.co.th` / `.com` domains before committing).

This folder holds the full business plan for a Thailand-based reseller of
China-manufactured fold-out / expandable prefab units (site offices, homes,
staff accommodation), sold and supported through AI agents, with our own
flatbed delivery truck and screw-pile foundations.

It is deliberately self-contained so it can be moved to its own repository
later (`git subtree split --prefix=prefab-thailand` or simply copy the folder).

## Document index

| # | Document | What it covers |
|---|----------|----------------|
| 01 | [Business plan](docs/01-business-plan.md) | Concept, customers, revenue streams, competitive position, risks |
| 02 | [Products & options](docs/02-products-and-options.md) | Unit spec, option packs, furniture, screw piles, SKU structure |
| 03 | [Supply chain & import](docs/03-supply-chain-and-import.md) | China supplier, QC, shipping, customs, duty, TISI |
| 04 | [Operations](docs/04-operations.md) | Warehouse, flatbed truck (sales delivery + hire), installation |
| 05 | [Sales & marketing](docs/05-sales-and-marketing.md) | Channels (Lazada, Facebook, LINE, WhatsApp, web), ads, brand character |
| 06 | [AI agent architecture](docs/06-ai-agent-architecture.md) | Which agents, what they may/may not do, human approval gates |
| 07 | [Website spec](docs/07-website-spec.md) | Pages, configurator, quoting, LINE/WhatsApp/WeChat integration, tech stack |
| 08 | [Legal, tax & accounting](docs/08-legal-tax-accounting.md) | Company setup, licences, contracts, warranties, insurance, PDPA |
| 09 | [Financial model](docs/09-financial-model.md) | Landed-cost formula, duty scenarios, break-even, inputs to collect |
| 10 | [Launch roadmap](docs/10-launch-roadmap.md) | Step-by-step plan from now to the first container sold |
| — | [Landed-cost calculator](tools/landed_cost.py) | Script: per-unit landed cost and margin from real quotes |

## The 5 things that decide whether this business works

| # | Issue | Why it matters | Status |
|---|-------|----------------|--------|
| 1 | **Import duty on HS 9406** | A third-party tariff site lists Thailand's general (MFN) rate at **80%**. Whether the China–ASEAN FTA (Form E) brings it to 0% is **unconfirmed**: sources conflict. At 80% duty, import taxes alone come to **92.6% of CIF value** vs **7%** at 0% duty (see doc 09). | ❗ Get a written ruling from a licensed Thai customs broker **before** placing the order |
| 2 | **Foreign ownership** (if any owner isn't Thai) | Retail and most services are restricted under the Foreign Business Act (List 3): a foreign stake must stay under 50% unless a licence is granted or the capital thresholds are met. Nominee shareholding is illegal. | ❓ Owner nationality needed |
| 3 | **Electrical compliance** | The units ship with lights, power points and a switchboard. Cables appear to be TISI-mandatory, and other components may be too. Non-compliant items can be held at customs. | ❗ Supplier must give the component list; check against TISI |
| 4 | **Building permits for buyers** | Under the Building Control Act a dwelling or usable structure is generally a "building". Buyers may need a permit depending on location and town plan. That affects how we market and what our contracts say. | ❗ Lawyer opinion + standard customer guidance sheet |
| 5 | **Platform rules for AI selling** | Meta bans fake accounts and misrepresenting who you are. AI agents running fake personal profiles in Facebook groups risk bans on every account we hold, ad account included. | ✅ Plan uses a transparent brand character (doc 05/06) |

## Verified facts used in this plan

Only facts we could source are stated as facts. Everything else is marked
**TBD / quote needed / verify**. No prices or volumes in this plan are made up.

| Fact | Source | Confidence |
|------|--------|-----------|
| Thai VAT is 7% (6.3% VAT + 0.7% municipal tax), extended to 30 Sep 2027 by Royal Decree No. 807 | [Forvis Mazars](https://www.forvismazars.com/th/en/insights/doing-business-in-thailand/tax/thailand-maintains-7-vat-rate-for-another-year), [HLB Thai](https://www.hlbthai.com/cabinet-approves-1-year-extension-of-7-vat-rate-until-30-september-2027/) | High |
| Thailand MFN duty on HS 9406.20 / 9406.90 listed at 80% | [treayo.com 940620](https://treayo.com/en/compare/940620), [treayo.com 940690](https://treayo.com/en/compare/940690) (third-party aggregator) | Medium: verify with Thai Customs |
| Heading 9406 shows up in an ASEAN "Highly Sensitive List" (50% tariff cap); the document doesn't say which country's schedule it is | [ASEAN HSL PDF](https://asean.org/wp-content/uploads/2021/03/HIGH-SENSITIVE-LIST.pdf) | Low/unclear |
| Retail with total capital under THB 100M (or under THB 20M per store) is on FBA List 3 | [BOI OSOS FAQ](https://osos.boi.go.th/C/faq-group/26/Minimum-capital-for-Retail-sale-of-goods), [Forvis Mazars](https://www.forvismazars.com/th/en/insights/thought-leadership-series/business-challenges-why-outsourcing-matters/incorporating-a-retail-business-in-thailand) | Medium: sources dated, verify with DBD |
| PVC-insulated copper/aluminium cables are TISI compulsory products | [TÜV SÜD](https://www.tuvsud.com/en-us/services/product-certification/thailand-tisi) | Medium |
| Importers of TISI-controlled products need a TISI permit (Sec. 21 / 21 bis, Industrial Product Standards Act) | [Business Events Thailand guide](https://www.businesseventsthailand.com/uploads/solution_support/file/191118-file-bCkwXzxGm.pdf) (2019) | Medium |
| "Building" under the Building Control Act covers structures people may dwell in or use | [Building Control Act (English text)](https://www.iibh.org/kijun/pdf/Thai_01_ACT.combined%20by%20H.pdf) | Medium |
| Meta prohibits fake accounts, misrepresentation and artificially boosting content | [Meta Transparency Center](https://transparency.meta.com/en-gb/policies/community-standards/inauthentic-behavior/) | High |
| Companies registered under the Civil & Commercial Code were exempted from separate e-commerce commercial registration (June 2024 change) | [Legal500](https://legal500.com/developments/thought-leadership/thailand-updates-e-commerce-regulations-what-you-need-to-know), [Forvis Mazars](https://www.forvismazars.com/th/en/insights/doing-business-in-thailand/legal/monitoring-e-commerce-businesses) | Medium: verify with DBD |
| PDPA: marketing consent should be separate and not pre-ticked; administrative fines commonly cited up to THB 5M | [Tilleke & Gibbins](https://www.tilleke.com/insights/thailand-releases-new-draft-pdpa-guidance-on-lawful-bases-and-marketing/), [LexBangkok](https://lexbangkok.com/direct-marketing-thailand-pdpa/) | Medium: guidance is draft |

## Decisions needed from the owner

| # | Question | Options | Affects |
|---|----------|---------|---------|
| 1 | Nationality of the shareholders? | All Thai / mixed / foreign majority | Company structure, FBA licence, work permits |
| 2 | Business name? | — | Domain, DBD registration, branding |
| 3 | Warehouse region? | EEC (Chonburi/Rayong, close to Laem Chabang port), Bangkok outskirts, other | Delivery radius, rent, target sites |
| 4 | Supplier details: factory name, existing certificates (CE, ISO 9001, etc.), unit drawings, FOB price list | — | Docs 02, 03, 09 |
| 5 | Budget available for the first container + truck + warehouse | — | Doc 09 |
| 6 | Move this folder to its own repo now or later? | Now / later | Repo housekeeping |
