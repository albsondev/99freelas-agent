from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Awaitable, Callable

try:
    from playwright.async_api import BrowserContext, Page, async_playwright
except ModuleNotFoundError as exc:  # pragma: no cover - depends on machine setup
    print(
        (
            "O pacote Python 'playwright' nao esta instalado. "
            "Rode 'python3 -m pip install -r apps/browser-runner/requirements.txt' "
            "e depois 'python3 -m playwright install chromium'."
        ),
        file=sys.stderr,
    )
    raise SystemExit(2) from exc


LOGIN_URL = "https://www.99freelas.com.br/login"
DASHBOARD_URL = "https://www.99freelas.com.br/dashboard"
PROJECT_NOTIFICATIONS_URL = "https://www.99freelas.com.br/project-notifications/view?limit=20"
PROJECT_LIST_URL = "https://www.99freelas.com.br/projects"
AUTH_TEXT_HINTS = ["Freelancer", "Projetos", "Conta"]
SUCCESS_TEXT_HINTS = [
    "Sua proposta foi enviada com sucesso",
    "Enviou Proposta",
    "Melhorar proposta",
    "Em andamento",
    "Proposta enviada",
    "Você já enviou uma proposta",
    "Voce ja enviou uma proposta",
]
AUTH_BOOTSTRAP_TIMEOUT_MS = 15 * 60 * 1000
AUTH_BOOTSTRAP_POLL_INTERVAL_MS = 2000
DEFAULT_DAEMON_HOST = "127.0.0.1"
DEFAULT_DAEMON_PORT = 44731


async def main() -> None:
    args = parse_args()
    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))

    if args.command == "serve":
        await run_daemon_server(payload, args.output)
        return

    if args.command == "auth":
        result = await authenticate_direct(payload)
    elif args.command == "session-check":
        result = await session_check_direct(payload)
    elif args.command == "project-list-collect":
        result = await project_list_collect_direct(payload)
    elif args.command == "project-page-scrape":
        result = await project_page_scrape_direct(payload)
    elif args.command == "proposal-page-inspect":
        result = await proposal_page_inspect_direct(payload)
    elif args.command == "proposal-prefill":
        result = await proposal_prefill_direct(payload)
    elif args.command == "proposal-submit":
        result = await proposal_submit_direct(payload)
    else:  # pragma: no cover
        raise RuntimeError(f"Unsupported command: {args.command}")

    write_output(args.output, result)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "command",
        choices=[
            "auth",
            "session-check",
            "project-list-collect",
            "project-page-scrape",
            "proposal-page-inspect",
            "proposal-prefill",
            "proposal-submit",
            "serve",
        ],
    )
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


