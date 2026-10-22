import os
import sys
import time
import asyncio
import subprocess
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
except Exception:
    pass

import edge_tts
import imageio_ffmpeg
from playwright.sync_api import sync_playwright

FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
OUTPUT_DIR = Path("e:/Eventforge1/demo_production")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Scene Script and Subtitles
SCENES = [
    {
        "id": "scene1_hook",
        "voice": "en-US-ChristopherNeural",
        "narration": "What if an event could be planned, stress-tested, and experienced in full photorealistic 3D before a single rupee is spent? Welcome to EventForge — the Neuro-Symbolic AI Event Production Command Center designed to transform raw ideas into structured, budget-aware, and visually validated celebration experiences.",
        "hud_icon": "🎙️",
        "hud_text": "Welcome to EventForge: The Neuro-Symbolic AI Event Production Command Center"
    },
    {
        "id": "scene2_overview",
        "voice": "en-US-ChristopherNeural",
        "narration": "Unlike traditional checklists and chat-only tools, EventForge merges deterministic financial algorithms with spatial validation. At its foundation is a Deterministic Budget Engine with zero-drift integer-paise math; Monte Carlo risk analytics running 500 stochastic iterations to forecast cost overruns; and Critical Path DAG scheduling that calculates slack days and crash recovery dates.",
        "hud_icon": "💰",
        "hud_text": "Deterministic Integer-Paise Budgeting · 500-Run Monte Carlo Risk Analytics · Critical Path DAG"
    },
    {
        "id": "scene3_intake",
        "voice": "en-US-ChristopherNeural",
        "narration": "Let's plan a real celebration: a Grand South Indian Wedding for 300 guests in Mysuru with a 15 Lakh rupee budget. With a single click, our neuro-symbolic parser converts this brief into complete event specifications, spatial venue requirements, and deterministic vendor allocations.",
        "hud_icon": "📝",
        "hud_text": "Live Event Intake: Grand Mysore Wedding (300 Guests · ₹15,00,000 Budget · 2-Day Celebration)"
    },
    {
        "id": "scene4_showdown",
        "voice": "en-US-ChristopherNeural",
        "narration": "EventForge immediately synthesizes three distinct deterministic options in the Plan Showdown: Plan A, our Budget Smart option at 12.3 Lakhs; Plan B, our Balanced baseline at 15 Lakhs; and Plan C, the Royal Premium tier at 17.7 Lakhs. In the budget breakdown, all 10 expense categories sum to the exact rupee in whole paise with zero rounding error, backed by a 500-run Monte Carlo probability distribution showing realistic P50 and conservative P90 variance thresholds.",
        "hud_icon": "⚖️",
        "hud_text": "Plan Showdown (Plan A Budget Smart vs Plan B Balanced vs Plan C Royal) & 10-Category Budget"
    },
    {
        "id": "scene5_themes",
        "voice": "en-US-ChristopherNeural",
        "narration": "Now step into our Cinematic Vision Studio. EventForge compiles and renders your actual celebration hall in photorealistic 3D across six culturally authentic themes. First, the Traditional South Indian Temple theme: featuring four authentic hand-carved stone pillars, fresh banana plants, a sacred havan kund, and traditional brass Kuthuvilakku lamps with dynamic flickering flame illumination. Next, with one click, we transform into the Mysuru Royal Heritage theme: magnificent golden palace jharokha multi-arch backdrops, crystal chandeliers, royal velvet thrones, and warm stage spotlights. Here is Modern Luxury Contemporary: geometric champagne gold arch frames, suspended white wisteria floral canopies, and mirrored marble plinths. And the Botanical Garden theme: rustic timber pergolas, climbing blush roses, and criss-crossed Edison fairy lights. We also support Milestone Birthday Fantasy with colorful balloon arches and tiered cake displays, as well as an Executive Corporate Gala with dual curved LED presentation walls. In the 2D Architectural Blueprint, organizers can drag and rearrange stage elements, while EventForge validates fire-code exit corridors and clearances in real time, synchronizing back into 3D immediately.",
        "hud_icon": "🏛️",
        "hud_text": "Cinematic Vision Studio: 6 Authentic 3D Visual Worlds & Bidirectional 2D/3D Synchronization"
    },
    {
        "id": "scene6_simulator",
        "voice": "en-US-ChristopherNeural",
        "narration": "Event-day conditions are unpredictable. EventForge's What-If Simulator lets organizers stress-test contingencies before committing funds. Let's simulate a sudden surge of 100 additional guests and a 15% catering cost inflation shock. EventForge immediately highlights buffet queue bottlenecks and budget variance. When done experimenting, our 1-click revert restores the baseline plan instantly without data loss.",
        "hud_icon": "🔮",
        "hud_text": "What-If Operational Simulator: Stress-Testing Guest Surges & Inflation with 1-Click Revert"
    },
    {
        "id": "scene7_production",
        "voice": "en-US-ChristopherNeural",
        "narration": "When you're ready to execute, EventForge compiles the complete Event-Day Production Pack: a master run-of-show timeline down to the minute, 11-category vendor call sheets with contact protocols, and emergency contingency playbooks ready for your on-ground team. EventForge: From Event Ideas to Intelligent Event Experiences. Plan smarter, visualize every detail, and celebrate without limits. Thank you.",
        "hud_icon": "📦",
        "hud_text": "Event-Day Production Pack: Run-of-Show Timelines, Vendor Call Sheets, & Operational Playbooks"
    }
]

