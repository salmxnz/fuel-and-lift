// Food pictures a meal can have (public/food/<key>.png, installed with
// `npm run food-icons`). Keys are stored on entries and saved meals: keep this
// list in sync with api/internal/foodicon/foodicon.go and never rename one.

export type FoodIconGroup = "Meals" | "Bread and dairy" | "Fruit and veg" | "Snacks and sweets" | "Drinks" | "Other"

export type FoodIcon = {
  key: string
  label: string
  group: FoodIconGroup
  /** Words in a meal's name that suggest this picture, most telling first. */
  words: string[]
}

export const FOOD_ICONS: FoodIcon[] = [
  { key: "pizza", label: "Pizza", group: "Meals", words: ["pizza", "margherita", "pepperoni", "calzone"] },
  { key: "burger", label: "Burger", group: "Meals", words: ["burger", "boxmaster", "big mac", "whopper", "zinger"] },
  { key: "fries", label: "Fries", group: "Meals", words: ["fries", "chips and", "french fries", "frites", "wedges"] },
  { key: "hot_dog", label: "Hot dog", group: "Meals", words: ["hot dog", "hotdog", "sausage"] },
  { key: "taco", label: "Taco", group: "Meals", words: ["taco", "burrito", "wrap", "fajita", "quesadilla", "kebab", "shawarma", "farata", "roti", "dholl puri"] },
  { key: "sandwich", label: "Sandwich", group: "Meals", words: ["sandwich", "sub", "panini", "baguette", "club"] },
  {
    key: "rice_bowl",
    label: "Rice bowl",
    group: "Meals",
    words: ["rice", "biryani", "briani", "curry", "cari", "noodle", "mine frire", "fried rice", "poke", "dal", "dholl", "ramen", "pho"],
  },
  { key: "chicken", label: "Chicken", group: "Meals", words: ["chicken", "kfc", "wings", "nuggets", "drumstick", "poulet", "turkey"] },
  { key: "meat", label: "Meat", group: "Meals", words: ["steak", "beef", "lamb", "pork", "ham", "bacon", "mutton", "venison", "ribs"] },
  { key: "canned_fish", label: "Fish", group: "Meals", words: ["tuna", "sardine", "salmon", "fish", "mackerel", "prawn", "shrimp", "octopus"] },
  { key: "fried_egg", label: "Eggs", group: "Meals", words: ["egg", "omelette", "omelet", "scrambled", "shakshuka"] },
  { key: "bread", label: "Bread", group: "Bread and dairy", words: ["bread", "bun", "croissant", "bagel", "loaf", "brioche", "pain"] },
  { key: "toast", label: "Toast", group: "Bread and dairy", words: ["toast", "crumpet"] },
  { key: "cheese", label: "Cheese", group: "Bread and dairy", words: ["cheese", "cheddar", "mozzarella", "feta", "halloumi"] },
  { key: "milk", label: "Milk", group: "Bread and dairy", words: ["milk", "yogurt", "yoghurt", "protein shake", "shake", "kefir", "lassi"] },
  { key: "honey", label: "Honey", group: "Bread and dairy", words: ["honey", "jam", "peanut butter", "nutella", "spread"] },
  { key: "apple", label: "Apples", group: "Fruit and veg", words: ["apple", "pear", "orange", "fruit", "peach", "plum", "mango", "lychee"] },
  { key: "banana", label: "Bananas", group: "Fruit and veg", words: ["banana", "plantain"] },
  { key: "watermelon", label: "Watermelon", group: "Fruit and veg", words: ["watermelon", "melon", "pineapple", "papaya"] },
  { key: "bell_pepper", label: "Peppers", group: "Fruit and veg", words: ["pepper", "capsicum", "tomato", "vegetable", "veg"] },
  { key: "chili", label: "Chilli", group: "Fruit and veg", words: ["chilli", "chili", "piment", "spicy"] },
  { key: "cabbage", label: "Greens", group: "Fruit and veg", words: ["salad", "cabbage", "lettuce", "spinach", "broccoli", "greens", "kale", "coleslaw"] },
  { key: "mushroom", label: "Mushrooms", group: "Fruit and veg", words: ["mushroom"] },
  { key: "chips", label: "Crisps", group: "Snacks and sweets", words: ["crisps", "chips", "pringles", "doritos", "lays", "nachos"] },
  { key: "popcorn", label: "Popcorn", group: "Snacks and sweets", words: ["popcorn"] },
  { key: "donut", label: "Donut", group: "Snacks and sweets", words: ["donut", "doughnut"] },
  { key: "cupcake", label: "Cake", group: "Snacks and sweets", words: ["cupcake", "cake", "muffin", "brownie", "gateau", "cookie", "biscuit"] },
  { key: "pie", label: "Pie", group: "Snacks and sweets", words: ["pie", "tart", "quiche", "crumble"] },
  { key: "sweet", label: "Sweets", group: "Snacks and sweets", words: ["sweet", "candy", "chocolate", "toffee", "gummy", "bar"] },
  { key: "lollipop", label: "Lollipop", group: "Snacks and sweets", words: ["lollipop", "ice cream", "gelato", "sorbet"] },
  { key: "candy_cane", label: "Candy cane", group: "Snacks and sweets", words: ["candy cane"] },
  { key: "coffee", label: "Coffee", group: "Drinks", words: ["coffee", "latte", "cappuccino", "espresso", "americano", "mocha", "tea", "chai", "hot chocolate"] },
  {
    key: "soda",
    label: "Soda",
    group: "Drinks",
    words: ["soda", "coke", "cola", "pepsi", "sprite", "fanta", "lemonade", "juice", "energy drink", "red bull", "iced tea"],
  },
  { key: "beer", label: "Beer", group: "Drinks", words: ["beer", "lager", "ale", "phoenix", "wine", "cider", "rum", "cocktail", "whisky", "vodka"] },
  { key: "salt", label: "Seasoning", group: "Other", words: ["salt", "seasoning", "sauce", "ketchup", "mayo", "dressing"] },
]

export const FOOD_ICON_GROUPS: FoodIconGroup[] = ["Meals", "Bread and dairy", "Fruit and veg", "Snacks and sweets", "Drinks", "Other"]

const BY_KEY = new Map(FOOD_ICONS.map((i) => [i.key, i]))

export function foodIcon(key: string | null | undefined): FoodIcon | undefined {
  return key ? BY_KEY.get(key) : undefined
}

export function foodIconSrc(key: string): string {
  return `/food/${key}.png`
}

/** Where word first appears in text as a whole word or phrase ("bar" not in "barbecue"), or -1. */
function wordAt(text: string, word: string): number {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const m = new RegExp(`(^|[^\\p{L}])${esc}(?![\\p{L}])`, "u").exec(text)
  return m ? m.index + m[1].length : -1
}

/**
 * A picture for a meal that has none (older entries, barcode and search
 * logs), from the earliest word in its name that suggests one.
 */
export function guessIcon(name: string): string | null {
  const text = name.toLowerCase()
  let best: { key: string; at: number } | null = null
  for (const icon of FOOD_ICONS) {
    for (const w of icon.words) {
      const at = wordAt(text, w)
      if (at >= 0 && (!best || at < best.at)) best = { key: icon.key, at }
    }
  }
  return best?.key ?? null
}

/** The stored icon, else a guess from the name. */
export function iconFor(entry: { icon?: string | null; name: string }): string | null {
  return foodIcon(entry.icon)?.key ?? guessIcon(entry.name)
}
