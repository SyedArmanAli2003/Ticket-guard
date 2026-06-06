import type { Metadata } from "next"
import { Space_Grotesk, Inter } from "next/font/google"
import "./globals.css"

// Distinctive display face for headings + technical chrome.
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
  display: "swap",
})

// Highly-legible body face.
const body = Inter({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
})

export const metadata: Metadata = {
  title: "TicketGuard — Spot ticket-resale scams before you pay",
  description:
    "Paste a suspicious ticket-resale listing or seller DM. An AI agent runs a multi-step investigation grounded in MongoDB Atlas Vector Search and the MongoDB MCP server, and returns an evidence-backed risk verdict.",
  openGraph: {
    title: "TicketGuard",
    description: "An AI agent that flags major-event ticket-resale scams — evidence-backed, in seconds.",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body antialiased">
        {children}
      </body>
    </html>
  )
}
