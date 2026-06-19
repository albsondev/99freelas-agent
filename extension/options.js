document.addEventListener("DOMContentLoaded", async () => {
  const {
    getExtensionSettings,
    saveExtensionSettings
  } = globalThis.NineFreelasShared;

  const status = document.getElementById("optionsStatus");
  const saveButton = document.getElementById("saveButton");

  const fields = {
    geminiApiKey: document.getElementById("geminiApiKey"),
    geminiModel: document.getElementById("geminiModel"),
    displayName: document.getElementById("displayName"),
    headline: document.getElementById("headline"),
    portfolioSummary: document.getElementById("portfolioSummary"),
    minProposalAmountBrl: document.getElementById("minProposalAmountBrl"),
    discountAgainstAverage: document.getElementById("discountAgainstAverage"),
    minDeadlineDays: document.getElementById("minDeadlineDays")
  };

  const settings = await getExtensionSettings();
  hydrateForm(settings);

  saveButton.addEventListener("click", async () => {
    saveButton.disabled = true;
    setStatus("Salvando configurações...", "info");

    try {
      const nextSettings = {
        geminiApiKey: fields.geminiApiKey.value.trim(),
        geminiModel: fields.geminiModel.value.trim(),
        freelancerProfile: {
          ...settings.freelancerProfile,
          displayName: fields.displayName.value.trim(),
          headline: fields.headline.value.trim(),
          portfolioSummary: fields.portfolioSummary.value.trim()
        },
        pricing: {
          discountAgainstAverage: Number(fields.discountAgainstAverage.value || 0.2),
          minProposalAmountBrl: Number(fields.minProposalAmountBrl.value || 150),
          minDeadlineDays: Number(fields.minDeadlineDays.value || 1)
        }
      };

      await saveExtensionSettings(nextSettings);
      setStatus("Configurações salvas localmente com sucesso.", "success");
    } catch (error) {
      setStatus(error.message || "Falha ao salvar.", "error");
    } finally {
      saveButton.disabled = false;
    }
  });

  function hydrateForm(currentSettings) {
    fields.geminiApiKey.value = currentSettings.geminiApiKey || "";
    fields.geminiModel.value = currentSettings.geminiModel || "";
    fields.displayName.value = currentSettings.freelancerProfile.displayName || "";
    fields.headline.value = currentSettings.freelancerProfile.headline || "";
    fields.portfolioSummary.value =
      currentSettings.freelancerProfile.portfolioSummary || "";
    fields.minProposalAmountBrl.value = String(
      currentSettings.pricing.minProposalAmountBrl || 150
    );
    fields.discountAgainstAverage.value = String(
      currentSettings.pricing.discountAgainstAverage || 0.2
    );
    fields.minDeadlineDays.value = String(
      currentSettings.pricing.minDeadlineDays || 1
    );
  }

  function setStatus(message, tone) {
    status.textContent = message;
    status.dataset.tone = tone;
  }
});
