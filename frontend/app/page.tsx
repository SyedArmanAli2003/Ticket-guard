"use client"
import Navbar from "@/components/Navbar"
import HeroSection from "@/components/HeroSection"
import HomeSections from "@/components/HomeSections"
import Footer from "@/components/Footer"

export default function HomePage() {
  return (
    <div style={{ backgroundColor: "var(--tg-bg)", minHeight: "100dvh" }}>
      <Navbar />
      <HeroSection />
      <HomeSections />
      <Footer />
    </div>
  )
}
