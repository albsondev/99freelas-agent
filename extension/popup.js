document.addEventListener("DOMContentLoaded", async () => {
  const projectUrlInput = document.getElementById("projectUrl");
  const fillButton = document.getElementById("fillButton");
  const optionsButton = document.getElementById("optionsButton");
  const status = document.getElementById("status");

  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (
    activeTab?.url &&
    /^https:\/\/www\.99freelas\.com\.br\/project\//i.test(activeTab.url)
  ) {
    projectUrlInput.value = activeTab.url;
  }

  fillButton.addEventListener("click", async () => {
    const projectUrl = projectUrlInput.value.trim();
    if (!projectUrl) {
      setStatus("Informe a URL do projeto.", "error");
      return;
    }

    setStatus("Abrindo projeto e iniciando preenchimento...", "info");
    fillButton.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: "RUN_PREFILL_FROM_POPUP",
        projectUrl
      });

      if (!response?.ok) {
        throw new Error(response?.error || "Falha desconhecida.");
      }

      setStatus(
        `Formulario preenchido. Valor: R$ ${response.result.amount}. Prazo: ${response.result.deadlineDays} dia(s).`,
        "success"
      );
    } catch (error) {
      setStatus(error.message || "Falha ao preencher proposta.", "error");
    } finally {
      fillButton.disabled = false;
    }
  });

  optionsButton.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });

  function setStatus(message, tone) {
    status.textContent = message;
    status.dataset.tone = tone;
  }
});