class PythonRunnerDaemon:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload
        self.playwright: Any | None = None
        self.browser: Any | None = None
        self.context: BrowserContext | None = None
        self.server: asyncio.AbstractServer | None = None
        self.bootstrap_page: Page | None = None
        self._shutdown_event = asyncio.Event()

    async def start(self) -> None:
        self.playwright = await async_playwright().start()
        self.browser, self.context = await launch_direct_context(
            self.playwright,
            self.payload,
            headless=bool(self.payload.get("headless", False)),
        )
        if not bool(self.payload.get("headless", False)):
            self.bootstrap_page = await get_or_create_context_page(self.context)
            await focus_visible_page(self.bootstrap_page, self.payload)

    async def serve(self, output_path: str) -> None:
        host = self.payload.get("daemonHost", DEFAULT_DAEMON_HOST)
        port = int(self.payload.get("daemonPort", DEFAULT_DAEMON_PORT))
        self.server = await asyncio.start_server(self.handle_client, host, port)

        write_output(
            output_path,
            {
                "status": "ready",
                "host": host,
                "port": port,
                "pid": os.getpid(),
            },
        )

        async with self.server:
            await self._shutdown_event.wait()

    async def stop(self) -> None:
        if self.server is not None:
            self.server.close()
            await self.server.wait_closed()
            self.server = None

        if self.context is not None:
            await self.context.close()
            self.context = None

        if self.browser is not None:
            await self.browser.close()
            self.browser = None

        if self.playwright is not None:
            await self.playwright.stop()
            self.playwright = None

    async def handle_client(
        self,
        reader: asyncio.StreamReader,
        writer: asyncio.StreamWriter,
    ) -> None:
        try:
            raw = await reader.readline()
            if not raw:
                return

            request = json.loads(raw.decode("utf-8"))
            response = await self.dispatch(request)
        except Exception as exc:  # pragma: no cover - defensive path
            response = {
                "ok": False,
                "error": str(exc),
            }

        writer.write((json.dumps(response, ensure_ascii=True) + "\n").encode("utf-8"))
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    async def dispatch(self, request: dict[str, Any]) -> dict[str, Any]:
        command = request.get("command")
        payload = request.get("payload", self.payload)

        handlers: dict[str, Callable[[dict[str, Any]], Awaitable[dict[str, Any]]]] = {
            "health": self.health,
            "auth": self.authenticate,
            "session-check": self.session_check,
            "project-list-collect": self.project_list_collect,
            "project-page-scrape": self.project_page_scrape,
            "proposal-page-inspect": self.proposal_page_inspect,
            "proposal-prefill": self.proposal_prefill,
            "proposal-submit": self.proposal_submit,
            "shutdown": self.shutdown,
        }

        handler = handlers.get(command)
        if handler is None:
            raise RuntimeError(f"Unsupported daemon command: {command}")

        result = await handler(payload)
        return {
            "ok": True,
            "result": result,
        }

    async def health(self, payload: dict[str, Any]) -> dict[str, Any]:
        page = await self._ensure_bootstrap_page(payload)
        body_text = await safe_body_text(page)
        return {
            "status": "ready",
            "authenticated": await is_authenticated(page, body_text),
            "currentUrl": page.url,
            "browserName": self.payload.get("browserName", "chromium"),
            "headless": bool(self.payload.get("headless", False)),
            "storageStatePath": self.payload.get("storageStatePath"),
            "profileDir": self.payload.get("profileDir"),
        }

    async def authenticate(self, payload: dict[str, Any]) -> dict[str, Any]:
        page = await self._ensure_bootstrap_page(payload)
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=payload_timeout(payload))

        if await is_authenticated(page):
            return await inspect_session(self._require_context(), page, payload)

        print(
            (
                "Janela da automacao Python aberta. "
                "Faça o login manual no 99Freelas nessa janela dedicada. "
                "O daemon vai detectar a sessao autenticada e salvar automaticamente."
            ),
            flush=True,
        )
        deadline = asyncio.get_running_loop().time() + (
            int(payload.get("authBootstrapTimeoutMs", AUTH_BOOTSTRAP_TIMEOUT_MS)) / 1000
        )

        while asyncio.get_running_loop().time() < deadline:
            if page.is_closed():
                raise RuntimeError("A janela da automacao foi fechada antes do login ser confirmado.")

            try:
                if await is_authenticated(page):
                    result = await inspect_session(self._require_context(), page, payload)
                    if result["isAuthenticated"]:
                        return result
                elif "/dashboard" in page.url:
                    result = await inspect_session(self._require_context(), page, payload)
                    if result["isAuthenticated"]:
                        return result
            except Exception:
                pass

            await asyncio.sleep(AUTH_BOOTSTRAP_POLL_INTERVAL_MS / 1000)

        raise RuntimeError("Tempo esgotado aguardando autenticacao manual no navegador dedicado.")

    async def session_check(self, payload: dict[str, Any]) -> dict[str, Any]:
        page = await self._acquire_page(payload)
        try:
            await page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=payload_timeout(payload))
            return await inspect_session(self._require_context(), page, payload)
        finally:
            await self._release_page(page)

    async def proposal_prefill(self, payload: dict[str, Any]) -> dict[str, Any]:
        page = await self._acquire_page(payload)
        try:
            return await proposal_prefill_core(self._require_context(), page, payload)
        finally:
            await self._release_page(page)

    async def project_list_collect(self, payload: dict[str, Any]) -> dict[str, Any]:
        page = await self._acquire_page(payload)
        try:
            return await collect_project_listing_core(page, payload)
        finally:
            await self._release_page(page)

    async def project_page_scrape(self, payload: dict[str, Any]) -> dict[str, Any]:
        page = await self._acquire_page(payload)
        try:
            return await scrape_project_page_core(page, payload)
        finally:
            await self._release_page(page)

    async def proposal_page_inspect(self, payload: dict[str, Any]) -> dict[str, Any]:
        page = await self._acquire_page(payload)
        try:
            return await inspect_proposal_page_core(page, payload)
        finally:
            await self._release_page(page)

    async def proposal_submit(self, payload: dict[str, Any]) -> dict[str, Any]:
        page = await self._acquire_page(payload)
        try:
            return await proposal_submit_core(self._require_context(), page, payload)
        finally:
            await self._release_page(page)

    async def shutdown(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._shutdown_event.set()
        asyncio.create_task(self.stop())
        return {"status": "shutting-down"}

    async def _ensure_bootstrap_page(self, payload: dict[str, Any]) -> Page:
        if self.bootstrap_page and not self.bootstrap_page.is_closed():
            await focus_visible_page(self.bootstrap_page, payload)
            return self.bootstrap_page

        self.bootstrap_page = await get_or_create_context_page(self._require_context())
        await focus_visible_page(self.bootstrap_page, payload)
        return self.bootstrap_page

    async def _new_page(self) -> Page:
        return await self._require_context().new_page()

    async def _acquire_page(self, payload: dict[str, Any]) -> Page:
        if not bool(payload.get("headless", False)):
            return await self._ensure_bootstrap_page(payload)
        return await self._new_page()

    async def _release_page(self, page: Page) -> None:
        if self.bootstrap_page is not None and page == self.bootstrap_page:
            return
        await page.close()

    def _require_context(self) -> BrowserContext:
        if self.context is None:
            raise RuntimeError("Daemon browser context is not initialized.")
        return self.context


async def run_daemon_server(payload: dict[str, Any], output_path: str) -> None:
    daemon = PythonRunnerDaemon(payload)
    await daemon.start()
    try:
        await daemon.serve(output_path)
    finally:
        await daemon.stop()


async def authenticate_direct(payload: dict[str, Any]) -> dict[str, Any]:
    async with async_playwright() as playwright:
        context = await launch_persistent_context(playwright, payload, headless=False)
        try:
            page = await get_or_create_context_page(context)
            return await authenticate_with_context(context, page, payload)
        finally:
            await context.close()


async def session_check_direct(payload: dict[str, Any]) -> dict[str, Any]:
    async with async_playwright() as playwright:
        browser, context = await launch_direct_context(
            playwright,
            payload,
            headless=bool(payload.get("headless", True)),
        )
        try:
            page = await get_or_create_context_page(context)
            await page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=payload_timeout(payload))
            return await inspect_session(context, page, payload)
        finally:
            await safe_close_context(context)
            if browser is not None:
                await safe_close_browser(browser)


