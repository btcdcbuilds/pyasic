# The five target industries

Sample sites live in `sites/content/` (fictional businesses, clearly bannered as samples).
Research date: 2026-10-12. The rows labelled *inference* are product judgement;
**no survey of Thai customer expectations was found**.

## Samples

| Industry | Sample (fictional) | Region | Booking type | Deposit | Key sections |
|---|---|---|---|---|---|
| Restaurant | Krua Baan Suan (ครัวบ้านสวน) | Nakhon Si Thammarat | Table: date, time, party | None | Menu with spice tags, delivery links, hours, map, FAQ |
| Café / bakery | Samui Morning Café | Koh Samui | Pre-order pickup, 2 days' notice | Shown in FAQ (50% for cakes) | Menu, delivery links, Wi-Fi/laptop info |
| Resort / guesthouse | Baan Lom Talay Bungalows | Koh Samui | Room nights, availability per room type | 30% | Rooms with rates, "book direct" pitch, policies, licence line |
| Spa / massage | Sabai Hands Thai Massage | Bangkok | Time slot × treatment × people | None (pay in shop) | Treatment price list by duration, licence line |
| Tours / activities | Khanom Dolphin Trips | Nakhon Si Thammarat | Seats per departure, adult/child prices | 50% | Trips, inclusions, weather policy, licence line |

## What the research supports

| Topic | Finding | Source |
|---|---|---|
| Visitor mix 2025 | ~33M arrivals; top: Malaysia 4.52M, China 4.47M, India 2.49M, Russia 1.9M, Korea 1.55M | https://www.bernama.com/en/news.php?id=2509419 |
| Languages (inference from above) | Thai + English now; add Chinese (Simplified) and Russian next | — |
| LINE | ~56M accounts in Thailand; add-friend URL `https://line.me/R/ti/p/%40{id}` (encode the @) | https://developers.line.biz/en/docs/messaging-api/using-line-url-scheme/ |
| Delivery share 2025 GMV | Grab 47%, LINE MAN Wongnai 41%, ShopeeFood 10% (foodpanda exited May 2025) | https://www.bangkokpost.com/business/general/3190654/grabline-man-duopoly-tightens-its-grip |
| Chinese payments | Alipay / WeChat Pay are common at hotels/spas | https://www.dusit-international.com/en/newsroom/news-releases/476/ |
| PromptPay QR | EMVCo-based Thai QR spec (BOT guideline 2019) — can be generated for deposits | https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2562/EngPDF/25620084.pdf |
| Tour licence | Ministry of Tourism (Jul 2025): operators must show licence number, name and location in all advertising incl. online | https://mail.thephuketnews.com/tour-business-registrations-rise-by-14-96921.php |
| Hotel licence | Since 29 Oct 2023, ≤8 rooms and ≤30 guests are not a "hotel" under the Hotel Act | https://www.tilleke.com/insights/thailand-amends-hotel-regulations/ |
| Spa/massage licence | Health Establishment Act B.E. 2559 licence required; website display rule not found | https://thailand.go.th/event-detail/001_07_003-2 |
| PDPA | Privacy notice at or before collection (s.23): purpose, data, retention, recipients, rights, controller | https://www.lawplusltd.com/2020/01/personal-data-protection-law-of-thailand-notice-content/ |
| Cookie consent | Non-essential cookies need opt-in (vendor guides only; official PDPC guideline not found). Our sites use no tracking cookies, so no banner | https://cookiefirst.com/pdpa-thailand-and-cookies/ |
| Tour cancellation norm | Viator default: full refund up to 24 h before | https://agentcenter.viator.com/?p=10586 |

## Gaps to fill during testing

| Gap | How to fill it |
|---|---|
| What owners actually want on the site | Ask the first 10 pilot businesses; record answers in `business_content` notes |
| Deposit norms per industry | Ask owners; make deposit % a per-site setting (already is) |
| Chinese / Russian copy | Add `zh` / `ru` keys to content and a language menu (template supports adding languages) |
| Alipay / WeChat Pay | Check whether Opn or Stripe Thailand offer them for small merchants |
| Legal review | Thai lawyer to review privacy notice text and licence-display wording |
