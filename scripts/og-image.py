"""
Draw the social-preview card (public/og.png, 1200x630) and the home-screen
icon (public/apple-touch-icon.png, 180x180).

Both are committed; run this again only when the name, the role or the look
changes. It needs a running build of the site, because the card is drawn with
the site's own fonts and its own CN-cycle figure (components/home-network.tsx):

    npm run build && npx next start -p 3510 &
    python3 scripts/og-image.py http://localhost:3510

Requires Playwright for Python and Pillow.
"""

import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3510"
ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
CHROMIUM = "/opt/pw-browsers/chromium"

CARD = """
<div style="box-sizing:border-box;width:1200px;height:630px;padding:72px 80px;
            background:hsl(40 20% 99%);color:hsl(30 8% 12%);display:flex;gap:56px;
            align-items:center;border-bottom:10px solid hsl(213 68% 40%)">
  <div style="flex:1;min-width:0">
    <div style="font-family:var(--font-sans);font-size:22px;letter-spacing:.14em;
                text-transform:uppercase;color:hsl(35 6% 38%)">{role}</div>
    <div style="font-family:var(--font-serif);font-weight:600;font-size:76px;
                line-height:1.05;letter-spacing:-.01em;margin-top:22px">{name}</div>
    <div style="font-family:var(--font-serif);font-size:38px;line-height:1.25;
                margin-top:26px;color:hsl(30 8% 22%)">{tagline}</div>
    <div style="font-family:var(--font-sans);font-size:22px;margin-top:40px;
                color:hsl(35 6% 38%)">{place}</div>
  </div>
  <div style="width:380px;flex:none">{figure}</div>
</div>
"""


def main() -> None:
    PUBLIC.mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM)
        page = browser.new_page(viewport={"width": 1200, "height": 630}, color_scheme="light")
        page.goto(BASE + "/", wait_until="networkidle")
        figure = page.eval_on_selector("figure svg", "e => e.outerHTML")
        role = page.eval_on_selector("main section p", "e => e.textContent")
        tagline = page.eval_on_selector("main h1", "e => e.textContent")
        name = page.eval_on_selector("header a", "e => e.textContent")
        place = "Università degli Studi di Padova"
        page.evaluate(
            "html => { document.body.innerHTML = html; document.body.style.margin = 0 }",
            CARD.format(role=role, name=name, tagline=tagline, place=place, figure=figure),
        )
        page.evaluate("document.fonts.ready")
        page.screenshot(path=str(PUBLIC / "og.png"), clip={"x": 0, "y": 0, "width": 1200, "height": 630})
        browser.close()

    # The icon: the favicon on the paper ground, padded, since iOS fills any
    # transparency with black.
    icon = Image.open(ROOT / "app" / "favicon.ico")
    icon.size = (256, 256)
    icon = icon.convert("RGBA").resize((148, 148), Image.LANCZOS)
    ground = Image.new("RGBA", (180, 180), (253, 252, 250, 255))
    ground.alpha_composite(icon, (16, 16))
    ground.convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)
    print("wrote", PUBLIC / "og.png", "and", PUBLIC / "apple-touch-icon.png")


if __name__ == "__main__":
    main()
