# Hosting and domains (pilot)

**Decision: start on one VPS.** All customer sites run from one small server: one app
serves every site, and Caddy handles HTTPS. Domains come later, as a separate paid
add-on, once a business signs up.

## Why a VPS works for the pilot

| Point | Detail |
|---|---|
| One app, many sites | `webapp/app.py` serves every `sites/content/*.yaml` site by subdomain or custom domain (`sites/domains.yaml`) |
| HTTPS automatic | Caddy on-demand TLS; it only issues a certificate when `/internal/tls-check` confirms the host is ours |
| No per-site cost | Adding a site = one YAML file + one line in `domains.yaml` |
| Cheap | ~$12–24/month (table below) replaces Vercel Pro + Supabase Pro (~$45/month) during the pilot |
| Limits | Single server = single point of failure; take daily backups of the `app-data` volume. Move to managed hosting when revenue justifies it |

## VPS options (2 vCPU, 2–4 GB). Prices from search extracts; re-check before buying

| Provider | Location | Plan | Price/month | Source |
|---|---|---|---|---|
| AWS Lightsail | Singapore | 2 vCPU / 2 GB / 60 GB, 3 TB transfer | $12 | https://aws.amazon.com/lightsail/pricing/ |
| DigitalOcean | Singapore | 2 vCPU / 2 GiB / 60 GiB, 3 TB | $18 | https://www.digitalocean.com/pricing/droplets |
| Vultr | Singapore (no Bangkok region found) | 2 vCPU / 4 GB / 80 GB, 3 TB | $20 | https://www.vultr.com/pricing/ |
| Akamai/Linode | Singapore | 2 CPU / 4 GB / 80 GB, 4 TB | $24 | https://www.akamai.com/cloud/pricing/asia-pacific |
| Hetzner | Singapore | CPX22 2 vCPU / 4 GB | €26.49 (after Jun 2026 rise; low traffic allowance reported) | https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ |
| Hostatom | Thailand | 2 vCore / 4 GB / 40 GB | ฿590 + VAT | https://www.hostatom.com/cloud-vps/ |
| Ruk-Com | Thailand | 2 core / 4 GB / 40 GB | ฿800–950 + VAT (pages conflict) | https://ruk-com.cloud/en/cloud-vps/ |

**Recommendation:** AWS Lightsail Singapore at $12, or Hostatom (in Thailand, priced in baht, about ฿631 including VAT) if you'd rather pay a Thai company.

## Site address model

| Stage | Address | Cost to us | Charge to customer |
|---|---|---|---|
| Preview (before sale) | `https://<platform>/s/<slug>/` | $0 | Free |
| Signed up | `https://<slug>.<platform-domain>` (subdomain) | $0 | Included in setup |
| Own domain, **we manage** | `https://theirname.com` | .com ~$11.25/yr (Vercel API price, grade A) | Add-on, e.g. ฿590/yr |
| Own domain, **they manage** | They point DNS (A record) at our VPS | $0 | Free; we send DNS instructions |
| `.co.th` | Needs Thai company docs or a Thai trademark; registered with THNIC (from ฿856/yr) after manual review | — | Assisted service, quote per case |

Notes:
- Register the domain **in the customer's name**, with us as the technical contact, so they can leave whenever they want. This builds trust and avoids disputes.
- For automated .com registration: Cloudflare Registrar API (domains must use Cloudflare DNS), Porkbun API, or Namecheap API (requires ≥20 domains or ≥$50 balance/spend). No public API was found for `.co.th`.
- PADI dive shops: PADI does not allow "padi" in domain names.

## Deploy

```bash
# on a fresh Ubuntu VPS with Docker installed
git clone <repo> && cd thai-sme-platform/deploy
cp .env.example .env    # set PLATFORM_DOMAIN, ACME_EMAIL, ADMIN_KEY
# DNS: A record for PLATFORM_DOMAIN and *.PLATFORM_DOMAIN -> VPS IP
docker compose up -d --build
```

- **Adding a customer:** add `sites/content/<slug>.yaml` and a line in `sites/domains.yaml`, then run `docker compose restart app`.
- **Owner bookings page:** `https://<platform>/admin/<slug>?key=<ADMIN_KEY>`. This is a pilot shortcut; give each owner their own login before launch.

Validated: `caddy adapt` accepts `deploy/Caddyfile` (Caddy 2.8.4). The Docker image has
not been built in this environment (no Docker daemon available).
