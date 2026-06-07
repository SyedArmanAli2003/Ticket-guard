"use client"
import Navbar from "@/components/Navbar"
import HeroSection from "@/components/HeroSection"
import HomeSections from "@/components/HomeSections"
import ChannelsSection from "@/components/ChannelsSection"
import Footer from "@/components/Footer"

export default function HomePage() {
  return (
    <div style={{ backgroundColor: "var(--tg-bg)", minHeight: "100dvh" }}>
      <Navbar />
      <main id="main-content" tabIndex={-1} style={{ outline: "none" }}>
        <HeroSection />
        <HomeSections />
        <ChannelsSection />
      </main>
      <Footer />
    </div>
  )
}
