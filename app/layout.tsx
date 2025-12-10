import type { Metadata } from 'next'
    import React from 'react'
    import './globals.css'

    export const metadata: Metadata = {
      title: 'Nyx C2',
      description: 'C2 Monitoring Panel',
    }

    export default function RootLayout({
      children,
    }: {
      children: React.ReactNode
    }) {
      return (
        <html lang="en">
          <body className="bg-gray-900">{children}</body>
        </html>
      )
    }