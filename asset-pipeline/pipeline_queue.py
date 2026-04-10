"""
Ignisium Asset Pipeline Queue
=============================
End-to-end queue: subject text -> MJ prompt -> Discord MJ bot -> downloaded
image -> Hunyuan3D-2.1 GLB -> auto-installed in public/assets/models/buildings/.

Components in this single module:
  * JobState / Job          : data classes + JSON persistence
  * PromptGenerator         : Ollama (optional) + structured template fallback
  * DiscordMJBridge         : discord.py-self bot that drives /imagine + U1 click
  * ThreeDRunner            : adapter that calls back into app.py's generate()
  * AssetInstaller          : copy final GLB into the game's assets folder
  * PipelineWorker          : single-threaded state-machine worker

The whole thing runs as a singleton inside the existing Gradio app.py process.
Public API:
    queue = PipelineQueue.instance()
    queue.add_job(subject, asset_name, preset)
    queue.list_jobs()
    queue.cancel_job(job_id)

Configuration is read from .env (DISCORD_TOKEN, DISCORD_CHANNEL_ID, optional
OLLAMA_MODEL). Without DISCORD_TOKEN the queue still works but stops at the
"prompt ready, paste it into Discord yourself" stage.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import threading
import time
import traceback
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Callable, Dict, List, Optional


# ---------------------------------------------------------------------------
# Paths + .env loading
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).parent.resolve()
INBOX_DIR = SCRIPT_DIR / "inbox"
INBOX_DIR.mkdir(exist_ok=True)
QUEUE_FILE = SCRIPT_DIR / "queue.json"
ENV_FILE = SCRIPT_DIR / ".env"

GAME_ASSETS_DIR = (SCRIPT_DIR.parent / "public" / "assets" / "models" / "buildings").resolve()


def _load_env(path: Path) -> Dict[str, str]:
    """Tiny .env parser. Ignores quoting, comments, blanks. Good enough."""
    env: Dict[str, str] = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


_env = _load_env(ENV_FILE)
DISCORD_TOKEN = _env.get("DISCORD_TOKEN", "") or os.environ.get("DISCORD_TOKEN", "")
DISCORD_CHANNEL_ID = int(_env.get("DISCORD_CHANNEL_ID", "0") or os.environ.get("DISCORD_CHANNEL_ID", "0") or "0")
OLLAMA_MODEL = _env.get("OLLAMA_MODEL", "") or os.environ.get("OLLAMA_MODEL", "")
OLLAMA_HOST = _env.get("OLLAMA_HOST", "http://localhost:11434")

MJ_BOT_ID = 936929561302675456  # Tencent / Midjourney bot application id
MJ_BOT_USER_ID = 936929561302675456


# ---------------------------------------------------------------------------
# Job state model
# ---------------------------------------------------------------------------
class JobState(str, Enum):
    NEW = "new"
    PROMPTING = "prompting"
    PROMPT_READY = "prompt_ready"
    MJ_SUBMITTING = "mj_submitting"
    MJ_PENDING = "mj_pending"
    MJ_DONE = "mj_done"
    THREED_PENDING = "3d_pending"
    THREED_RUNNING = "3d_running"
    INSTALLING = "installing"
    DONE = "done"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Job:
    id: str
    subject: str            # raw user input ("command center with four pylons")
    asset_name: str         # snake_case, used for filename + game install lookup
    preset: str = "high"    # quality preset for the 3D step
    state: str = JobState.NEW.value
    prompt: str = ""        # full MJ prompt after generation
    mj_grid_msg_id: int = 0
    mj_image_url: str = ""
    mj_local_path: str = "" # downloaded MJ image
    glb_path: str = ""      # untextured + textured GLB(s) live in output/
    installed_path: str = ""  # public/assets/models/buildings/<name>.glb
    error: str = ""
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    log: List[str] = field(default_factory=list)

    def add_log(self, msg: str) -> None:
        ts = datetime.utcnow().strftime("%H:%M:%S")
        self.log.append(f"[{ts}] {msg}")
        self.updated_at = datetime.utcnow().isoformat()

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict) -> "Job":
        return cls(**d)


# ---------------------------------------------------------------------------
# JSON-backed job store (single-process, in-memory + flush-on-write)
# ---------------------------------------------------------------------------
class JobStore:
    def __init__(self, path: Path):
        self.path = path
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.RLock()
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            for d in data.get("jobs", []):
                j = Job.from_dict(d)
                self._jobs[j.id] = j
        except Exception as e:
            print(f"[queue] WARNING: failed to load {self.path}: {e}")

    def _flush(self) -> None:
        try:
            payload = {"jobs": [j.to_dict() for j in self._jobs.values()]}
            self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        except Exception as e:
            print(f"[queue] WARNING: failed to write {self.path}: {e}")

    def add(self, job: Job) -> None:
        with self._lock:
            self._jobs[job.id] = job
            self._flush()

    def update(self, job: Job) -> None:
        with self._lock:
            self._jobs[job.id] = job
            self._flush()

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def list(self) -> List[Job]:
        with self._lock:
            return sorted(self._jobs.values(), key=lambda j: j.created_at, reverse=True)

    def next_pending(self) -> Optional[Job]:
        """The oldest job that's not in a terminal or running state."""
        TERMINAL = {JobState.DONE.value, JobState.FAILED.value, JobState.CANCELLED.value}
        with self._lock:
            pending = [
                j for j in self._jobs.values()
                if j.state not in TERMINAL
            ]
            pending.sort(key=lambda j: j.created_at)
            return pending[0] if pending else None