async def proposal_prefill_direct(payload: dict[str, Any]) -> dict[str, Any]:
    async with async_playwright() as playwright:
        browser, context = await launch_direct_context(
            playwright,
            payload,
            headless=bool(payload.get("headless", False)),
        )
        try:
            page = await get_or_create_context_page(context)
            return await proposal_prefill_core(context, page, payload)
        finally:
            await safe_close_context(context)
            if browser is not None:
                await safe_close_browser(browser)


async def proposal_page_inspect_direct(payload: dict[str, Any]) -> dict[str, Any]:
    async with async_playwright() as playwright:
        browser, context = await launch_direct_context(
            playwright,
            payload,
            headless=bool(payload.get("headless", False)),
        )
        try:
            page = await get_or_create_context_page(context)
            return await inspect_proposal_page_core(page, payload)
        finally:
            await safe_close_context(context)
            if browser is not None:
                await safe_close_browser(browser)


async def project_list_collect_direct(payload: dict[str, Any]) -> dict[str, Any]:
    async with async_playwright() as playwright:
        browser, context = await launch_direct_context(
            playwright,
            payload,
            headless=bool(payload.get("headless", False)),
        )
        try:
            page = await get_or_create_context_page(context)
            return await collect_project_listing_core(page, payload)
        finally:
            await context.close()
            if browser is not None:
                await browser.close()


