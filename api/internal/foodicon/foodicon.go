// Package foodicon is the fixed set of food pictures a meal can have. The AI
// picks one while estimating; people pick or change it by hand.
//
// Keys are stored on entries and saved meals, so never rename one: add new
// keys instead. Keep this list in sync with web/lib/food-icons.ts, which has
// the labels and the pictures (public/food/<key>.png).
package foodicon

// None is what the AI answers when no picture fits. It's never stored.
const None = "none"

// Keys are the pictures, roughly by kind of food.
var Keys = []string{
	// Meals
	"pizza", "burger", "fries", "hot_dog", "taco", "sandwich", "rice_bowl",
	"chicken", "meat", "canned_fish", "fried_egg",
	// Bread and dairy
	"bread", "toast", "cheese", "milk", "honey",
	// Fruit and veg
	"apple", "banana", "watermelon", "bell_pepper", "chili", "cabbage", "mushroom",
	// Snacks and sweets
	"chips", "popcorn", "donut", "cupcake", "pie", "sweet", "lollipop", "candy_cane",
	// Drinks
	"coffee", "soda", "beer",
	// Other
	"salt",
}

var valid = func() map[string]bool {
	m := make(map[string]bool, len(Keys))
	for _, k := range Keys {
		m[k] = true
	}
	return m
}()

// Valid reports whether key is a known picture.
func Valid(key string) bool { return valid[key] }

// Choices is what the AI may answer: every key, then None.
func Choices() []string { return append(append([]string{}, Keys...), None) }