# ---------------------------------------------------------------------------
# Prompt generator: Ollama (optional) + structured template fallback
# ---------------------------------------------------------------------------
PROMPT_TEMPLATE = (
    "{subject_phrase}, isometric 3/4 view, centered isolated 3D game asset, "
    "hard surface design, sharp clean geometry, strong silhouette, "
    "studio product render, even softbox lighting, no harsh shadows, no rim light, "
    "{material_phrase}, painted PBR, no emissive lights, no glow, "
    "plain pure white background, single object centered in frame, fully visible, "
    "no text, no logo, no watermark, no environment, no atmosphere, "
    "no smoke, no particles, no ground plane, no shadow "
    "--ar 1:1 --s 50"
)

OLLAMA_SYSTEM_PROMPT = """You are a Midjourney prompt expert specializing in image-to-3D pipelines.
Given a brief subject description, you produce ONE Midjourney prompt that follows this exact template:

{TEMPLATE}

Rules:
- The prompt MUST end with the flags --ar 1:1 --s 50
- DO NOT use --style raw — it is not compatible with Midjourney v7
- The prompt MUST include the phrases: "isometric 3/4 view", "centered isolated 3D game asset",
  "studio product render", "plain pure white background", "no emissive lights, no glow"
- Materials should be matte/painted, never "glowing" or "luminescent"
- No "lit windows" — use "narrow window slits" or "dark window panels" instead
- No "spires" or "antennas" thinner than a finger — they vanish in 3D extraction
- No "atmosphere", "smoke", "lava", "sparks", or any environmental effects
- Single sentence, no line breaks, no markdown, no commentary
- Output the prompt and nothing else

Style reference: small architectural model rendered for a game asset reference sheet,
Blizzard StarCraft 2 / Riot hand-painted PBR look, dark gunmetal with cyan team-color trim.
""".replace("{TEMPLATE}", PROMPT_TEMPLATE)


