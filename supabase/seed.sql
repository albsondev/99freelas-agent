insert into public.settings (key, value, description)
values
  (
    'automation.defaults',
    jsonb_build_object(
      'mode', 'REVIEW_REQUIRED',
      'autopilotMinScore', 85,
      'reviewMinScore', 60,
      'maxAutopilotSubmissionsPerDay', 15,
      'maxAutopilotSubmissionsPerHour', 4
    ),
    'Configuracao inicial do pipeline de automacao.'
  ),
  (
    'pricing.defaults',
    jsonb_build_object(
      'discountFactor', 0.50,
      'minimumProposalAmountBrl', 150,
      'minimumDailyRateBrl', 120,
      'defaultHourlyRateBrl', 50
    ),
    'Parametros iniciais para calculo de valor da proposta.'
  ),
  (
    'deadline.defaults',
    jsonb_build_object(
      'reductionFactor', 0.75,
      'minDeadlineDays', 2,
      'maxDeadlineDays', 45
    ),
    'Parametros iniciais para calculo de prazo.'
  )
on conflict (key) do update
set
  value = excluded.value,
  description = excluded.description,
  updated_at = now();

