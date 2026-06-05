import type { Metadata } from "next"
import { Sora } from "next/font/google"
import "./globals.css"

const sora = Sora({
  subsets: ["latin"],
  weight: ["300","400","500","600","700"],
  variable: "--font-sora",
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
    <html lang="en" className={sora.variable}>
      <body className="font-sora antialiased">
        {children}
      </body>
    </html>
  )
}
