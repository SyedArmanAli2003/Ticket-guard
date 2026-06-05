"use client"
import Navbar from "@/components/Navbar"
import HeroSection from "@/components/HeroSection"
import HomeSections from "@/components/HomeSections"

export default function HomePage() {
  return (
    <div style={{ background: "hsl(240,28%,3.5%)", minHeight: "100dvh" }}>
      <Navbar />
      <HeroSection />
      <HomeSections />
    </div>
  )
}
