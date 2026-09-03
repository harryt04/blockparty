"use client";

/**
 * The root error boundary. It replaces the whole document, so it renders its
 * own html and body and cannot rely on the app shell.
 */
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          margin: 0,
          padding: "2rem",
          lineHeight: 1.5,
        }}
      >
        <h1 style={{ fontSize: "1.5rem" }}>Something went wrong</h1>
        <p>The app could not start. Nothing in your game was changed.</p>
        <button
          type="button"
          onClick={reset}
          style={{ minHeight: 44, padding: "0 1rem", marginTop: "1rem" }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
