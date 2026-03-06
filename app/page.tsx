export default function Home() {
  return (
    <main style={{ padding: 40, fontFamily: "Arial" }}>
      <h1>Crowned Studio</h1>
      <p>Welcome to our online booking system.</p>

      <button
        style={{
          padding: "12px 20px",
          fontSize: "16px",
          background: "#000",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        Book Appointment
      </button>
    </main>
  );
}