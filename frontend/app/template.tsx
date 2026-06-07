"use client"
// Route transition wrapper. Next.js re-mounts a `template` on every navigation,
// giving each page a soft fade-up entrance.
//
// Implemented as a pure-CSS animation (class `route-enter`) rather than framer
// `y` motion ON PURPOSE: a framer `y:0` rest state leaves a `transform: matrix()`
// on this wrapper, which creates a containing block and traps the page's
// `position: fixed` deep-field backdrop (scoping it to the document height). The
// `route-enter` keyframe ends with NO transform, so at rest this wrapper computes
// `transform: none` and the fixed backdrop stays correctly viewport-pinned.
// Reduced motion is honoured in globals.css (the animation is disabled there).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="route-enter">{children}</div>
}
