"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useMemo, useState } from "react"
import { Button, Chip, ErrorCard, PageHeader, Skeleton, Spinner } from "@/components/ui/primitives"
import { SearchIcon } from "@/components/ui/icons"
import type { Food, FoodsResponse } from "@/lib/api/types"
import { useApi } from "@/lib/api/use-api"
import { kcal } from "@/lib/format"
import { fromEntryItem, toEntryItems, totals } from "@/lib/items"
import { targetFromParams } from "@/lib/meal-target"
import { ItemsEditor } from "./items-editor"
import { LogFooter, QuestionsCard } from "./estimate-parts"
import { useEstimate, useLogActions } from "./use-estimate"
import { IconChooser, useIconChoice } from "./icon-picker"
import { guessIcon } from "@/lib/food-icons"

const CHAINS = ["McDonald's", "KFC"] as const
type ChainChoice = (typeof CHAINS)[number] | "mine" | null

/** Chain-Menu.dc.html: build a restaurant meal, official numbers where known. */
export function RestaurantScreen() {
  const params = useSearchParams()
  const target = useMemo(() => targetFromParams(new URLSearchParams(params.toString())), [params])
  const est = useEstimate("restaurant")
  const [text, setText] = useState("")
  const [chain, setChain] = useState<ChainChoice>(null)
  const [query, setQuery] = useState("")
  const actions = useLogActions({ target, origin: "restaurant", estimateId: est.estimate?.estimate_id })
  const pic = useIconChoice(est.estimate?.icon ?? guessIcon(est.title))

  // "Your places": your own foods and the shared chain items.
  const foods = useApi<FoodsResponse>(chain === "mine" ? `foods?q=${encodeURIComponent(query)}` : null)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    if (chain === "mine") {
      setQuery(t)
      return
    }
    void est.run({ text: chain ? `${chain}: ${t}` : t })
  }

  function addFood(food: Food) {
    const grams = food.serving_grams ?? 100
    const f = grams / 100
    const item = fromEntryItem({
      name: food.serving_name ? `${food.name} (${food.serving_name})` : food.name,
      grams,
      kcal: Math.round(food.per_100g.kcal * f),
      protein_g: food.per_100g.protein_g * f,
      carbs_g: food.per_100g.carbs_g * f,
      fat_g: food.per_100g.fat_g * f,
      assumption: food.chain ?? food.brand,
      source: food.source === "chain" ? "official" : "database",
    })
    est.setItems([...est.items, item])
    if (!est.title) est.setTitle(food.chain ? `${food.chain} meal` : food.name)
  }

  const hasItems = est.items.length > 0
  const ready = est.status === "ready" || est.status === "refining" || hasItems
  const entryItems = toEntryItems(est.items)
  const t = totals(est.items)

  return (
    <main className="app-column flex min-h-dvh flex-col gap-3">
      <PageHeader
        back="history"
        eyebrow={target.label}
        title="Add from a restaurant"
        titleClassName="text-[20px] tracking-[-0.01em]"
      />

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex min-h-[48px] items-center gap-2.5 rounded-tile border border-line bg-white px-3.5">
          <SearchIcon size={18} className="text-muted" />
          <span className="sr-only">What did you order?</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={chain === "mine" ? "Search your places" : "kfc zinger meal, no drink"}
            enterKeyHint="search"
            maxLength={300}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none"
          />
          {est.status === "loading" ? <Spinner size={18} /> : null}
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Restaurant">
          {CHAINS.map((c) => (
            <Chip key={c} role="pressed" selected={chain === c} onClick={() => setChain(chain === c ? null : c)}>
              {c}
            </Chip>
          ))}
          <Chip role="pressed" selected={chain === "mine"} onClick={() => setChain(chain === "mine" ? null : "mine")}>
            Your places
          </Chip>
        </div>
        {chain !== "mine" ? (
          <Button type="submit" size="md" variant="outline" disabled={!text.trim() || est.status === "loading"}>
            {ready ? "Build it again" : "Build my meal"}
          </Button>
        ) : (
          <Button type="submit" size="md" variant="outline" disabled={!text.trim()}>
            Search
          </Button>
        )}
      </form>

      {chain === "mine" ? (
        <section aria-label="Your places" className="flex flex-col rounded-card bg-white px-3.5 py-1">
          {foods.loading ? (
            <div className="flex flex-col gap-2 py-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : foods.error ? (
            <p className="m-0 py-3 text-[14px] text-danger">{foods.error.message}</p>
          ) : (foods.data?.foods.length ?? 0) === 0 ? (
            <p className="m-0 py-3 text-[14px] text-muted">
              {query ? `Nothing saved matches “${query}”.` : "Foods you save from restaurants show up here."}
            </p>
          ) : (
            foods.data?.foods.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => addFood(f)}
                className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line-soft py-2 text-left last:border-b-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px] font-bold">{f.name}</span>
                  <span className="text-[12px] text-muted">{f.chain ?? f.brand ?? "Your food"}</span>
                </span>
                <span className="flex-none text-[14px] font-semibold">
                  {kcal(f.per_100g.kcal * ((f.serving_grams ?? 100) / 100))} kcal
                </span>
              </button>
            ))
          )}
        </section>
      ) : null}

      {est.status === "error" && est.error ? (
        <div className="flex flex-col gap-2">
          <ErrorCard message={est.error} />
          <Link href={`/log/manual?${params.toString()}`} className="text-[14px] font-semibold text-protein">
            Enter it manually instead
          </Link>
        </div>
      ) : null}

      {est.status === "loading" ? (
        <div role="status" className="flex flex-col gap-2">
          <span className="sr-only">Building your meal…</span>
          <Skeleton className="h-[70px] rounded-card" />
          <Skeleton className="h-[160px] rounded-card" />
        </div>
      ) : null}

      {ready && est.status !== "loading" ? (
        <>
          <article aria-label={est.title || "Your meal"} className="flex flex-col overflow-hidden rounded-[20px] bg-white">
            <div className="flex items-center gap-3 bg-ink px-4 py-3.5 text-white">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[12px] text-night-muted">{chain && chain !== "mine" ? chain : "Restaurant"}</span>
                <label>
                  <span className="sr-only">Meal name</span>
                  <input
                    value={est.title}
                    onChange={(e) => est.setTitle(e.target.value)}
                    placeholder="Name this meal"
                    maxLength={80}
                    className="w-full bg-transparent text-[20px] font-extrabold tracking-[-0.01em] text-white outline-none placeholder:text-night-muted"
                  />
                </label>
              </div>
              <IconChooser icon={pic.icon} onClick={pic.openPicker} size={44} />
            </div>
            {est.questions.length > 0 ? (
              <div className="border-b border-line-soft">
                <QuestionsCard
                  questions={est.questions}
                  answers={est.answers}
                  onAnswer={est.answer}
                  busy={est.status === "refining"}
                />
              </div>
            ) : null}
            <div className={est.status === "refining" ? "pointer-events-none opacity-60" : undefined}>
              <ItemsEditor
                items={est.items}
                onChange={est.setItems}
                variant="checklist"
                showGrams={false}
                addLabel="Add an item"
                label="Items in this meal"
              />
            </div>
            <div className="flex items-center justify-between gap-3 bg-field px-4 py-3">
              <span className="text-[13px] text-muted">Totals update as you edit</span>
              <span aria-live="polite" className="text-[20px] font-extrabold">
                {kcal(t.kcal)} <span className="text-[13px] font-medium text-muted">kcal</span>
              </span>
            </div>
          </article>
          <p className="m-0 px-1 text-[12px] leading-[1.45] text-muted">
            Menus and portions differ by country. Items you save here become your own, so next time it&apos;s one tap.
          </p>
          <LogFooter
            mealLabel={target.label}
            saving={actions.saving}
            logging={actions.logging}
            saved={!!actions.savedId}
            disabled={est.status === "refining" || entryItems.length === 0}
            onSave={() => actions.save(est.title, entryItems, pic.icon)}
            onLog={() => actions.log(est.title, entryItems, pic.icon)}
          />
          {pic.sheet}
        </>
      ) : (
        <div className="pb-safe" />
      )}
    </main>
  )
}
