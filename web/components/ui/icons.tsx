// Icons drawn exactly as in the approved designs (24px grid, round caps).
import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }

function Svg({ size = 20, strokeWidth = 1.8, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

export const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10.5 12 4l8 6.5V20H4Z" />
    <path d="M10 20v-5h4v5" />
  </Svg>
)
export const DumbbellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11" />
  </Svg>
)
export const ChartIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h16M6 15l4-5 3 3 5-6" />
  </Svg>
)
export const PersonIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20c1.3-3.6 4-5.5 7-5.5s5.7 1.9 7 5.5" />
  </Svg>
)
export const PlusIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)
export const MinusIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M5 12h14" />
  </Svg>
)
export const BackIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M15 5l-7 7 7 7" />
  </Svg>
)
export const ChevronRightIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M9 5l7 7-7 7" />
  </Svg>
)
export const ChevronDownIcon = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M6 9l6 6 6-6" />
  </Svg>
)
export const ChevronUpIcon = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M6 15l6-6 6 6" />
  </Svg>
)
export const CloseIcon = (p: IconProps) => (
  <Svg strokeWidth={2.2} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
)
export const CheckIcon = (p: IconProps) => (
  <Svg strokeWidth={2.6} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
)
export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
)
export const BowlIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h18a9 9 0 0 1-18 0Z" />
    <path d="M8 8c0-1.5 1-2 1-3.5M12 8c0-1.5 1-2 1-3.5M16 8c0-1.5 1-2 1-3.5" />
  </Svg>
)
export const ScaleIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <path d="M9 10a3 3 0 0 1 6 0" />
    <path d="M12 10l1.5-1.5" />
  </Svg>
)
export const CameraIcon = (p: IconProps) => (
  <Svg strokeWidth={1.9} {...p}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
)
export const ListIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h16M4 18h10" />
  </Svg>
)
export const TemplatesIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M8 9h8M8 13h8M8 17h5" />
  </Svg>
)
export const StoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 10h16l-1.5-5h-13Z" />
    <path d="M5 10v9h14v-9" />
    <path d="M10 19v-5h4v5" />
  </Svg>
)
/** The Shop (community). Not StoreIcon, which is restaurants. */
export const ShopIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 8h13l-1 12h-11Z" />
    <path d="M9 10.5V7a3 3 0 0 1 6 0v3.5" />
  </Svg>
)
export const LockIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Svg>
)
export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5Z" />
  </Svg>
)
export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5h14v10H9l-4 4Z" />
  </Svg>
)
export const BarcodeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3M8 9v6M11 9v6M13.5 9v6M16 9v6" />
  </Svg>
)
export const SearchIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4-4" />
  </Svg>
)
export const DragIcon = ({ size = 18, ...p }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
)
export const CheerIcon = (p: IconProps) => (
  <Svg strokeWidth={1.9} {...p}>
    <path d="M7 11V20H4V11ZM7 11l4-7c1.7 0 2.5 1 2.2 2.6L12.6 10H19a1.6 1.6 0 0 1 1.6 1.9l-1.4 6.6A2 2 0 0 1 17.2 20H7" />
  </Svg>
)
export const ShareIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v11M8 8l4-4 4 4" />
    <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
  </Svg>
)
export const BellIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </Svg>
)
export const TargetIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </Svg>
)
export const GearIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
  </Svg>
)
export const FriendsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="9" r="3.2" />
    <circle cx="16.5" cy="10" r="2.6" />
    <path d="M3.5 19c.9-3 3-4.6 5.5-4.6s4.6 1.6 5.5 4.6M14.5 15c2.6-.5 4.8.7 6 3.5" />
  </Svg>
)
export const InfoIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
)
export const TrendIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M4 16l5-5 4 4 7-8" />
    <path d="M15 7h5v5" />
  </Svg>
)
export const PencilIcon = (p: IconProps) => (
  <Svg strokeWidth={2} {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16Z" />
  </Svg>
)
export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" />
  </Svg>
)
export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8v4.5l3 2" />
  </Svg>
)
export const StarIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4l2.3 4.9 5.2.6-3.9 3.6 1.1 5.2L12 15.7l-4.7 2.6 1.1-5.2L4.5 9.5l5.2-.6Z" />
  </Svg>
)
export const FireIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 2.6-5.4 3.6-8.3.3-.9 1.4-1.1 1.9-.3.9 1.4 1.1 2.8 1 4.1 1-.6 1.7-1.6 2-2.7.2-.8 1.2-1 1.7-.4 1.4 1.7 2.8 4.1 2.8 6.9 0 4.2-3 6.9-6.5 6.9Z" />
    <path d="M12 21c-1.7 0-2.9-1.2-2.9-2.8 0-1.8 1.4-2.7 2.1-4.1.4.9 1.2 1.5 1.8 1.9.8.5 1.9 1.3 1.9 2.4 0 1.5-1.3 2.6-2.9 2.6Z" />
  </Svg>
)
export const TrophyIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
    <path d="M8 6H5.5A2.5 2.5 0 0 0 8 10.4M16 6h2.5a2.5 2.5 0 0 1-2.5 4.4" />
    <path d="M12 13v4M8.5 20h7M10 17h4v3h-4z" />
  </Svg>
)

/** Lat-pulldown style machine drawing used as the default exercise art. */
export function MachineArt({ size = 56, label }: { size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      stroke="#2E1A24"
      strokeWidth={size > 80 ? 1.8 : 2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d="M14 58V8h36" />
      <path d="M50 8v6" />
      <path d="M38 14h24" />
      <path d="M50 14v14" />
      <path d="M20 58h28" />
      <path d="M28 46h18" />
      <path d="M32 46v12" />
      <path d="M30 38h14" />
      <rect x="16" y="22" width="8" height="14" rx="2" fill="#F6B8CA" />
      <path d="M20 8v14" />
    </svg>
  )
}

/** Treadmill-ish drawing for cardio blocks. */
export function CardioArt({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="#2E1A24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 50h40l8-8" />
      <path d="M8 56h44" />
      <path d="M44 42V14h8" />
      <circle cx="26" cy="14" r="5" fill="#F6B8CA" />
      <path d="M26 20l-4 12 8 6v10M22 32l-8 4M28 24l8 4" />
    </svg>
  )
}
export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5.5" cy="12" r="1.1" fill="currentColor" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" />
    <circle cx="18.5" cy="12" r="1.1" fill="currentColor" />
  </Svg>
)
