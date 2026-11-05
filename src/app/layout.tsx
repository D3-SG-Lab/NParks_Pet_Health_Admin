import type { Metadata, Viewport } from "next"
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import type { ReactNode } from "react"

import { Providers } from "@/components/providers"

import "./globals.css"

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
})

export const metadata: Metadata = {
  title: {
    default: "AQC Animal Health · Officer workbench",
    template: "%s · AQC Animal Health",
  },
  description: "Web workbench for AVS officers, vets, supervisors, auditors and admins — AQC Animal Health POC.",
}

export const viewport: Viewport = {
  themeColor: "#0b3d3c",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-SG" className={`${plexSans.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
