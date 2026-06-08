from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from pathlib import Path
from typing import Any

try:
    from playwright.async_api import BrowserContext, Page, async_playwright
except ModuleNotFoundError as exc:  # pragma: no cover - depends on machine setup
    print(
        (
            "O pacote Python 'playwright' nao esta instalado. "
            "Rode 'python3 -m pip install -r apps/browser-runner/requirements.txt' "
            "e depois 'python3 -m playwright install firefox'."
        ),
        file=sys.stderr,
    )
    raise SystemExit(2) from exc


LOGIN_URL = "https://www.99freelas.com.br/login"
DASHBOARD_URL = "https://www.99freelas.com.br/dashboard"
AUTH_TEXT_HINTS = ["Freelancer", "Projetos", "Conta"]
SUCCESS_TEXT_HINTS = [
    "Sua proposta foi enviada com sucesso",
    "Enviou Proposta",
    "Melhorar proposta",
]
AUTH_BOOTSTRAP_TIMEOUT_MS = 15 * 60 * 1000
AUTH_BOOTSTRAP_POLL_INTERVAL_MS = 2000


async def main() -> None:
    args = parse_args()
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))

    if args.command == "auth":
        result = await authenticate(payload)
    elif args.command == "session-check":
        result = await session_check(payload)
    elif args.command == "proposal-prefill":
        result = await proposal_prefill(payload)
    elif args.command == "proposal-submit":
        result = await proposal_submit(payload)
    else:  # pragma: no cover
        raise RuntimeError(f"Unsupported command: {args.command}")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, ensure_ascii=True, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        choices=["auth", "session-check", "proposal-prefill", "proposal-submit"],
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


async def authenticate(payload: dict[str, Any]) -> dict[str, Any]:
    async with async_playwright() as playwright:
        context = await launch_context(playwright, payload, headless=False)
        try:
            page = await context.new_page()
            await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=payload_timeout(payload))

            if await is_authenticated(page):
                return await inspect_session(context, page, payload)

            print(
                (
                    "Janela da automacao Python aberta. "
                    "Faça o login manual no 99Freelas nessa janela dedicada. "
                    "O runner vai detectar a sessao autenticada e salvar automaticamente, "
                    "sem precisar pressionar Enter."
                ),
                flush=True,
            )
            deadline = asyncio.get_running_loop().time() + (
                int(payload.get("authBootstrapTimeoutMs", AUTH_BOOTSTRAP_TIMEOUT_MS)) / 1000
            )

            while asyncio.get_running_loop().time() < deadline:
                if page.is_closed():
                    raise RuntimeError(
                        "A janela da automacao foi fechada antes do login ser confirmado."
                    )

                try:
                    if await is_authenticated(page):
                        result = await inspect_session(context, page, payload)
                        if result["isAuthenticated"]:
                            return result
                    elif "/dashboard" in page.url:
                        result = await inspect_session(context, page, payload)
                        if result["isAuthenticated"]:
                            return result
                except Exception:
                    # Durante o login o navegador pode redirecionar ou trocar de estado.
                    # Nesse caso, basta aguardar a proxima rodada do polling.
                    pass

                await asyncio.sleep(AUTH_BOOTSTRAP_POLL_INTERVAL_MS / 1000)

            raise RuntimeError(
                "Tempo esgotado aguardando autenticacao manual no navegador dedicado."
            )
        finally:
            await context.close()


async def session_check(payload: dict[str, Any]) -> dict[str, Any]:
    async with async_playwright() as playwright:
        context = await launch_context(playwright, payload, headless=bool(payload.get("headless", True)))
        try:
            page = await context.new_page()
            await page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=payload_timeout(payload))
            return await inspect_session(context, page, payload)
        finally:
            await context.close()


async def proposal_prefill(payload: dict[str, Any]) -> dict[str, Any]:
    async with async_playwright() as playwright:
        context = await launch_context(playwright, payload, headless=bool(payload.get("headless", False)))
        try:
            page = await context.new_page()
            await open_and_fill_proposal(page, payload)
            body_text = await page.locator("body").inner_text()
            details_text = await page.locator("#proposta").input_value()

            screenshot_path = await maybe_screenshot(page, payload.get("screenshotPath"))

            return {
                "currentUrl": page.url,
                "proposalPageUrl": build_proposal_page_url(payload["proposalPageUrl"]),
                "filledAmount": await page.locator("#oferta").input_value(),
                "filledDeadlineDays": await page.locator("#duracao-estimada").input_value(),
                "detailsLength": len(details_text),
                "page": parse_page_snapshot(body_text),
                "submitButtonVisible": await page.locator("#btnConcluirEnvioProposta").is_visible(),
                **({"screenshotPath": screenshot_path} if screenshot_path else {}),
            }
        finally:
            await context.close()


