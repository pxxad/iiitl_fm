"use client";

import { motion } from "framer-motion";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #f0f4ff 0%, #fafafe 50%, #f0f0ff 100%)",
        fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", padding: "0 1.5rem" }}>

        {/* Live badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1.5rem",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 9,
              height: 9,
              borderRadius: "50%",
              backgroundColor: "#f43f5e",
              animation: "pulse-live 1.4s ease-in-out infinite",
            }}
          />
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: "#f43f5e",
            }}
          >
            Live Now
          </span>
        </motion.div>

        {/* Wordmark */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          style={{
            fontFamily: "'Space Grotesk', 'Inter', ui-sans-serif, system-ui, sans-serif",
            fontWeight: 900,
            fontSize: "clamp(4rem, 12vw, 8rem)",
            letterSpacing: "-0.04em",
            lineHeight: 1,
            margin: "0 0 1.5rem",
            color: "#0f172a",
          }}
        >
          IIITL{" "}
          <span
            style={{
              background: "linear-gradient(135deg, #6366f1, #8b5cf6, #0ea5e9)",
              backgroundSize: "200% 200%",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              animation: "gradient-shift 6s ease infinite",
            }}
          >
            FM
          </span>
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          style={{
            fontSize: "clamp(1rem, 2.5vw, 1.2rem)",
            color: "#475569",
            maxWidth: "36rem",
            margin: "0 auto 2.5rem",
            lineHeight: 1.7,
          }}
        >
          The campus radio station, built by students, for students.
          <br />
          One song. One campus. Right now.
        </motion.p>

        {/* Phase badge */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 1.25rem",
            borderRadius: "9999px",
            background: "rgba(99,102,241,0.08)",
            border: "1px solid rgba(99,102,241,0.2)",
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "#4f46e5",
          }}
        >
          <span>🎙️</span>
          <span>Phase 1 — Foundation complete. Auth coming next.</span>
        </motion.div>
      </div>
    </main>
  );
}
