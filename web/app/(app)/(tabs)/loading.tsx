// Lets Next prefetch the tab screens (dynamic routes only prefetch up to a
// loading boundary), so tapping a tab switches at once. The screens render
// their own skeletons, and usually cached data, straight after.
export default function Loading() {
  return null
}