async def proposal_submit(payload: dict[str, Any]) -> dict[str, Any]:
    async with async_playwright() as playwright:
        context = await launch_context(playwright, payload, headless=bool(payload.get("headless", False)))
        try:
            page = await context.new_page()
            await emit_step(payload, "browser-opened", "Navegador Python aberto para a automacao.")
            await open_and_fill_proposal(page, payload)
            await emit_step(payload, "proposal-page-opened", "Pagina da proposta aberta.", page.url)

            before_screenshot = await maybe_screenshot(page, payload.get("beforeScreenshotPath"))
            submit_button = page.locator("#btnConcluirEnvioProposta")
            submit_button_visible = await submit_button.is_visible()
            submit_button_enabled = await submit_button.is_enabled()
            body_text = await page.locator("body").inner_text()
            details_text = await page.locator("#proposta").input_value()
            filled_amount = await page.locator("#oferta").input_value()
            filled_final_amount = await page.locator("#oferta-final").input_value()
            filled_deadline = await page.locator("#duracao-estimada").input_value()
            page_snapshot = parse_page_snapshot(body_text)
            warnings = extract_warnings(body_text)
            blocking_reasons = assess_submission_readiness(
                page_snapshot=page_snapshot,
                submit_button_enabled=submit_button_enabled,
                submit_button_visible=submit_button_visible,
                details_length=len(details_text),
            )

            await emit_step(payload, "readiness-evaluated", "Guardrails da pagina avaliados.", page.url)

            execute_submit = bool(payload.get("executeSubmit", False))
            submitted = False
            post_submit_url = None
            post_submit_has_form = None

            if execute_submit and not blocking_reasons:
                await emit_step(payload, "paused-before-submit", "Pausa curta antes do clique final.", page.url)
                await maybe_wait(payload.get("observer", {}).get("holdOpenMs"))
                await submit_button.click()
                await emit_step(payload, "submit-clicked", "Botao final clicado.", page.url)
                await page.wait_for_timeout(int(payload.get("postSubmitTimeoutMs", 5000)))
                post_submit_url = page.url
                post_submit_text = await page.locator("body").inner_text()
                post_submit_has_form = "Enviar proposta" in post_submit_text and "Sua oferta" in post_submit_text
                submitted = detect_submission_success(page.url, post_submit_text)
            elif not execute_submit and payload.get("observer", {}).get("enabled"):
                await emit_step(
                    payload,
                    "paused-before-submit",
                    "Observacao concluida; pagina mantida aberta antes de fechar sem enviar.",
                    page.url,
                )
                await maybe_wait(payload.get("observer", {}).get("holdOpenMs"))

            after_screenshot = await maybe_screenshot(page, payload.get("afterScreenshotPath"))

            return {
                "currentUrl": page.url,
                "proposalPageUrl": build_proposal_page_url(payload["proposalPageUrl"]),
                "filledAmount": filled_amount,
                "filledFinalAmount": filled_final_amount,
                "filledDeadlineDays": filled_deadline,
                "detailsLength": len(details_text),
                "page": page_snapshot,
                "warnings": warnings,
                "blockingReasons": blocking_reasons,
                "readyForManualSubmit": len(blocking_reasons) == 0,
                "submitButtonVisible": submit_button_visible,
                "submitButtonEnabled": submit_button_enabled,
                "submitAttempted": execute_submit,
                "submitted": submitted,
                "postSubmitUrl": post_submit_url,
                "postSubmitHasProposalForm": post_submit_has_form,
                "beforeScreenshotPath": before_screenshot,
                "afterScreenshotPath": after_screenshot,
            }
        finally:
            await context.close()


async def launch_context(playwright: Any, payload: dict[str, Any], headless: bool) -> BrowserContext:
    browser_name = payload.get("browserName", "firefox")
    profile_dir = Path(payload["profileDir"]).resolve()
    profile_dir.mkdir(parents=True, exist_ok=True)
    browser_type = getattr(playwright, browser_name)

    launch_args: dict[str, Any] = {
        "user_data_dir": str(profile_dir),
        "headless": headless,
    }
    if browser_name == "chromium":
        launch_args["args"] = ["--disable-blink-features=AutomationControlled"]

    return await browser_type.launch_persistent_context(**launch_args)


async def inspect_session(
    context: BrowserContext,
    page: Page,
    payload: dict[str, Any],
) -> dict[str, Any]:
    await page.wait_for_load_state("domcontentloaded", timeout=payload_timeout(payload))
    body_text = await page.locator("body").inner_text()
    storage_state_path = Path(payload["storageStatePath"]).resolve()
    storage_state = await context.storage_state(path=str(storage_state_path))

    return {
        "isAuthenticated": await is_authenticated(page, body_text),
        "storageStatePath": str(storage_state_path),
        "currentUrl": page.url,
        "cookiesCount": len(storage_state.get("cookies", [])),
        "originsCount": len(storage_state.get("origins", [])),
        "detectedSignals": detect_session_signals(body_text, page.url),
    }