async def project_page_scrape_direct(payload: dict[str, Any]) -> dict[str, Any]:
    async with async_playwright() as playwright:
        browser, context = await launch_direct_context(
            playwright,
            payload,
            headless=bool(payload.get("headless", False)),
        )
        try:
            page = await get_or_create_context_page(context)
            return await scrape_project_page_core(page, payload)
        finally:
            await context.close()
            if browser is not None:
                await browser.close()


async def proposal_submit_direct(payload: dict[str, Any]) -> dict[str, Any]:
    async with async_playwright() as playwright:
        browser, context = await launch_direct_context(
            playwright,
            payload,
            headless=bool(payload.get("headless", False)),
        )
        try:
            page = await get_or_create_context_page(context)
            return await proposal_submit_core(context, page, payload)
        finally:
            await context.close()
            if browser is not None:
                await browser.close()


async def authenticate_with_context(
    context: BrowserContext,
    page: Page,
    payload: dict[str, Any],
) -> dict[str, Any]:
    await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=payload_timeout(payload))

    if await is_authenticated(page):
        return await inspect_session(context, page, payload)

    print(
        (
            "Janela da automacao Python aberta. "
            "Faça o login manual no 99Freelas nessa janela dedicada. "
            "O runner vai detectar a sessao autenticada e salvar automaticamente."
        ),
        flush=True,
    )
    deadline = asyncio.get_running_loop().time() + (
        int(payload.get("authBootstrapTimeoutMs", AUTH_BOOTSTRAP_TIMEOUT_MS)) / 1000
    )

    while asyncio.get_running_loop().time() < deadline:
        if page.is_closed():
            raise RuntimeError("A janela da automacao foi fechada antes do login ser confirmado.")

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
            pass

        await asyncio.sleep(AUTH_BOOTSTRAP_POLL_INTERVAL_MS / 1000)

    raise RuntimeError("Tempo esgotado aguardando autenticacao manual no navegador dedicado.")


async def launch_persistent_context(
    playwright: Any,
    payload: dict[str, Any],
    *,
    headless: bool,
) -> BrowserContext:
    browser_name = payload.get("browserName", "chromium")
    profile_dir = Path(payload["profileDir"]).resolve()
    profile_dir.mkdir(parents=True, exist_ok=True)
    browser_type = getattr(playwright, browser_name)

    launch_args: dict[str, Any] = {
        "user_data_dir": str(profile_dir),
        "headless": headless,
    }
    if browser_name == "chromium":
        launch_args["args"] = [
            "--disable-blink-features=AutomationControlled",
            "--hide-crash-restore-bubble",
            "--disable-session-crashed-bubble",
        ]

    return await browser_type.launch_persistent_context(**launch_args)


async def launch_direct_context(
    playwright: Any,
    payload: dict[str, Any],
    *,
    headless: bool,
) -> tuple[Any, BrowserContext]:
    browser_name = payload.get("browserName", "chromium")
    browser_type = getattr(playwright, browser_name)

    launch_args: dict[str, Any] = {
        "headless": headless,
    }
    if browser_name == "chromium":
        launch_args["args"] = [
            "--disable-blink-features=AutomationControlled",
            "--hide-crash-restore-bubble",
            "--disable-session-crashed-bubble",
        ]

    browser = await browser_type.launch(**launch_args)

    context_args: dict[str, Any] = {}
    storage_state_path = Path(payload["storageStatePath"]).resolve()
    if storage_state_path.exists():
        context_args["storage_state"] = str(storage_state_path)

    context = await browser.new_context(**context_args)
    return browser, context


