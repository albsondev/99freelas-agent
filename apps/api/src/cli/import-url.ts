async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error("Usage: pnpm import:url <99freelas-project-url>");
    process.exit(1);
  }

  const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3333";
  const response = await fetch(`${apiBaseUrl}/opportunities/import-url`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  const payload = await response.json();

  if (!response.ok) {
    console.error(JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error("Failed to import URL", error);
  process.exit(1);
});
