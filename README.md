# Arhideea CRM

Oferte, clienți, plăți, contracte, certificate de urbanism și avize.
Rulează pe Cloudflare Pages (pagini statice în `public/` + funcții în `functions/`),
cu date în D1 și fișiere în KV. Accesul e protejat de Cloudflare Access și verificat
din nou în `functions/_middleware.js` (fără token valid nu se servește nimic).

## Legături (wrangler.toml)
- `DB` – baza D1 `arhideea-crm` (tabelul `docs` se creează automat; schema în `schema.sql`)
- `FILES` – namespace KV pentru PDF-uri (CU, buletine, acte)

## Variabile în Cloudflare (Pages → Settings → Variables and Secrets)
- `ACCESS_TEAM_DOMAIN` – ex. `https://arhideea.cloudflareaccess.com`
- `ACCESS_AUD` – Application Audience (AUD) tag din aplicația Access
- `ALLOWED_EMAILS` – adresele permise, separate prin virgulă (dublă verificare)
- `ANTHROPIC_API_KEY` – **secret**, pentru citirea automată a CU-urilor și a buletinelor

## Local
`npx wrangler pages dev public` (middleware-ul refuză tot fără variabilele Access).
