import {
  Bike, Book, BookOpen, Briefcase, Calendar, Camera, CheckSquare, Coffee, Compass, Dumbbell, Film, Flag,
  Flower2, Folder, Gamepad2, Gift, Globe, GraduationCap, Heart, Home, Lightbulb, ListChecks, MapPin, Music,
  Palette, PiggyBank, Plane, Sprout, Rocket, ShoppingBag, Smile, Sparkles, Star, Target, Tv, Utensils, Wallet,
  type LucideIcon, Cat, Sun, Moon, Pencil, StickyNote,
} from 'lucide-react'

export const ICONS: Record<string, LucideIcon> = {
  sparkles: Sparkles, star: Star, heart: Heart, target: Target, flag: Flag, rocket: Rocket,
  film: Film, tv: Tv, music: Music, book: Book, 'book-open': BookOpen, gamepad: Gamepad2,
  plane: Plane, 'map-pin': MapPin, compass: Compass, globe: Globe, camera: Camera, bike: Bike,
  coffee: Coffee, utensils: Utensils, flower: Flower2, plant: Sprout, sun: Sun, moon: Moon,
  wallet: Wallet, 'piggy-bank': PiggyBank, 'shopping-bag': ShoppingBag, gift: Gift,
  lightbulb: Lightbulb, 'graduation-cap': GraduationCap, pencil: Pencil, palette: Palette,
  calendar: Calendar, 'list-checks': ListChecks, 'check-square': CheckSquare, briefcase: Briefcase,
  home: Home, dumbbell: Dumbbell, smile: Smile, cat: Cat, folder: Folder, note: StickyNote,
}

// 선택 목록에는 업무용으로도 어울리는 선형 아이콘만 노출 (기존 데이터 호환을 위해 매핑은 유지)
const HIDDEN = new Set(['cat', 'flower', 'smile'])
export const ICON_NAMES = Object.keys(ICONS).filter((n) => !HIDDEN.has(n))

export function CategoryIcon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  const Icon = ICONS[name] ?? Folder
  return <Icon size={size} strokeWidth={1.7} className={className} />
}