class PromptGenerator:
    def __init__(self, model: str = "", host: str = OLLAMA_HOST):
        self.model = model
        self.host = host

    def _ollama_available(self) -> bool:
        if not self.model:
            return False
        try:
            import urllib.request
            with urllib.request.urlopen(f"{self.host}/api/tags", timeout=2) as r:
                data = json.loads(r.read())
            names = {m["name"] for m in data.get("models", [])}
            return any(n.startswith(self.model.split(":")[0]) for n in names)
        except Exception:
            return False

    def generate(self, subject: str) -> str:
        """Produce one full MJ prompt for the given subject text."""
        # 1. Try Ollama if configured + reachable + model available
        if self._ollama_available():
            try:
                return self._ollama_generate(subject)
            except Exception as e:
                print(f"[queue] Ollama generation failed, falling back to template: {e}")
        # 2. Templated fallback
        return self._template_generate(subject)

    def _ollama_generate(self, subject: str) -> str:
        import urllib.request
        body = json.dumps({
            "model": self.model,
            "prompt": f"Subject: {subject}\n\nMidjourney prompt:",
            "system": OLLAMA_SYSTEM_PROMPT,
            "stream": False,
            "options": {"temperature": 0.4, "num_predict": 220},
        }).encode("utf-8")
        req = urllib.request.Request(
            f"{self.host}/api/generate",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            resp = json.loads(r.read())
        text = (resp.get("response") or "").strip()
        # Strip any wrapper quotes / "Prompt:" prefixes the model might add
        text = re.sub(r'^["\']|["\']$', "", text).strip()
        text = re.sub(r"^(prompt|midjourney prompt)\s*:\s*", "", text, flags=re.I).strip()
        # Sanity check: if it doesn't end with our flags, append them.
        # Strip any v6 --style raw the model might have learned.
        text = re.sub(r"\s*--style\s+raw\b", "", text)
        if "--ar 1:1" not in text:
            text = text.rstrip(" .,") + " --ar 1:1 --s 50"
        return text

    def _template_generate(self, subject: str) -> str:
        """Pure template fill — no LLM, but always produces a usable prompt."""
        # Heuristic: if the subject already mentions a colour/material, use it as-is.
        s = subject.strip().rstrip(",.")
        # Phrase the subject as a "small ___ model" so MJ renders an isolated object
        if not s.lower().startswith("a "):
            subject_phrase = f"A small sci-fi {s} model"
        else:
            subject_phrase = s
        material_phrase = (
            "matte painted dark gunmetal grey with subtle cyan team-color trim panels"
        )
        return PROMPT_TEMPLATE.format(
            subject_phrase=subject_phrase,
            material_phrase=material_phrase,
        )


# ---------------------------------------------------------------------------
# Discord / Midjourney bridge
# ---------------------------------------------------------------------------
class DiscordMJBridge:
    """
    Wraps discord.py-self in a dedicated background asyncio loop and exposes a
    synchronous `imagine_and_upscale(prompt)` that blocks until the upscaled
    PNG is downloaded.
    """

    def __init__(self, token: str, channel_id: int):
        self.token = token
        self.channel_id = channel_id
        self._client = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._ready = threading.Event()
        self._channel = None
        self._imagine_cmd = None
        self._thread: Optional[threading.Thread] = None
        self._start_error: Optional[str] = None

    def start(self) -> None:
        if self._thread is not None:
            return
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="DiscordMJBridge")
        self._thread.start()

    def _run_loop(self) -> None:
        try:
            import discord  # discord.py-self provides this
        except ImportError as e:
            self._start_error = f"discord.py-self not installed: {e}"
            self._ready.set()
            return

        loop = asyncio.new_event_loop()
        self._loop = loop
        asyncio.set_event_loop(loop)

        bridge = self  # capture for nested class

        class MJClient(discord.Client):
            async def on_ready(self):
                print(f"[discord-mj] logged in as {self.user} (id={self.user.id})")
                ch = self.get_channel(bridge.channel_id)
                if ch is None:
                    try:
                        ch = await self.fetch_channel(bridge.channel_id)
                    except Exception as e:
                        bridge._start_error = f"fetch_channel({bridge.channel_id}) failed: {e}"
                        bridge._ready.set()
                        return
                bridge._channel = ch
                # Discover MJ's slash commands in this channel
                try:
                    cmds = await ch.application_commands()
                    bridge._imagine_cmd = next(
                        (c for c in cmds if c.name == "imagine"),
                        None,
                    )
                    if bridge._imagine_cmd is None:
                        bridge._start_error = "imagine slash command not found in this channel"
                except Exception as e:
                    bridge._start_error = f"application_commands() failed: {e}"
                bridge._ready.set()

        self._client = MJClient()

        try:
            loop.run_until_complete(self._client.start(self.token))
        except Exception as e:
            self._start_error = f"client.start failed: {e}"
            self._ready.set()
        finally:
            loop.close()

    def wait_until_ready(self, timeout: float = 30) -> None:
        if not self._ready.wait(timeout=timeout):
            raise RuntimeError("Discord client did not become ready within timeout")
        if self._start_error:
            raise RuntimeError(self._start_error)
        if self._imagine_cmd is None:
            raise RuntimeError("/imagine command not discovered")

    def imagine_and_upscale(
        self,
        prompt: str,
        out_dir: Path,
        progress: Callable[[str], None] = print,
        timeout: float = 600,
    ) -> Path:
        """Blocking. Returns path to the downloaded upscaled PNG."""
        self.wait_until_ready()
        future = asyncio.run_coroutine_threadsafe(
            self._async_imagine(prompt, out_dir, progress),
            self._loop,
        )
        return future.result(timeout=timeout)

    async def _async_imagine(self, prompt: str, out_dir: Path, progress) -> Path:
        from datetime import datetime, timezone
        import discord
        ch = self._channel
        my_user_id = self._client.user.id

        # Capture timestamp BEFORE sending so we can filter MJ replies that
        # came after our submission. We don't add any marker text to the
        # prompt itself — MJ rejects strings like "[job:abc]" as
        # "Unrecognized parameter(s)".
        submit_time = datetime.now(timezone.utc)
        progress(f"Sending /imagine to channel {ch.id}...")
        await self._imagine_cmd(prompt=prompt, channel=ch)

        progress("Waiting for MJ grid result (this can take 30-90 seconds)...")
        grid_msg = await self._wait_for_mj_message(
            ch,
            since=submit_time,
            mentions_user_id=my_user_id,
            expect_components=True,
            timeout=300,
        )
        progress(f"Got MJ grid message {grid_msg.id}, clicking U1...")

        # First row of components is U1 U2 U3 U4
        action_row = grid_msg.components[0]
        u1 = action_row.children[0]
        await u1.click()

        progress("Waiting for upscaled image...")
        upscaled = await self._wait_for_mj_message(
            ch,
            since=submit_time,
            mentions_user_id=my_user_id,
            content_contains="Upscaled by",
            expect_attachments=True,
            timeout=300,
        )

        if not upscaled.attachments:
            raise RuntimeError("Upscaled message had no attachments")
        att = upscaled.attachments[0]
        # File name uses the upscaled message id as a stable unique tag
        out_path = out_dir / f"mj_{upscaled.id}.png"
        progress(f"Downloading upscaled image -> {out_path.name}")
        await att.save(str(out_path))
        return out_path

    async def _wait_for_mj_message(
        self,
        channel,
        since,
        mentions_user_id: int,
        content_contains: str = "",
        expect_components: bool = False,
        expect_attachments: bool = False,
        timeout: float = 300,
    ):
        """Poll the channel for an MJ bot message that:
          - was posted after `since` (datetime, UTC, tz-aware)
          - mentions `mentions_user_id` (which is our own user id)
          - optionally contains `content_contains` substring
          - optionally has components / attachments

        Short-circuits with a clean RuntimeError if MJ replies with an
        error message matching the same since+mention filter, so a bad
        prompt fails in seconds rather than waiting out the timeout.
        """
        deadline = time.time() + timeout
        seen_ids = set()
        mention_tag = f"<@{mentions_user_id}>"
        # MJ sometimes uses the nickname-mention form `<@!id>`
        mention_tag_alt = f"<@!{mentions_user_id}>"

        ERROR_PHRASES = (
            "is not compatible",
            "invalid parameter",
            "unrecognized parameter",
            "unknown parameter",
            "blocked prompt",
            "banned prompt",
            "moderation",
            "could not understand",
            "queue is full",
            "subscription is paused",
        )

        while time.time() < deadline:
            async for msg in channel.history(limit=20):
                if msg.id in seen_ids:
                    continue
                seen_ids.add(msg.id)
                if msg.author.id != MJ_BOT_USER_ID:
                    continue
                # Created-at filter (timezone-aware comparison)
                if msg.created_at < since:
                    continue
                content = msg.content or ""
                if mention_tag not in content and mention_tag_alt not in content:
                    continue

                # Fast-fail on MJ error replies that mention us.
                lc = content.lower()
                if any(e in lc for e in ERROR_PHRASES):
                    snippet = content.replace("\n", " ")[:300]
                    raise RuntimeError(f"MJ rejected prompt: {snippet}")

                if content_contains and content_contains not in content:
                    continue
                if expect_components and not msg.components:
                    continue
                if expect_attachments and not msg.attachments:
                    continue
                return msg
            await asyncio.sleep(2)
        raise TimeoutError(
            f"Timed out waiting for MJ message "
            f"(content_contains={content_contains!r}, "
            f"components={expect_components}, attachments={expect_attachments})"
        )