def get_audio_duration(file_path):
    cmd = [FFMPEG_EXE, "-i", str(file_path), "-f", "null", "-"]
    res = subprocess.run(cmd, stderr=subprocess.PIPE, text=True)
    for line in res.stderr.splitlines():
        if "Duration:" in line:
            parts = line.split("Duration:")[1].split(",")[0].strip()
            h, m, s = parts.split(":")
            return float(h) * 3600 + float(m) * 60 + float(s)
    return 10.0

async def generate_all_audio():
    print("\n[Step 1/5] Synthesizing Voice-Over Narration via Edge-TTS...")
    audio_files = []
    durations = []
    for sc in SCENES:
        out_file = OUTPUT_DIR / f"{sc['id']}.mp3"
        if not out_file.exists() or out_file.stat().st_size < 1000:
            print(f"  -> Generating audio for: {sc['id']} ({len(sc['narration'].split())} words)...")
            comm = edge_tts.Communicate(sc["narration"], sc["voice"])
            await comm.save(str(out_file))
        dur = get_audio_duration(out_file)
        print(f"     Audio: {sc['id']} ({dur:.2f}s)")
        audio_files.append(out_file)
        durations.append(dur)
    
    # Concatenate all into master audio track
    concat_list = OUTPUT_DIR / "concat_list.txt"
    with open(concat_list, "w", encoding="utf-8") as f:
        for a in audio_files:
            f.write(f"file '{a.resolve().as_posix()}'\n")
    
    master_audio = OUTPUT_DIR / "master_voiceover.mp3"
    cmd = [FFMPEG_EXE, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(master_audio)]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    master_dur = get_audio_duration(master_audio)
    print(f"  ==> Master Audio Track Created: {master_audio} ({master_dur:.2f}s total duration)\n")
    return durations, master_audio

