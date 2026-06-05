"use client"
import Navbar from "@/components/Navbar"
import HeroSection from "@/components/HeroSection"

export default function HomePage() {
  return (
    <div className="no-scrollbar" style={{ background: "hsl(240,28%,3.5%)", height: "100dvh", overflow: "hidden" }}>
      <Navbar />
      <HeroSection />
    </div>
  )
}
