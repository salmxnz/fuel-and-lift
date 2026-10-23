import type { ReactNode } from "react"
import { ShareIcon } from "@/components/ui/icons"

function Steps({ children }: { children: ReactNode }) {
  return <ol className="m-0 flex list-none flex-col gap-3.5 p-0 text-[15px] leading-[1.4] [counter-reset:step]">{children}</ol>
}

function Step({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 [counter-increment:step] before:flex before:h-7 before:w-7 before:flex-none before:items-center before:justify-center before:rounded-full before:bg-ink before:text-[13px] before:font-extrabold before:text-white before:content-[counter(step)]">
      <span className="pt-[3px]">{children}</span>
    </li>
  )
}

export function IPhoneSteps() {
  return (
    <Steps>
      <Step>
        In Safari, tap <ShareIcon size={18} className="inline -mt-1" aria-label="Share" /> <strong>Share</strong>. Can&apos;t see it? Tap{" "}
        <strong>•••</strong> first.
      </Step>
      <Step>
        Scroll down and choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
      </Step>
      <Step>Open adebite from your Home Screen and sign in.</Step>
    </Steps>
  )
}

export function AndroidSteps() {
  return (
    <Steps>
      <Step>
        In Chrome, tap <strong>Install</strong> when it&apos;s offered, or open the <strong>⋮</strong> menu.
      </Step>
      <Step>
        Choose <strong>Add to Home screen</strong>, then <strong>Install</strong>.
      </Step>
      <Step>Open adebite from your Home Screen and sign in.</Step>
    </Steps>
  )
}

export function OpenInSafariSteps() {
  return (
    <Steps>
      <Step>Copy this page&apos;s link.</Step>
      <Step>
        Open <strong>Safari</strong> and paste it into the address bar.
      </Step>
      <Step>
        Tap <ShareIcon size={18} className="inline -mt-1" aria-label="Share" /> <strong>Share</strong>, then{" "}
        <strong>Add to Home Screen</strong>.
      </Step>
    </Steps>
  )
}
