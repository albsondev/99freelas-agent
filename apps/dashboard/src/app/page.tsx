const cards = [
  "oportunidades analisadas",
  "propostas geradas",
  "revisoes pendentes",
  "falhas do pipeline",
];

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 24px",
        background:
          "radial-gradient(circle at top left, #f4f1e8 0%, #fffdf8 40%, #eef3e8 100%)",
        color: "#16302b",
        fontFamily: "Georgia, 'Times New Roman', serif",
      }}
    >
      <section style={{ maxWidth: 960, margin: "0 auto" }}>
        <p style={{ letterSpacing: 2, textTransform: "uppercase", fontSize: 12 }}>
          99Freelas AI Agent
        </p>
        <h1 style={{ fontSize: "3rem", marginBottom: 12 }}>
          Painel de auditoria para prospeccao assistida
        </h1>
        <p style={{ maxWidth: 680, lineHeight: 1.6 }}>
          Esta tela inicial existe como placeholder da Fase 0. Nas proximas etapas, ela vai receber
          metricas de pipeline, oportunidades, propostas e eventos de seguranca.
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 16,
            marginTop: 32,
          }}
        >
          {cards.map((card) => (
            <article
              key={card}
              style={{
                border: "1px solid rgba(22, 48, 43, 0.15)",
                borderRadius: 18,
                padding: 20,
                background: "rgba(255, 255, 255, 0.72)",
                boxShadow: "0 12px 32px rgba(22, 48, 43, 0.08)",
              }}
            >
              <strong style={{ display: "block", marginBottom: 8 }}>{card}</strong>
              <span style={{ opacity: 0.65 }}>Em breve</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