async def open_and_fill_proposal(page: Page, payload: dict[str, Any]) -> None:
    await page.goto(
        build_proposal_page_url(payload["proposalPageUrl"]),
        wait_until="domcontentloaded",
        timeout=payload_timeout(payload),
    )
    await page.locator("#oferta").fill(format_money_input(payload["amount"]))
    await emit_step(payload, "amount-filled", "Campo de oferta preenchido.", page.url)
    await maybe_wait(payload.get("observer", {}).get("stepDelayMs"))
    await page.locator("#duracao-estimada").fill(format_deadline_input(payload["deadlineDays"]))
    await emit_step(payload, "deadline-filled", "Campo de duracao estimada preenchido.", page.url)
    await maybe_wait(payload.get("observer", {}).get("stepDelayMs"))
    await page.locator("#proposta").fill(payload["detailsText"])
    await emit_step(payload, "details-filled", "Campo de detalhes preenchido com a proposta gerada.", page.url)
    await maybe_wait(payload.get("observer", {}).get("stepDelayMs"))


async def emit_step(
    payload: dict[str, Any],
    step: str,
    message: str,
    current_url: str | None = None,
) -> None:
    observer = payload.get("observer", {})
    if not observer.get("enabled"):
        return

    print(
        json.dumps(
            {
                "scope": "python-browser-runner",
                "step": step,
                "message": message,
                "currentUrl": current_url,
            },
            ensure_ascii=True,
        ),
        flush=True,
    )


async def maybe_wait(delay_ms: Any) -> None:
    if delay_ms is None:
        return
    delay = int(delay_ms)
    if delay <= 0:
        return
    await asyncio.sleep(delay / 1000)


async def maybe_screenshot(page: Page, screenshot_path: Any) -> str | None:
    if not screenshot_path:
        return None
    path = Path(str(screenshot_path)).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    await page.screenshot(path=str(path), full_page=True)
    return str(path)


async def is_authenticated(page: Page, body_text: str | None = None) -> bool:
    text = body_text if body_text is not None else await page.locator("body").inner_text()
    if "/login" in page.url:
        return False
    return any(marker in text for marker in AUTH_TEXT_HINTS)


def detect_session_signals(body_text: str, current_url: str) -> list[str]:
    signals: list[str] = []
    if current_url.endswith("/dashboard") or "/project/" in current_url:
        signals.append("authenticated-url")
    if any(marker in body_text for marker in AUTH_TEXT_HINTS):
        signals.append("authenticated-marker")
    if "Login" in body_text or "/login" in current_url:
        signals.append("login-marker")
    return signals


def build_proposal_page_url(project_url: str) -> str:
    if "/project/bid/" in project_url:
        return project_url
    return project_url.replace("/project/", "/project/bid/")


def format_money_input(amount: Any) -> str:
    return f"{float(amount):.2f}".replace(".", ",")


def format_deadline_input(days: Any) -> str:
    return str(max(1, round(float(days))))


def payload_timeout(payload: dict[str, Any]) -> int:
    return int(payload.get("timeoutMs", 45000))


def parse_page_snapshot(text: str) -> dict[str, Any]:
    return {
        "averageBidAmount": extract_currency(
            text,
            r"Valor m[eé]dio das propostas:\s*R\$\s*([\d.,]+)",
        ),
        "averageDeadlineDays": extract_integer(
            text,
            r"Dura[cç][aã]o m[eé]dia estimada:\s*(\d+)\s*dias?",
        ),
        "minimumOfferAmount": extract_currency(
            text,
            r"Oferta m[ií]nima:\s*R\$\s*([\d.,]+)",
        ),
        "availableConnections": extract_integer(
            text,
            r"ter[aá]\s+(\d+)\s+conex(?:ao|oes|ão|ões)\s+restantes",
        ),
        "requiredConnections": extract_integer(
            text,
            r"Esta proposta requer\s+(\d+)\s+conex",
        ),
        "hasProposalForm": "Enviar proposta" in text and "Sua oferta" in text and "Detalhes" in text,
        "hasQuestionChannel": "Fazer pergunta" in text or "/project/message/" in text,
    }


def extract_warnings(text: str) -> list[str]:
    warnings: list[str] = []
    for line in text.splitlines():
        normalized = line.strip()
        if not normalized:
            continue
        lowered = normalized.lower()
        if "atenção" in lowered or "atencao" in lowered or "nao compartilhe" in lowered or "não compartilhe" in lowered:
            warnings.append(normalized)
    return warnings


def assess_submission_readiness(
    *,
    page_snapshot: dict[str, Any],
    submit_button_enabled: bool,
    submit_button_visible: bool,
    details_length: int,
) -> list[str]:
    reasons: list[str] = []
    if not page_snapshot["hasProposalForm"]:
        reasons.append("Formulario de proposta nao foi detectado na pagina.")
    if not submit_button_visible:
        reasons.append("Botao final de envio nao esta visivel.")
    if not submit_button_enabled:
        reasons.append("Botao final de envio esta desabilitado.")
    if details_length <= 0:
        reasons.append("Campo de detalhes permaneceu vazio.")
    return reasons


def detect_submission_success(current_url: str, body_text: str) -> bool:
    if any(marker in body_text for marker in SUCCESS_TEXT_HINTS):
        return True
    return "/project/" in current_url and "/bid/" not in current_url


def extract_currency(text: str, pattern: str) -> float | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    normalized = match.group(1).replace(".", "").replace(",", ".")
    return float(normalized)


def extract_integer(text: str, pattern: str) -> int | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    return int(match.group(1))


if __name__ == "__main__":
    asyncio.run(main())