# ---------------------------------------------------------------------------
# 3D runner: adapter onto app.py's existing generate() function.
# We import generate lazily to avoid a circular import at module load time.
# ---------------------------------------------------------------------------
class ThreeDRunner:
    def __init__(self):
        # Map preset name -> (octree_resolution, steps, guidance_scale, decimate_faces)
        self._presets = {
            "fast":     (256, 20, 7.5, 80000),
            "balanced": (256, 30, 7.5, 80000),
            "high":     (256, 30, 8.5, 100000),
            "max":      (384, 50, 9.0, 150000),
        }

    def run(self, image_path: Path, asset_name: str, preset: str = "high") -> Path:
        """Synchronously run shape + texture generation. Returns final GLB path."""
        from PIL import Image
        import app  # type: ignore
        octree, steps, cfg, decimate = self._presets[preset]
        img = Image.open(str(image_path)).convert("RGB")
        glb_path, status = app.run_generation(
            image=img,
            asset_name=asset_name,
            use_texture=True,
            octree_resolution=octree,
            inference_steps=steps,
            guidance_scale=cfg,
            decimate_faces=decimate,
        )
        if not glb_path:
            raise RuntimeError(f"3D generation returned no GLB. Log:\n{status}")
        return Path(glb_path)


class _NullProgress:
    """Stub gr.Progress so app.generate works when called outside Gradio."""
    def __call__(self, *args, **kwargs): pass


