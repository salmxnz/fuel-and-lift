// Real exercise photos from free-exercise-db (github.com/yuhonas/free-exercise-db,
// public domain / Unlicense): one photo per library exercise, resized and
// committed to public/exercises/<file>.jpg. Run `npm run exercise-photos` to
// fetch them again; the migration 000018_exercise_pictures_muscles sets each
// library exercise's media_url to the same file. Exercises with no honest
// match (air bike, assisted pull-up machine, burpee, ski erg, swimming, walk)
// keep their icon.
import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import sharp from "sharp"

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, "..", "public", "exercises")
const BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises"

/** Library name → [dataset id, frame]. Frame 0 is the start position; 1 where 0 is a set-up shot. */
export const PHOTOS = {
  "Ab wheel": ["Ab_Roller", 0],
  "Arnold press": ["Arnold_Dumbbell_Press", 0],
  "Back extension": ["Hyperextensions_Back_Extensions", 0],
  "Back squat": ["Barbell_Squat", 0],
  "Barbell curl": ["Barbell_Curl", 0],
  "Barbell row": ["Bent_Over_Barbell_Row", 0],
  "Barbell shrug": ["Barbell_Shrug", 0],
  "Battle ropes": ["Battling_Ropes", 0],
  "Bench press": ["Barbell_Bench_Press_-_Medium_Grip", 0],
  "Box jump": ["Front_Box_Jump", 0],
  "Bulgarian split squat": ["Split_Squat_with_Dumbbells", 0],
  "Cable crossover": ["Cable_Crossover", 0],
  "Cable crunch": ["Cable_Crunch", 0],
  "Cable curl": ["Standing_Biceps_Cable_Curl", 0],
  "Cable kickback": ["One-Legged_Cable_Kickback", 0],
  "Cable lateral raise": ["Cable_Seated_Lateral_Raise", 0],
  "Cable overhead extension": ["Cable_Rope_Overhead_Triceps_Extension", 0],
  "Cable rear delt fly": ["Cable_Rear_Delt_Fly", 0],
  "Cable woodchopper": ["Standing_Cable_Wood_Chop", 0],
  "Calf raise (machine)": ["Standing_Calf_Raises", 0],
  "Chest fly (machine)": ["Butterfly", 0],
  "Chest press (machine)": ["Machine_Bench_Press", 0],
  "Chest-supported row": ["Dumbbell_Incline_Row", 0],
  "Chin-up": ["Chin-Up", 0],
  "Close-grip bench press": ["Close-Grip_Barbell_Bench_Press", 0],
  "Close-grip lat pulldown": ["Close-Grip_Front_Lat_Pulldown", 0],
  "Concentration curl": ["Concentration_Curls", 0],
  "Crunch": ["Crunches", 0],
  "Cycling": ["Bicycling", 1],
  "Dead bug": ["Dead_Bug", 0],
  "Deadlift": ["Barbell_Deadlift", 0],
  "Decline bench press": ["Decline_Barbell_Bench_Press", 0],
  "Dips": ["Dips_-_Chest_Version", 0],
  "Dumbbell bench press": ["Dumbbell_Bench_Press", 0],
  "Dumbbell curl": ["Dumbbell_Bicep_Curl", 0],
  "Dumbbell shoulder press": ["Dumbbell_Shoulder_Press", 0],
  "Dumbbell shrug": ["Dumbbell_Shrug", 0],
  "Elliptical": ["Elliptical_Trainer", 0],
  "EZ-bar curl": ["EZ-Bar_Curl", 0],
  "Face pull": ["Face_Pull", 0],
  "Farmer's carry": ["Farmers_Walk", 0],
  "Front raise": ["Front_Dumbbell_Raise", 0],
  "Front squat": ["Front_Barbell_Squat", 0],
  "Glute bridge": ["Butt_Lift_Bridge", 0],
  "Goblet squat": ["Goblet_Squat", 0],
  "Good morning": ["Good_Morning", 0],
  "Hack squat": ["Hack_Squat", 0],
  "Hammer curl": ["Hammer_Curls", 0],
  "Hanging leg raise": ["Hanging_Leg_Raise", 0],
  "Hip abduction (machine)": ["Thigh_Abductor", 0],
  "Hip adduction (machine)": ["Thigh_Adductor", 0],
  "Hip thrust": ["Barbell_Hip_Thrust", 0],
  "Incline bench press": ["Barbell_Incline_Bench_Press_-_Medium_Grip", 0],
  "Incline dumbbell curl": ["Incline_Dumbbell_Curl", 0],
  "Incline dumbbell press": ["Incline_Dumbbell_Press", 0],
  "Incline walk": ["Walking_Treadmill", 0],
  "Jump rope": ["Rope_Jumping", 0],
  "Kettlebell swing": ["One-Arm_Kettlebell_Swings", 0],
  "Lat pulldown": ["Wide-Grip_Lat_Pulldown", 0],
  "Lateral raise": ["Side_Lateral_Raise", 0],
  "Leg extension": ["Leg_Extensions", 0],
  "Leg press": ["Leg_Press", 0],
  "Leg press calf raise": ["Calf_Press_On_The_Leg_Press_Machine", 0],
  "Low-to-high cable fly": ["Low_Cable_Crossover", 0],
  "Lying leg curl": ["Lying_Leg_Curls", 0],
  "Lying leg raise": ["Flat_Bench_Lying_Leg_Raise", 0],
  "Machine row": ["Leverage_Iso_Row", 0],
  "Mountain climbers": ["Mountain_Climbers", 0],
  "Nordic curl": ["Floor_Glute-Ham_Raise", 0],
  "One-arm dumbbell row": ["One-Arm_Dumbbell_Row", 0],
  "Outdoor run": ["Trail_Running_Walking", 0],
  "Overhead press": ["Standing_Military_Press", 0],
  "Overhead triceps extension": ["Triceps_Overhead_Extension_with_Rope", 0],
  "Pec deck": ["Butterfly", 0],
  "Pendlay row": ["Bent_Over_Barbell_Row", 0],
  "Plank": ["Plank", 1],
  "Preacher curl": ["Preacher_Curl", 0],
  "Pull-up": ["Pullups", 0],
  "Push-up": ["Pushups", 0],
  "Rear delt fly (machine)": ["Reverse_Machine_Flyes", 0],
  "Reverse curl": ["Reverse_Barbell_Curl", 0],
  "Reverse dumbbell fly": ["Reverse_Flyes", 0],
  "Reverse lunge": ["Dumbbell_Rear_Lunge", 0],
  "Reverse pec deck": ["Reverse_Machine_Flyes", 0],
  "Reverse wrist curl": ["Seated_Dumbbell_Palms-Down_Wrist_Curl", 0],
  "Romanian deadlift": ["Romanian_Deadlift", 0],
  "Rope pushdown": ["Triceps_Pushdown_-_Rope_Attachment", 0],
  "Rowing machine": ["Rowing_Stationary", 0],
  "Russian twist": ["Russian_Twist", 0],
  "Seated cable row": ["Seated_Cable_Rows", 0],
  "Seated calf raise": ["Seated_Calf_Raise", 0],
  "Seated leg curl": ["Seated_Leg_Curl", 0],
  "Shoulder press (machine)": ["Machine_Shoulder_Military_Press", 0],
  "Side plank": ["Side_Bridge", 0],
  "Skull crusher": ["EZ-Bar_Skullcrusher", 0],
  "Sled push": ["Sled_Push", 0],
  "Smith machine calf raise": ["Smith_Machine_Calf_Raise", 0],
  "Smith machine incline press": ["Smith_Machine_Incline_Bench_Press", 0],
  "Smith machine squat": ["Smith_Machine_Squat", 0],
  "Spin bike": ["Bicycling_Stationary", 0],
  "Stair climber": ["Stairmaster", 0],
  "Standing calf raise": ["Standing_Calf_Raises", 0],
  "Stationary bike": ["Bicycling_Stationary", 0],
  "Step-up": ["Dumbbell_Step_Ups", 0],
  "Straight-arm pulldown": ["Straight-Arm_Pulldown", 0],
  "Sumo deadlift": ["Sumo_Deadlift", 0],
  "T-bar row": ["T-Bar_Row_with_Handle", 0],
  "Trap bar deadlift": ["Trap_Bar_Deadlift", 0],
  "Treadmill": ["Running_Treadmill", 0],
  "Triceps pushdown": ["Triceps_Pushdown", 0],
  "Upright row": ["Upright_Barbell_Row", 0],
  "Walking lunge": ["Dumbbell_Lunges", 0],
  "Wrist curl": ["Seated_Dumbbell_Palms-Up_Wrist_Curl", 0],
}

/** "Barbell_Bench_Press_-_Medium_Grip" → "barbell-bench-press-medium-grip" */
export const fileFor = (id) => id.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

async function main() {
  await mkdir(out, { recursive: true })
  const done = new Set()
  for (const [id, frame] of Object.values(PHOTOS)) {
    const file = `${fileFor(id)}.jpg`
    if (done.has(file)) continue
    done.add(file)
    const res = await fetch(`${BASE}/${id}/${frame}.jpg`)
    if (!res.ok) throw new Error(`${id}: ${res.status}`)
    const img = await sharp(Buffer.from(await res.arrayBuffer()))
      .resize({ width: 560, withoutEnlargement: true })
      .jpeg({ quality: 70, mozjpeg: true })
      .toBuffer()
    await writeFile(join(out, file), img)
    console.log("wrote", file, `${Math.round(img.length / 1024)} KB`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main()