async def get_or_create_context_page(context: BrowserContext) -> Page:
    for page in context.pages:
        if page.is_closed():
            continue
        if page.url in ("", "about:blank"):
            return page

    return await context.new_page()


async def focus_visible_page(page: Page, payload: dict[str, Any]) -> None:
    if bool(payload.get("headless", False)):
        return

    try:
        await page.bring_to_front()
    except Exception:
        pass

    browser_name = str(payload.get("browserName", "chromium"))
    app_name = {
        "chromium": "Chromium",
        "firefox": "Firefox",
        "webkit": "Safari",
    }.get(browser_name)

    if not app_name:
        return

    try:
        process = await asyncio.create_subprocess_exec(
            "osascript",
            "-e",
            f'tell application "{app_name}" to activate',
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await process.communicate()
    except Exception:
        pass


async def inspect_session(
    context: BrowserContext,
    page: Page,
    payload: dict[str, Any],
) -> dict[str, Any]:
    await page.wait_for_load_state("domcontentloaded", timeout=payload_timeout(payload))
    body_text = await safe_body_text(page)
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


async def proposal_prefill_core(
    context: BrowserContext,
    page: Page,
    payload: dict[str, Any],
) -> dict[str, Any]:
    await open_and_fill_proposal(page, payload)
    body_text = await wait_for_market_signals(page, payload_timeout(payload))
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


async def inspect_proposal_page_core(page: Page, payload: dict[str, Any]) -> dict[str, Any]:
    await page.goto(
        build_proposal_page_url(payload["proposalPageUrl"]),
        wait_until="domcontentloaded",
        timeout=payload_timeout(payload),
    )
    await wait_for_proposal_form(page, payload_timeout(payload))
    body_text = await wait_for_market_signals(page, payload_timeout(payload))

    return {
        "currentUrl": page.url,
        "proposalPageUrl": build_proposal_page_url(payload["proposalPageUrl"]),
        "page": parse_page_snapshot(body_text),
        "submitButtonVisible": await page.locator("#btnConcluirEnvioProposta").is_visible(),
    }


async def proposal_submit_core(
    context: BrowserContext,
    page: Page,
    payload: dict[str, Any],
) -> dict[str, Any]:
    await emit_step(payload, "browser-opened", "Navegador Python aberto para a automacao.")
    await open_and_fill_proposal(page, payload)
    await emit_step(payload, "proposal-page-opened", "Pagina da proposta aberta.", page.url)

    before_screenshot = await maybe_screenshot(page, payload.get("beforeScreenshotPath"))
    submit_button = page.locator("#btnConcluirEnvioProposta")
    submit_button_visible = await submit_button.is_visible()
    submit_button_enabled = await submit_button.is_enabled()
    body_text = await wait_for_market_signals(page, payload_timeout(payload))
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
        post_submit_text = await wait_for_market_signals(page, payload_timeout(payload))
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
async def collect_project_listing_core(page: Page, payload: dict[str, Any]) -> dict[str, Any]:
    listing_url = str(payload.get("listingUrl") or PROJECT_NOTIFICATIONS_URL)
    source_kind = str(payload.get("sourceKind") or "recommended-notifications")
    limit = max(1, int(payload.get("limit", 20)))
    max_pages = int(payload.get("maxPages", 1))
    # Absolute safety cap — prevents runaway loops regardless of maxPages value.
    hard_page_cap = 200
    seen_urls: set[str] = set()
    seen_page_signatures: set[str] = set()
    items: list[dict[str, str]] = []
    pages_visited = 0
    page_number = 1

    while pages_visited < hard_page_cap:
        target_url = listing_url
        if source_kind == "public-project-list":
            target_url = append_page_query(listing_url, page_number)

        await page.goto(
            target_url,
            wait_until="domcontentloaded",
            timeout=payload_timeout(payload),
        )
        await page.wait_for_timeout(1500)
        await ensure_listing_page_fully_loaded(page)
        pages_visited += 1

        # Pass seen URLs as a plain list so the JS context can build its own Set.
        # Using a Set directly is not serialisable across the evaluate boundary.
        page_items = await page.evaluate(
            r"""([limit, seenList, sourceKind]) => {
          const seen = new Set(seenList);
          const anchors = Array.from(document.querySelectorAll('a[href*="/project/"]'));
          const items = [];
          const statusOnlyPatterns = [
            /sua proposta/i,
            /proposta enviada/i,
            /melhorar proposta/i,
            /fazer pergunta/i,
            /nova mensagem/i,
            /mensagem recebida/i,
            /respondeu/i,
            /resposta/i,
            /coment[aá]rio/i,
            /status/i,
            /foi selecionad/i,
            /foi cancelad/i,
            /foi encerrad/i,
            /convite/i,
            /intera(?:ç|c)[aã]o/i,
            /visualizou sua proposta/i,
          ];
          const opportunityPatterns = [
            /novo projeto/i,
            /projeto recomendado/i,
            /recomendado para voc[eê]/i,
            /desenvolvimento web/i,
            /web, mobile/i,
            /or[cç]amento/i,
            /propostas?/i,
            /interessados?/i,
            /categoria/i,
            /prazo/i,
          ];

          function isOpportunityNotification(anchor) {
            if (sourceKind !== 'recommended-notifications') {
              return true;
            }

            const container = anchor.closest('li, article, .media, .media-body, .notification, .notificacao, .panel, .box') || anchor.parentElement;
            const contextText = (container?.textContent || anchor.textContent || '').replace(/\s+/g, ' ').trim();

            if (!contextText) {
              return false;
            }

            if (statusOnlyPatterns.some((pattern) => pattern.test(contextText))) {
              return false;
            }

            if (opportunityPatterns.some((pattern) => pattern.test(contextText))) {
              return true;
            }

            return /(?:site|landing page|wordpress|react|next\.js|vue\.js|php|node\.js|bug|ajuste|sistema|dashboard|api|integra)/i.test(contextText);
          }

          for (const anchor of anchors) {
            const href = anchor.getAttribute('href') || '';
            if (!href || href.includes('/project/bid/') || href.includes('/project/message/')) {
              continue;
            }

            const absoluteUrl = new URL(href, window.location.origin).toString().split('#')[0].split('?')[0];
            if (
              !absoluteUrl.includes('/project/') ||
              absoluteUrl.endsWith('/project/new') ||
              seen.has(absoluteUrl)
            ) {
              continue;
            }

            const title = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
            if (!title) {
              continue;
            }

            if (!isOpportunityNotification(anchor)) {
              continue;
            }

            items.push({ url: absoluteUrl, title });
            seen.add(absoluteUrl);

            if (items.length >= limit) {
              break;
            }
          }

          return items;
        }""",
            [limit, list(seen_urls), source_kind],
        )

        page_signature = "|".join(
            [page.url] + [str(item.get("url") or "") for item in page_items[:5]]
        )
        if page_signature in seen_page_signatures:
            break
        seen_page_signatures.add(page_signature)

        for item in page_items:
            url = str(item.get("url") or "")
            title = str(item.get("title") or "").strip()
            if not url or not title or url in seen_urls:
                continue
            seen_urls.add(url)
            items.append({"url": url, "title": title})
            if len(items) >= limit:
                break

        if len(items) >= limit:
            break

        # For notifications (single-page source), stop after the first page.
        if source_kind != "public-project-list":
            break

        # For paginated public listing, stop when a page yields no items.
        if not page_items:
            break

        page_number += 1
        if max_pages > 0 and page_number > max_pages:
            break

    return {
        "currentUrl": page.url,
        "items": items,
        "listingUrl": listing_url,
        "pagesVisited": pages_visited,
        "sourceKind": source_kind,
    }


async def ensure_listing_page_fully_loaded(page: Page) -> None:
    previous_height = -1

    for _ in range(12):
        current_height = await page.evaluate(
            "() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)"
        )

        if current_height == previous_height:
            break

        previous_height = current_height
        await page.evaluate("height => window.scrollTo(0, height)", current_height)
        await page.wait_for_timeout(600)

    await page.evaluate("() => window.scrollTo(0, 0)")
    await page.wait_for_timeout(250)




async def scrape_project_page_core(page: Page, payload: dict[str, Any]) -> dict[str, Any]:
    project_url = str(payload.get("projectUrl") or "")
    if not project_url:
        raise RuntimeError("projectUrl is required for project-page-scrape.")

    public_project_url = build_public_project_url(project_url)

    await page.goto(
        public_project_url,
        wait_until="domcontentloaded",
        timeout=payload_timeout(payload),
    )
    await page.wait_for_timeout(1000)

    data = await page.evaluate(
        """(projectUrl) => {
          const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
          const findMeta = (selector) => {
            const element = document.querySelector(selector);
            const content = element?.getAttribute('content') || '';
            return normalize(content) || null;
          };

          const title =
            normalize(document.querySelector('.nomeProjeto')?.textContent) ||
            findMeta('meta[property="og:title"]') ||
            null;
          const description =
            normalize(document.querySelector('.project-description')?.textContent) ||
            findMeta('meta[name="description"]') ||
            null;

          const info = {};
          for (const row of Array.from(document.querySelectorAll('.info-adicionais table tr'))) {
            const label = normalize(row.querySelector('th')?.textContent).replace(/:$/, '');
            const value = normalize(row.querySelector('td')?.textContent);
            if (label) {
              info[label] = value || null;
            }
          }

          const rawSkills = Array.from(
            document.querySelectorAll(
              '.project-skills a, .habilidades a, .abilities a, a[href*="ability"]',
            ),
          )
            .map((node) => normalize(node.textContent))
            .filter(Boolean);

          const skills = Array.from(new Set(rawSkills));

          return {
            currentUrl: window.location.href,
            projectUrl,
            title,
            description,
            category: info['Categoria'] || null,
            subcategory: info['Subcategoria'] || null,
            budgetText: info['Orçamento'] || null,
            proposalCountText: info['Propostas'] || null,
            interestedCountText: info['Interessados'] || null,
            minimumOfferText: info['Valor Mínimo'] || null,
            skills,
          };
        }""",
        public_project_url,
    )

    return data


async def open_and_fill_proposal(page: Page, payload: dict[str, Any]) -> None:
    await page.goto(
        build_proposal_page_url(payload["proposalPageUrl"]),
        wait_until="domcontentloaded",
        timeout=payload_timeout(payload),
    )
    await wait_for_proposal_form(page, payload_timeout(payload))
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


async def safe_body_text(page: Page) -> str:
    return await page.locator("body").inner_text()


async def safe_close_context(context: BrowserContext) -> None:
    try:
        await context.close()
    except Exception:
        return


async def safe_close_browser(browser: Any) -> None:
    try:
        await browser.close()
    except Exception:
        return


async def wait_for_proposal_form(page: Page, timeout_ms: int) -> None:
    form_locator = page.locator("#proposal-form, form[action*='proposal'], #oferta").first

    try:
        await form_locator.wait_for(
            state="visible",
            timeout=min(timeout_ms, 4000),
        )
        return
    except Exception as exc:
        await maybe_open_proposal_form_from_project_page(page, timeout_ms)

        try:
            await form_locator.wait_for(
                state="visible",
                timeout=timeout_ms,
            )
            return
        except Exception:
            body_text = await safe_body_text(page)
            if has_existing_submission_signal(body_text):
                raise RuntimeError(
                    (
                        "DUPLICATED_PROPOSAL: "
                        f"Projeto ja possui proposta enviada. URL atual: {page.url}."
                    )
                ) from exc
            compact_text = " ".join(body_text.split())[:500]
            raise RuntimeError(
                (
                    "Formulario de proposta nao ficou visivel. "
                    f"URL atual: {page.url}. "
                    f"Trecho carregado: {compact_text}"
                )
            ) from exc


async def maybe_open_proposal_form_from_project_page(page: Page, timeout_ms: int) -> None:
    if "/project/bid/" in page.url:
        return

    candidate_locators = [
        page.locator("a[href*='/project/bid/']").first,
        page.get_by_role("link", name=re.compile(r"Enviar proposta", re.I)).first,
        page.get_by_role("button", name=re.compile(r"Enviar proposta", re.I)).first,
        page.locator("a:has-text('Enviar proposta'), button:has-text('Enviar proposta')").first,
    ]

    for locator in candidate_locators:
        body_text = await safe_body_text(page)
        if has_existing_submission_signal(body_text):
            return
        if "Enviar proposta" not in body_text:
            break

        try:
            if not await locator.is_visible(timeout=min(timeout_ms, 2500)):
                continue
            await locator.click()
            await page.wait_for_load_state("domcontentloaded", timeout=min(timeout_ms, 10000))
            await page.wait_for_timeout(1200)
            return
        except Exception:
            continue


async def wait_for_market_signals(page: Page, timeout_ms: int) -> str:
    deadline = asyncio.get_running_loop().time() + (timeout_ms / 1000)
    last_text = ""

    while asyncio.get_running_loop().time() < deadline:
        last_text = await safe_body_text(page)
        snapshot = parse_page_snapshot(last_text)

        if (
            snapshot["averageBidAmount"] is not None
            or snapshot["averageDeadlineDays"] is not None
            or snapshot["minimumOfferAmount"] is not None
        ):
            return last_text

        await asyncio.sleep(0.5)

    return last_text


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
    text = body_text if body_text is not None else await safe_body_text(page)
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


def build_public_project_url(project_url: str) -> str:
    return project_url.replace("/project/bid/", "/project/").split("#")[0].split("?")[0]


def format_money_input(amount: Any) -> str:
    return f"{float(amount):.2f}".replace(".", ",")


def format_deadline_input(days: Any) -> str:
    return str(max(1, round(float(days))))


def payload_timeout(payload: dict[str, Any]) -> int:
    return int(payload.get("timeoutMs", 45000))


def append_page_query(listing_url: str, page_number: int) -> str:
    if page_number <= 1:
        return listing_url

    separator = "&" if "?" in listing_url else "?"
    if re.search(r"([?&])page=\d+", listing_url):
        return re.sub(r"([?&])page=\d+", rf"\1page={page_number}", listing_url, count=1)

    return f"{listing_url}{separator}page={page_number}"


def has_existing_submission_signal(text: str) -> bool:
    lowered = text.lower()
    return (
        "em andamento" in lowered
        or
        "melhorar proposta" in lowered
        or "enviou proposta" in lowered
        or "proposta enviada" in lowered
        or "você já enviou uma proposta" in lowered
        or "voce ja enviou uma proposta" in lowered
    )


def parse_page_snapshot(text: str) -> dict[str, Any]:
    has_offer_field = "Sua oferta" in text
    has_details_field = "Detalhes" in text
    has_proposal_action = "Enviar proposta" in text or "Melhorar proposta" in text

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
        "hasProposalForm": has_proposal_action and has_offer_field and has_details_field,
        "hasQuestionChannel": "Fazer pergunta" in text or "/project/message/" in text,
    }


def extract_warnings(text: str) -> list[str]:
    warnings: list[str] = []
    for line in text.splitlines():
        normalized = line.strip()
        if not normalized:
            continue
        lowered = normalized.lower()
        if (
            "atenção" in lowered
            or "atencao" in lowered
            or "nao compartilhe" in lowered
            or "não compartilhe" in lowered
        ):
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


def write_output(path: str, payload: dict[str, Any]) -> None:
    output_path = Path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")


if __name__ == "__main__":
    asyncio.run(main())