# ---------------------------------------------------------------------------
# Auto-install final GLB into the game's assets folder (if name matches)
# ---------------------------------------------------------------------------
class AssetInstaller:
    KNOWN_BUILDINGS = {
        "command_center", "thermal_extractor", "mineral_drill", "habitat_pod",
        "research_lab", "warehouse", "barracks", "defense_turret",
        "shipyard", "trade_depot", "shield_gen",
    }

    def install(self, glb_path: Path, asset_name: str) -> Optional[Path]:
        slug = asset_name.lower().strip()
        if slug not in self.KNOWN_BUILDINGS:
            return None
        GAME_ASSETS_DIR.mkdir(parents=True, exist_ok=True)
        target = GAME_ASSETS_DIR / f"{slug}.glb"
        shutil.copy(str(glb_path), str(target))
        return target


# ---------------------------------------------------------------------------
# Worker thread
# ---------------------------------------------------------------------------
class PipelineWorker(threading.Thread):
    def __init__(
        self,
        store: JobStore,
        prompt_gen: PromptGenerator,
        discord_bridge: Optional[DiscordMJBridge],
        threed: ThreeDRunner,
        installer: AssetInstaller,
    ):
        super().__init__(daemon=True, name="PipelineWorker")
        self.store = store
        self.prompt_gen = prompt_gen
        self.discord_bridge = discord_bridge
        self.threed = threed
        self.installer = installer
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        print("[queue] worker thread started")
        while not self._stop.is_set():
            job = self.store.next_pending()
            if job is None:
                time.sleep(2)
                continue
            try:
                self._process(job)
            except Exception as e:
                tb = traceback.format_exc()
                job.error = f"{e}\n{tb}"
                job.add_log(f"FAILED: {e}")
                job.state = JobState.FAILED.value
                self.store.update(job)
            time.sleep(1)

    def _process(self, job: Job) -> None:
        # Stage 1: prompt generation
        if job.state in (JobState.NEW.value, JobState.PROMPTING.value):
            job.state = JobState.PROMPTING.value
            job.add_log("Generating MJ prompt...")
            self.store.update(job)
            job.prompt = self.prompt_gen.generate(job.subject)
            job.add_log(f"Prompt: {job.prompt[:120]}...")
            job.state = JobState.PROMPT_READY.value
            self.store.update(job)

        # Stage 2: Discord submit + wait
        if job.state == JobState.PROMPT_READY.value:
            if self.discord_bridge is None:
                job.add_log(
                    "Discord bridge not configured. Set DISCORD_TOKEN + "
                    "DISCORD_CHANNEL_ID in asset-pipeline/.env to automate, "
                    "or paste the prompt into MJ yourself and drop the image "
                    "into asset-pipeline/inbox/<job_id>.png to continue."
                )
                # Manual handoff: poll for an inbox file matching this job id
                manual_path = INBOX_DIR / f"{job.id}.png"
                if not manual_path.exists():
                    # Sit in PROMPT_READY until file appears
                    return
                job.mj_local_path = str(manual_path)
                job.state = JobState.MJ_DONE.value
                self.store.update(job)
            else:
                job.state = JobState.MJ_SUBMITTING.value
                self.store.update(job)
                try:
                    img_path = self.discord_bridge.imagine_and_upscale(
                        job.prompt,
                        INBOX_DIR,
                        progress=lambda m: (job.add_log(m), self.store.update(job)),
                    )
                except Exception as e:
                    raise RuntimeError(f"Discord/MJ stage failed: {e}")
                job.mj_local_path = str(img_path)
                job.state = JobState.MJ_DONE.value
                self.store.update(job)

        # Stage 3: Hunyuan3D
        if job.state == JobState.MJ_DONE.value:
            job.state = JobState.THREED_RUNNING.value
            job.add_log(f"Generating 3D model from {Path(job.mj_local_path).name}...")
            self.store.update(job)
            glb = self.threed.run(Path(job.mj_local_path), job.asset_name, preset=job.preset)
            job.glb_path = str(glb)
            job.add_log(f"3D done: {glb.name}")
            self.store.update(job)

        # Stage 4: Install in game (only if name matches a known building)
        if job.glb_path and job.state != JobState.DONE.value:
            job.state = JobState.INSTALLING.value
            self.store.update(job)
            installed = self.installer.install(Path(job.glb_path), job.asset_name)
            if installed:
                job.installed_path = str(installed)
                job.add_log(f"Installed in game: {installed.relative_to(GAME_ASSETS_DIR.parent.parent.parent)}")
            else:
                job.add_log(
                    f"Asset name '{job.asset_name}' not in BUILDING_GLBS — left in output/"
                )
            job.state = JobState.DONE.value
            self.store.update(job)


