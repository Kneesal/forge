---
title: "ISR with Strapi Webhook Revalidation"
category: web
date: 2026-03-19
tags:
  - isr
  - next-js
  - strapi
  - caching
  - webhook
  - revalidation
  - unstable-cache
components:
  - apps/web/src/lib/content.ts
  - apps/web/src/app/api/revalidate/route.ts
  - apps/web/src/app/[slug]/page.tsx
  - apps/web/src/app/[slug]/[locale]/page.tsx
severity: high
related:
  - docs/solutions/platform/new-app-ci-and-deployment-patterns.md
---

# ISR with Strapi Webhook Revalidation

## Problem

The `[slug]` and `[slug]/[locale]` routes under `/watch` used pure SSR — every request hit Strapi GraphQL with `fetchPolicy: "no-cache"`. This added unnecessary latency and load to the CMS when content rarely changes.

## Solution

Switch to ISR with infinite cache (`revalidate = false`) using `unstable_cache` with tag-based on-demand revalidation. Strapi's existing webhook fires on content changes and calls the Next.js revalidation endpoint.

### Architecture

```
Strapi CMS --webhook--> /api/revalidate --revalidateTag()--> Next.js data cache
                                                                    |
User request --> [slug]/[locale] page --> unstable_cache (tagged) ---+
```

### Tag Strategy

Two layers of tags prevent webhook calls from purging all pages:

- **Cache tags** (`buildCacheTags`): `["experience:all", "experience:slug:{slug}"]` — attached to cache entries, enables both targeted and bulk purge
- **Webhook tags** (`buildExperienceTags`): `["experience:slug:{slug}"]` — only the specific slug, used by the webhook endpoint for targeted invalidation

The `experience:all` tag exists on all cache entries so a manual bulk purge can clear everything, but the webhook never fires it unless the slug is unknown.

### Draft Mode

Draft mode bypasses the cache entirely by calling `getWatchExperienceUncached` directly. This ensures editors see live Strapi data during preview.

### Locale Behavior Change

The `/watch/[slug]` route (without locale) defaults to English instead of detecting from Accept-Language. ISR caches responses per URL path — Accept-Language varies per user and would serve the wrong locale from cache. Users wanting a specific locale use `/watch/[slug]/[locale]`.

## Key Gotchas

1. **`revalidateTag(tag, "default")` in Next.js 16**: The second parameter is a cache life profile. When using `unstable_cache` (not `"use cache"`), pass `"default"`. Verify in staging that this actually invalidates the entries.

2. **Error caching**: `unstable_cache` caches return values including errors. A 300s TTL safety net (`revalidate: 300`) ensures cached errors self-heal within 5 minutes.

3. **Timing-safe secret comparison**: Use `crypto.timingSafeEqual` for webhook secret validation, never `===` or `!==`. Same pattern as `apps/manager/src/lib/auth.ts`.

4. **Secret in query string**: The endpoint accepts secrets via both `?secret=` and `x-revalidation-secret` header. Query strings leak to logs — prefer header-based auth when configuring the Strapi webhook.

5. **Doppler project**: Web secrets live in the `forge-web` Doppler project (not `cms`). The `REVALIDATION_SECRET` must be set in `dev`, `stg`, and `prd` configs with unique values per environment.

## Migration Path

`unstable_cache` is legacy in Next.js 16. When ready to migrate:

1. Enable `"use cache"` in `next.config.mjs`
2. Replace `unstable_cache` wrapper with `"use cache"` directive + `cacheTag()` + `cacheLife("default")`
3. Remove the second argument from `revalidateTag()` calls (or keep `"default"`)

## Prevention

- Always separate cache-association tags (broad) from webhook-revalidation tags (targeted)
- Never cache errors indefinitely — add a TTL safety net
- Use `crypto.timingSafeEqual` for any secret comparison in API routes
- Test revalidation end-to-end in staging before relying on it in production

## Cross-References

- [New App CI & Deployment Patterns](../platform/new-app-ci-and-deployment-patterns.md) — env validation and security patterns
- PR: direct push to main (ISR implementation)