def record_visuals(durations):
    raw_video_dir = OUTPUT_DIR / "raw_video"
    raw_video_dir.mkdir(parents=True, exist_ok=True)
    
    # Clean previous raw videos
    for f in raw_video_dir.glob("*.webm"):
        f.unlink(missing_ok=True)

    print("\n[Step 2/5] Recording Live 1080p Browser Visuals via Playwright...")
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        context = browser.new_context(
            record_video_dir=str(raw_video_dir),
            record_video_size={"width": 1920, "height": 1080},
            viewport={"width": 1920, "height": 1080}
        )
        page = context.new_page()

        def inject_hud():
            page.evaluate("""() => {
                if (document.getElementById('demo-hud')) return;
                const hud = document.createElement('div');
                hud.id = 'demo-hud';
                hud.style.position = 'fixed';
                hud.style.bottom = '24px';
                hud.style.left = '50%';
                hud.style.transform = 'translateX(-50%)';
                hud.style.background = 'rgba(11, 17, 32, 0.94)';
                hud.style.border = '1px solid rgba(212, 175, 55, 0.6)';
                hud.style.borderRadius = '32px';
                hud.style.padding = '10px 32px';
                hud.style.color = '#fcfaf6';
                hud.style.fontSize = '17px';
                hud.style.fontWeight = '600';
                hud.style.zIndex = '999999';
                hud.style.boxShadow = '0 12px 35px rgba(0,0,0,0.7), 0 0 25px rgba(212, 175, 55, 0.25)';
                hud.style.backdropFilter = 'blur(12px)';
                hud.style.textAlign = 'center';
                hud.style.maxWidth = '1000px';
                hud.style.transition = 'all 0.3s ease';
                hud.innerHTML = '<span style="color:#ffd700">✦ EventForge</span>: Intelligent Event Production Command Center';
                document.body.appendChild(hud);

                const brand = document.createElement('div');
                brand.id = 'demo-brand';
                brand.style.position = 'fixed';
                brand.style.top = '16px';
                brand.style.right = '20px';
                brand.style.background = 'rgba(15, 23, 42, 0.9)';
                brand.style.border = '1px solid rgba(212, 175, 55, 0.4)';
                brand.style.borderRadius = '20px';
                brand.style.padding = '6px 18px';
                brand.style.color = '#ffd700';
                brand.style.fontSize = '13px';
                brand.style.fontWeight = '700';
                brand.style.zIndex = '999999';
                brand.style.letterSpacing = '0.5px';
                brand.innerHTML = '⚡ LIVE PRODUCT WALKTHROUGH · 1080p';
                document.body.appendChild(brand);
            }""")

        def set_sub(text, icon="✦"):
            print(f"  [HUD] {text[:65]}...")
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

        # -----------------------------------------------------------------
        # Scene 1: The Hook & Introduction
        # -----------------------------------------------------------------
        dur1 = durations[0]
        print(f"  -> Recording Scene 1: The Hook ({dur1:.1f}s)...")
        page.goto("http://localhost:8000")
        page.wait_for_load_state("networkidle")
        inject_hud()
        set_sub(SCENES[0]["hud_text"], SCENES[0]["hud_icon"])
        time.sleep(dur1 * 0.45)
        smooth_scroll(320, steps=25, delay=0.03)
        time.sleep(dur1 * 0.45)
        smooth_scroll(0, steps=20, delay=0.02)
        time.sleep(dur1 * 0.1)

        # -----------------------------------------------------------------
        # Scene 2: Engineering Overview
        # -----------------------------------------------------------------
        dur2 = durations[1]
        print(f"  -> Recording Scene 2: Core Engineering Pillars ({dur2:.1f}s)...")
        inject_hud()
        set_sub(SCENES[1]["hud_text"], SCENES[1]["hud_icon"])
        smooth_scroll(520, steps=25, delay=0.03)
        time.sleep(dur2 * 0.45)
        smooth_scroll(1050, steps=25, delay=0.03)
        time.sleep(dur2 * 0.45)
        smooth_scroll(0, steps=25, delay=0.02)
        time.sleep(dur2 * 0.1)

        # -----------------------------------------------------------------
        # Scene 3: Live Event Intake
        # -----------------------------------------------------------------
        dur3 = durations[2]
        print(f"  -> Recording Scene 3: Live Event Intake Brief ({dur3:.1f}s)...")
        inject_hud()
        set_sub(SCENES[2]["hud_text"], SCENES[2]["hud_icon"])
        
        # Click the Mysore Wedding sample card to create plan
        page.evaluate("""() => {
            const card = document.querySelector('.cat-card');
            if (card) card.click();
            else {
                const btn = document.getElementById('btn-hero-start');
                if (btn) btn.click();
            }
        }""")
        
        # Wait for plan to load
        for _ in range(30):
            has_plan = page.evaluate("() => Boolean(window.S && window.S.plan)")
            if has_plan:
                break
            time.sleep(0.3)
        
        inject_hud()
        time.sleep(dur3 - 3.0)

        # -----------------------------------------------------------------
        # Scene 4: Plan Showdown & Budget Breakdown
        # -----------------------------------------------------------------
        dur4 = durations[3]
        print(f"  -> Recording Scene 4: Plan Showdown & Budget Breakdown ({dur4:.1f}s)...")
        # Navigate to showdown
        page.evaluate("go('showdown')")
        time.sleep(1.0)
        inject_hud()
        set_sub(SCENES[3]["hud_text"], SCENES[3]["hud_icon"])
        smooth_scroll(250, steps=20, delay=0.03)
        time.sleep(dur4 * 0.45)

        # Navigate to budget
        page.evaluate("go('budget')")
        time.sleep(1.0)
        inject_hud()
        set_sub("10-Category Whole-Paise Allocations & 500-Run Monte Carlo Risk Distribution", "💰")
        smooth_scroll(400, steps=25, delay=0.03)
        time.sleep(dur4 * 0.45)

        # -----------------------------------------------------------------
        # Scene 5: Theme-Aware 3D Vision Studio (The Visual Centerpiece)
        # -----------------------------------------------------------------
        dur5 = durations[4]
        print(f"  -> Recording Scene 5: Cinematic Vision Studio & 6 Visual Worlds ({dur5:.1f}s)...")
        page.evaluate("go('vision')")
        time.sleep(2.0)
        inject_hud()
        set_sub(SCENES[4]["hud_text"], SCENES[4]["hud_icon"])

        # Cycle through themes with dedicated viewing holds:
        theme_cycle = [
            ("temple_red", "Traditional South Indian Temple Mandap: 4 Carved Pillars, Banana Trees, Brass Lamps & Havan Kund", 8.0),
            ("royal_gold", "Mysuru Royal Heritage: Golden Palace Jharokha Arches, Crystal Chandeliers & Velvet Thrones", 8.0),
            ("minimal_sage", "Modern Luxury Contemporary: Champagne Geometric Frames & Suspended Wisteria Canopy", 7.0),
            ("boho_garden", "Botanical Garden Pergola: Rustic Timber Pergola, Climbing Blush Roses & Fairy Lights", 7.0),
            ("unicorn", "Milestone Birthday Fantasy: Multi-Tone Balloon Arch, Neon Script & Celebration Cake", 6.0),
            ("cultural_fair", "Executive Corporate Gala: Dual Curved LED Video Walls & Presenter Podium", 6.0)
        ]

        for tid, title, hold in theme_cycle:
            print(f"     -> Switching to Theme: {tid}...")
            page.evaluate(f"""(tid) => {{
                const btn = document.querySelector(`[data-switch-theme="${{tid}}"]`);
                if (btn) btn.click();
            }}""", tid)
            set_sub(title, "✨")
            time.sleep(hold)

        # Switch to 2D Floor Plan Blueprint
        print("     -> Demonstrating 2D Architectural Blueprint & Clearance Validation...")
        page.evaluate("""() => {
            const btn = document.getElementById('tab-v-2d');
            if (btn) btn.click();
        }""")
        set_sub("2D Architectural Floor Plan: Dragging Elements Enforces Exit Clearances in Real Time", "📐")
        time.sleep(4.0)

        # Switch back to 3D View
        print("     -> Demonstrating Real-Time Synchronized 3D Viewport...")
        page.evaluate("""() => {
            const btn = document.getElementById('tab-v-3d');
            if (btn) btn.click();
        }""")
        set_sub("Synchronized 3D Viewport: Real-Time Layout Updates Across Three.js Meshes", "🏛️")
        time.sleep(4.0)

        # -----------------------------------------------------------------
        # Scene 6: What-If Operational Simulator
        # -----------------------------------------------------------------
        dur6 = durations[5]
        print(f"  -> Recording Scene 6: What-If Operational Simulator ({dur6:.1f}s)...")
        page.evaluate("go('simulator')")
        time.sleep(1.5)
        inject_hud()
        set_sub(SCENES[5]["hud_text"], SCENES[5]["hud_icon"])
        smooth_scroll(200, steps=20, delay=0.03)
        time.sleep(dur6 * 0.45)

        # Click Revert
        page.evaluate("""() => {
            const btn = document.querySelector('button.btn.ghost.sm');
            if (btn && btn.textContent.includes('Revert')) btn.click();
        }""")
        set_sub("1-Click Revert: Safely Restores Baseline Plan with Zero Data Drift", "🛡️")
        time.sleep(dur6 * 0.45)

        # -----------------------------------------------------------------
        # Scene 7: Production Pack & Branded Closing
        # -----------------------------------------------------------------
        dur7 = durations[6]
        print(f"  -> Recording Scene 7: Production Pack & Closing ({dur7:.1f}s)...")
        page.evaluate("go('production')")
        time.sleep(1.5)
        inject_hud()
        set_sub(SCENES[6]["hud_text"], SCENES[6]["hud_icon"])
        smooth_scroll(350, steps=25, delay=0.03)
        time.sleep(dur7 * 0.4)

        # Executive Branded Closing Card
        page.evaluate("""() => {
            const overlay = document.createElement('div');
            overlay.id = 'closing-overlay';
            overlay.style.position = 'fixed';
            overlay.style.inset = '0';
            overlay.style.background = 'radial-gradient(ellipse at center, #1e293b 0%, #0b1120 100%)';
            overlay.style.zIndex = '9999999';
            overlay.style.display = 'flex';
            overlay.style.flexDirection = 'column';
            overlay.style.alignItems = 'center';
            overlay.style.justifyContent = 'center';
            overlay.style.color = '#fff';
            overlay.style.fontFamily = 'Inter, system-ui, sans-serif';
            overlay.style.animation = 'fadeIn 0.8s ease forwards';
            overlay.innerHTML = `
                <div style="font-size:16px;font-weight:700;color:#ffd700;letter-spacing:2.5px;margin-bottom:14px;text-transform:uppercase">HACK2SKILL · CHALLENGE 5</div>
                <h1 style="font-size:52px;font-weight:850;margin:0 0 14px;background:linear-gradient(135deg,#ffffff 0%,#d4af37 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent">EventForge</h1>
                <p style="font-size:22px;color:#94a3b8;margin:0 0 36px">Plan Smarter. Visualize Every Detail. Celebrate Without Limits.</p>
                <div style="background:rgba(15,23,42,0.85);border:1px solid rgba(212,175,55,0.45);border-radius:16px;padding:22px 42px;display:flex;flex-direction:column;gap:14px;text-align:center;box-shadow:0 15px 40px rgba(0,0,0,0.6)">
                    <div style="font-size:16px;color:#e2e8f0"><span style="color:#ffd700;font-weight:700">GitHub:</span> github.com/somashekharvani/Event-Forge</div>
                    <div style="font-size:16px;color:#e2e8f0"><span style="color:#ffd700;font-weight:700">Live Demo:</span> event-forge-taj8.vercel.app</div>
                    <div style="font-size:14px;color:#94a3b8;margin-top:4px">Evaluations: 31/31 Passed (100%) · Invariants: 10/10 Caught</div>
                </div>
            `;
            document.body.appendChild(overlay);
        }""")
        set_sub("EventForge: From Event Ideas to Intelligent Event Experiences. Thank you!", "✦")
        time.sleep(dur7 * 0.5)

        print("  -> Finalizing browser context and video streams...")
        page.close()
        context.close()
        browser.close()

    raw_videos = list(raw_video_dir.glob("*.webm"))
    if not raw_videos:
        raise RuntimeError("No raw video was generated by Playwright!")
    latest_raw = max(raw_videos, key=os.path.getctime)
    print(f"  ==> Raw Video Captured: {latest_raw} ({latest_raw.stat().st_size / (1024*1024):.2f} MB)")
    return latest_raw

