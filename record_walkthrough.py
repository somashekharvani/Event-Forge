import os
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

def run_recording():
    output_dir = Path("e:/Eventforge1/videos")
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print("[1/5] Launching Microsoft Edge via Playwright...")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context(
            record_video_dir=str(output_dir),
            record_video_size={"width": 1920, "height": 1080},
            viewport={"width": 1920, "height": 1080}
        )
        page = context.new_page()
        
        # Inject Subtitle & Watermark Bar helper
        def inject_hud():
            page.evaluate("""() => {
                if (document.getElementById('demo-hud')) return;
                const hud = document.createElement('div');
                hud.id = 'demo-hud';
                hud.style.position = 'fixed';
                hud.style.bottom = '24px';
                hud.style.left = '50%';
                hud.style.transform = 'translateX(-50%)';
                hud.style.background = 'rgba(11, 17, 32, 0.92)';
                hud.style.border = '1px solid rgba(212, 175, 55, 0.5)';
                hud.style.borderRadius = '30px';
                hud.style.padding = '10px 28px';
                hud.style.color = '#fcfaf6';
                hud.style.fontSize = '16px';
                hud.style.fontWeight = '600';
                hud.style.zIndex = '99999';
                hud.style.boxShadow = '0 10px 30px rgba(0,0,0,0.6), 0 0 20px rgba(212, 175, 55, 0.2)';
                hud.style.backdropFilter = 'blur(10px)';
                hud.style.textAlign = 'center';
                hud.style.maxWidth = '900px';
                hud.style.transition = 'all 0.3s ease';
                hud.innerHTML = '<span style="color:#ffd700">✦ EventForge</span>: Real-Time Product Walkthrough';
                document.body.appendChild(hud);
                
                // Top Brand Tag
                const brand = document.createElement('div');
                brand.id = 'demo-brand';
                brand.style.position = 'fixed';
                brand.style.top = '16px';
                brand.style.right = '20px';
                brand.style.background = 'rgba(15, 23, 42, 0.85)';
                brand.style.border = '1px solid rgba(212, 175, 55, 0.3)';
                brand.style.borderRadius = '20px';
                brand.style.padding = '6px 16px';
                brand.style.color = '#ffd700';
                brand.style.fontSize = '13px';
                brand.style.fontWeight = '700';
                brand.style.zIndex = '99999';
                brand.style.letterSpacing = '0.5px';
                brand.innerHTML = '⚡ LIVE DEMO RECORDING · 1080p';
                document.body.appendChild(brand);
            }""")

        def set_sub(text, icon="✦"):
            print(f"  -> Subtitle: {text[:60]}...")
            page.evaluate("""([icon, text]) => {
                const h = document.getElementById('demo-hud');
                if (h) h.innerHTML = `<span style="color:#ffd700">${icon} EventForge:</span> ${text}`;
            }""", [icon, text])

        def smooth_scroll(y, steps=25, delay=0.03):
            page.evaluate(f"""async () => {{
                const start = window.scrollY;
                const end = {y};
                for (let i = 1; i <= {steps}; i++) {{
                    window.scrollTo(0, start + (end - start) * (i / {steps}));
                    await new Promise(r => setTimeout(r, {delay * 1000}));
                }}
            }}""")
            time.sleep(steps * delay + 0.1)

        print("[2/5] Scene 1 & 2: Opening Homepage & Product Introduction...")
        page.goto("http://localhost:8000")
        page.wait_for_load_state("networkidle")
        inject_hud()
        
        set_sub("What if an event could be planned, tested, and visualized before a single guest arrives?", "🎙️")
        time.sleep(4.0)

        set_sub("EventForge unifies the entire event-production workflow into one connected workspace.")
        smooth_scroll(450, steps=30, delay=0.04)
        time.sleep(3.0)

        smooth_scroll(900, steps=30, delay=0.04)
        time.sleep(2.5)

        set_sub("Let's plan a traditional South Indian wedding for 300 guests in Mysuru with ₹15L budget.")
        smooth_scroll(0, steps=25, delay=0.03)
        time.sleep(1.5)

        # Scene 3: Start Planning / Launch Sample Wedding
        print("[3/5] Scene 3 & 4: Loading Live Wedding Brief & Budget Breakdown...")
        set_sub("Transforming event brief into an end-to-end plan with zero-drift integer paise allocation.")
        
        # Click the featured sample wedding card on homepage
        sample_card = page.locator(".cat-card").first
        if sample_card.is_visible():
            sample_card.click()
        else:
            page.locator("#btn-hero-start").click()
        
        time.sleep(3.5)
        inject_hud()

        # Scene 4: Plan Showdown & Budget Breakdown
        set_sub("Event Design Showdown: Comparing Plan A (Budget Smart), Plan B (Balanced), & Plan C (Royal Premium).")
        smooth_scroll(200, steps=20, delay=0.03)
        time.sleep(4.0)

        # Click Budget tab
        b_tab = page.locator('[data-go="budget"]')
        if b_tab.is_visible():
            b_tab.click()
            time.sleep(2.0)
            set_sub("Budget Engine: Exact whole-paise distribution across 10 categories with Monte Carlo overrun forecasting.")
            smooth_scroll(350, steps=20, delay=0.03)
            time.sleep(4.0)

        # Scene 5: Theme-Aware 3D Vision Studio (The Visual Centerpiece)
        print("[4/5] Scene 5: Cinematic Vision Studio & 3D Theme Transformations...")
        v_tab = page.locator('[data-go="vision"]')
        if v_tab.is_visible():
            v_tab.click()
            time.sleep(3.0)
            inject_hud()

            # 1. Traditional Temple
            temple_pill = page.locator('[data-switch-theme="temple_red"]')
            if temple_pill.is_visible():
                temple_pill.click()
                set_sub("Traditional Temple Theme: 4 carved stone pillars, banana trees, brass lamps with flickering flame glows, and havan kund.")
                time.sleep(4.5)

            # 2. Mysuru Royal
            royal_pill = page.locator('[data-switch-theme="royal_gold"]')
            if royal_pill.is_visible():
                royal_pill.click()
                set_sub("Mysuru Royal Wedding: Live 3D transformation to golden palace jharokha arches, crystal chandeliers, & velvet thrones.")
                time.sleep(4.5)

            # 3. Modern Luxury
            modern_pill = page.locator('[data-switch-theme="minimal_sage"]')
            if modern_pill.is_visible():
                modern_pill.click()
                set_sub("Modern Luxury Contemporary: Geometric champagne frames, suspended wisteria canopy, & mirrored plinths.")
                time.sleep(4.0)

            # 4. Botanical Garden
            garden_pill = page.locator('[data-switch-theme="boho_garden"]')
            if garden_pill.is_visible():
                garden_pill.click()
                set_sub("Botanical Garden: Natural timber pergola, climbing ivy & blush roses, with Edison fairy lights.")
                time.sleep(3.5)

            # Switch back to Temple for wedding authenticity
            if temple_pill.is_visible():
                temple_pill.click()
                time.sleep(2.0)

            # 2D Floor Plan Sync Demonstration
            tab_2d = page.locator("#tab-v-2d")
            tab_3d = page.locator("#tab-v-3d")
            if tab_2d.is_visible():
                tab_2d.click()
                set_sub("2D Architectural Blueprint: Dragging furniture updates 3D coordinates in real time while validating exit corridors.")
                time.sleep(3.0)
                if tab_3d.is_visible():
                    tab_3d.click()
                    set_sub("Synchronized 3D Viewport: Coordinates and clearances immediately reflected.")
                    time.sleep(3.0)

        # Scene 6: What-If Operational Simulator
        print("[5/5] Scene 6 & 7: What-If Stress Testing, Production Pack & Closing...")
        sim_tab = page.locator('[data-go="simulator"]')
        if sim_tab.is_visible():
            sim_tab.click()
            time.sleep(2.5)
            inject_hud()
            set_sub("What-If Operational Simulator: Stress-testing guest surges (+100 guests) and catering inflation.")
            smooth_scroll(200, steps=15, delay=0.03)
            time.sleep(4.0)

            revert_btn = page.locator("button:has-text('Revert')")
            if revert_btn.is_visible():
                revert_btn.first.click()
                set_sub("1-Click Revert: Safely restores baseline plan without risk of data corruption.")
                time.sleep(3.0)

        # Scene 7: Production Pack & Branded Closing
        prod_tab = page.locator('[data-go="production"]')
        if prod_tab.is_visible():
            prod_tab.click()
            time.sleep(2.5)
            inject_hud()
            set_sub("Event-Day Production Pack: Printable master run-of-show schedule, 11-category vendor call sheets, and crisis playbooks.")
            smooth_scroll(300, steps=20, delay=0.03)
            time.sleep(4.0)

        # Closing Card Overlay
        page.evaluate("""() => {
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.background = 'radial-gradient(ellipse at center, #1e293b 0%, #0b1120 100%)';
            overlay.style.zIndex = '999999';
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.color = '#fff';
            overlay.style.fontFamily = 'Inter, system-ui, sans-serif';
            overlay.style.animation = 'fadeIn 1s ease forwards';
            overlay.innerHTML = `
                <div style="font-size:16px;font-weight:700;color:#ffd700;letter-spacing:2px;margin-bottom:12px">HACK2SKILL · CHALLENGE 5</div>
                <h1 style="font-size:46px;font-weight:850;margin:0 0 14px;background:linear-gradient(135deg,#ffffff 0%,#d4af37 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent">EventForge</h1>
                <p style="font-size:20px;color:#94a3b8;margin:0 0 32px">Plan Smarter. Visualize Every Detail. Celebrate Without Limits.</p>
                <div style="background:rgba(15,23,42,0.85);border:1px solid rgba(212,175,55,0.4);border-radius:14px;padding:20px 36px;display:flex;flex-direction:column;gap:12px;text-align:center;box-shadow:0 15px 35px rgba(0,0,0,0.5)">
                    <div style="font-size:15px;color:#e2e8f0"><span style="color:#ffd700">GitHub:</span> github.com/somashekharvani/Event-Forge</div>
                    <div style="font-size:15px;color:#e2e8f0"><span style="color:#ffd700">Live Demo:</span> event-forge-taj8.vercel.app</div>
                </div>
            `;
            document.body.appendChild(overlay);
        }""")
        set_sub("EventForge: From Event Ideas to Intelligent Event Experiences. Thank you for watching!")
        time.sleep(6.0)

        # Close and finalize video
        print("Finalizing video recording...")
        page.close()
        context.close()
        browser.close()

    # Find the created video file and rename it
    video_files = list(output_dir.glob("*.webm"))
    if video_files:
        latest_video = max(video_files, key=os.path.getctime)
        final_dest = Path("e:/Eventforge1/EventForge_Official_Demo.webm")
        latest_video.replace(final_dest)
        print(f"\n========================================================")
        print(f"SUCCESS: Demo video saved to: {final_dest}")
        print(f"File size: {final_dest.stat().st_size / (1024*1024):.2f} MB")
        print(f"========================================================")
    else:
        print("Warning: No video file found.")

if __name__ == "__main__":
    run_recording()
