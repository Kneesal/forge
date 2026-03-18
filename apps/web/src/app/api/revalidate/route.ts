import { timingSafeEqual } from "node:crypto"
import { revalidateTag } from "next/cache"
import { NextResponse } from "next/server"
import { env } from "@/env"
import { buildExperienceTags } from "@/lib/content"

type StrapiWebhookPayload = {
  event: string
  model: string
  entry: {
    id: number
    documentId?: string
    slug?: string
    locale?: string
    isHomepage?: boolean
  }
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  const secret =
    url.searchParams.get("secret") ??
    request.headers.get("x-revalidation-secret")

  if (
    !secret ||
    secret.length !== env.REVALIDATION_SECRET.length ||
    !timingSafeEqual(Buffer.from(secret), Buffer.from(env.REVALIDATION_SECRET))
  ) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let payload: StrapiWebhookPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  if (payload.model !== "experience") {
    return NextResponse.json({ message: "ignored", model: payload.model })
  }

  const slug = payload.entry?.slug
  const isHomepage = payload.entry?.isHomepage

  const tags: string[] = []
  if (slug) {
    tags.push(...buildExperienceTags(slug))
  }
  if (isHomepage) {
    tags.push(...buildExperienceTags())
  }
  // If we cannot determine the slug, revalidate everything
  if (tags.length === 0) {
    tags.push("experience:all")
  }

  // Deduplicate tags
  const uniqueTags = [...new Set(tags)]
  for (const tag of uniqueTags) {
    revalidateTag(tag, "default")
  }

  return NextResponse.json({
    revalidated: true,
    tags: uniqueTags,
    event: payload.event,
  })
}