def multiplex_final_deliverables(raw_video, master_audio):
    print("\n[Step 3/5] Multiplexing Video and Narration Audio with FFmpeg...")
    
    # 1. Official MP4 (Universal playback - YouTube, QuickTime, Windows, Mobile, Web)
    official_mp4 = Path("e:/Eventforge1/EventForge_Official_Demo.mp4")
    print(f"  -> Rendering Official Full 1080p MP4: {official_mp4}...")
    cmd_mp4 = [
        FFMPEG_EXE, "-y",
        "-i", str(raw_video),
        "-i", str(master_audio),
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        str(official_mp4)
    ]
    subprocess.run(cmd_mp4, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    print(f"     SUCCESS: {official_mp4} ({official_mp4.stat().st_size / (1024*1024):.2f} MB)")

    # 2. Official WebM (High quality open format)
    official_webm = Path("e:/Eventforge1/EventForge_Official_Demo.webm")
    print(f"  -> Rendering Official 1080p WebM: {official_webm}...")
    cmd_webm = [
        FFMPEG_EXE, "-y",
        "-i", str(raw_video),
        "-i", str(master_audio),
        "-c:v", "copy",
        "-c:a", "libopus",
        "-b:a", "128k",
        "-shortest",
        str(official_webm)
    ]
    subprocess.run(cmd_webm, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    print(f"     SUCCESS: {official_webm} ({official_webm.stat().st_size / (1024*1024):.2f} MB)")

    # 3. GitHub Preview MP4 (Under 10MB to guarantee GitHub web blob viewer renders without file size warning)
    preview_mp4 = Path("e:/Eventforge1/EventForge_Demo_Preview.mp4")
    print(f"  -> Rendering GitHub-Optimized Preview MP4 (<10MB): {preview_mp4}...")
    cmd_preview = [
        FFMPEG_EXE, "-y",
        "-i", str(official_mp4),
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "30",
        "-vf", "scale=1280:720",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "96k",
        str(preview_mp4)
    ]
    subprocess.run(cmd_preview, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    print(f"     SUCCESS: {preview_mp4} ({preview_mp4.stat().st_size / (1024*1024):.2f} MB)")

    print("\n========================================================")
    print("ALL PRODUCTION DEMO DELIVERABLES GENERATED SUCCESSFULLY!")
    print(f"1. Official 1080p MP4:    {official_mp4} ({official_mp4.stat().st_size / (1024*1024):.2f} MB)")
    print(f"2. Official 1080p WebM:   {official_webm} ({official_webm.stat().st_size / (1024*1024):.2f} MB)")
    print(f"3. GitHub Preview MP4:    {preview_mp4} ({preview_mp4.stat().st_size / (1024*1024):.2f} MB)")
    print("========================================================\n")

def main():
    durations, master_audio = asyncio.run(generate_all_audio())
    raw_video = record_visuals(durations)
    multiplex_final_deliverables(raw_video, master_audio)

if __name__ == "__main__":
    main()
