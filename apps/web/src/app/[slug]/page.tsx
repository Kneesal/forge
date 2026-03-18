import type { Metadata } from "next"
import { draftMode } from "next/headers"
import { getLocale, isLocale, DEFAULT_LOCALE } from "@/lib/locale"
import { getWatchExperience, getWatchExperienceUncached } from "@/lib/content"
import { getExperienceMetadata } from "@/lib/experience-metadata"
import { SectionRenderer, type Section } from "@/components/sections"
import { ExperienceEmpty } from "@/components/ExperienceEmpty"
import { ExperienceError } from "@/components/ExperienceError"

export const revalidate = false

type PageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params

  // If slug is a locale (e.g. /watch/en), let the homepage handle metadata.
  if (isLocale(slug)) return {}

  const draft = await draftMode()
  const locale = draft.isEnabled ? await getLocale() : DEFAULT_LOCALE
  return getExperienceMetadata(locale, slug, {
    pathPrefix: "watch",
    uncached: draft.isEnabled,
  })
}

export default async function SlugPage({ params }: PageProps) {
  const { slug } = await params
  const draft = await draftMode()

  // ISR: use DEFAULT_LOCALE when no locale in URL (Accept-Language varies per user, incompatible with caching)
  // Draft: use Accept-Language detection as before
  const locale = isLocale(slug)
    ? slug
    : draft.isEnabled
      ? await getLocale()
      : DEFAULT_LOCALE

  const fetcher = draft.isEnabled
    ? getWatchExperienceUncached
    : getWatchExperience
  const result = isLocale(slug)
    ? await fetcher(locale)
    : await fetcher(locale, slug)

  if (result.error) {
    return <ExperienceError message={result.error.message} />
  }

  const experience = result.data
  const blocks = (experience?.blocks ?? []).filter(
    (b): b is Section => b !== null && b.__typename !== "Error",
  )
  if (!blocks.length) {
    return <ExperienceEmpty />
  }

  return (
    <main className="min-h-screen bg-stone-900">
      {blocks.map((block, i) => {
        const key =
          "id" in block && typeof block.id === "string"
            ? block.id
            : `block-${i}`
        return <SectionRenderer key={key} section={block} />
      })}
    </main>
  )
}