# ---------------------------------------------------------------------------
# Public singleton
# ---------------------------------------------------------------------------
class PipelineQueue:
    _instance: Optional["PipelineQueue"] = None
    _lock = threading.Lock()

    def __init__(self):
        self.store = JobStore(QUEUE_FILE)
        self.prompt_gen = PromptGenerator(model=OLLAMA_MODEL)
        self.installer = AssetInstaller()
        self.threed = ThreeDRunner()
        self.discord_bridge: Optional[DiscordMJBridge] = None
        if DISCORD_TOKEN and DISCORD_CHANNEL_ID:
            try:
                self.discord_bridge = DiscordMJBridge(DISCORD_TOKEN, DISCORD_CHANNEL_ID)
                self.discord_bridge.start()
                print(f"[queue] Discord bridge starting (channel {DISCORD_CHANNEL_ID})")
            except Exception as e:
                print(f"[queue] Discord bridge failed to start: {e}")
        else:
            print("[queue] No DISCORD_TOKEN/DISCORD_CHANNEL_ID — manual MJ handoff mode")
        self.worker = PipelineWorker(
            store=self.store,
            prompt_gen=self.prompt_gen,
            discord_bridge=self.discord_bridge,
            threed=self.threed,
            installer=self.installer,
        )
        self.worker.start()

    @classmethod
    def instance(cls) -> "PipelineQueue":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def add_job(self, subject: str, asset_name: str, preset: str = "high") -> Job:
        job = Job(
            id=uuid.uuid4().hex[:8],
            subject=subject.strip(),
            asset_name=re.sub(r"[^a-z0-9_]", "", asset_name.lower().replace(" ", "_")) or "asset",
            preset=preset,
        )
        job.add_log(f"Created (subject={subject!r}, preset={preset})")
        self.store.add(job)
        return job

    def list_jobs(self) -> List[Job]:
        return self.store.list()

    def cancel_job(self, job_id: str) -> None:
        job = self.store.get(job_id)
        if job is None:
            return
        if job.state in (JobState.DONE.value, JobState.FAILED.value):
            return
        job.state = JobState.CANCELLED.value
        job.add_log("Cancelled by user")
        self.store.update(job)

    def get_job(self, job_id: str) -> Optional[Job]:
        return self.store.get(job_id)
