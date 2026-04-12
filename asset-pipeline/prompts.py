"""
Source of truth for Ignisium asset prompt subjects.

Two dicts:
  BUILDING_PROMPTS  -- static structures placed on a colony tile
  UNIT_PROMPTS      -- moving entities (ships, troopers, drones)

Each entry's `subject` text is fed to PromptGenerator in pipeline_queue.py,
which wraps it in either PROMPT_TEMPLATE (buildings) or PROMPT_TEMPLATE_UNIT
(units) before sending to Midjourney.

================================================================
TEAM-COLOR CONVENTION (important)
================================================================
Any region that should re-tint per player is described as
"bright magenta accent panels/stripes/markers" -- NOT cyan, NOT
"team-color".

The runtime shader (shaders.js, createBuildingShader) detects pixels
near (1.0, 0.0, 1.0) in the baked PBR texture and substitutes
uTeamColor. Magenta is chosen because it almost never appears in
naturally-rendered metal/concrete/plastic, so false positives are rare.

Decorative non-team colors (red warning stripes, yellow hazard
tape, amber accent lights, etc.) stay as-is -- they're not in the
team-color hot range.

================================================================
SUBJECT-WRITING RULES
================================================================
- Concrete geometric description, no fluff
- No "glowing", "lit", "emissive" -- Hunyuan3D bakes those as lump-mesh
- No environment / atmosphere / smoke / lava / sparks
- Use "narrow window slits" or "dark window panels" instead of "lit windows"
- Avoid spires/antennas thinner than a finger (they vanish in mesh extraction)
- Always describe a complete, isolated, full-body asset
- For units: describe a single character/vehicle, simple silhouette

The keys MUST match the type keys consumed by main.js (BUILDING_GLBS,
ShipDefs, GroundUnitDefs) so the auto-installer can copy generated GLBs
to the right /assets/models/<category>/<key>.glb path.
"""

# ---------------------------------------------------------------------------
# BUILDINGS
# ---------------------------------------------------------------------------
BUILDING_PROMPTS = {
    "command_center": {
        "label": "Command Center",
        "subject": (
            "command center building, fortified bunker base with central domed "
            "command tower, four corner pylons, narrow window slits, short "
            "antenna mast on top, dark gunmetal with bright magenta accent "
            "panels on the corner pylons"
        ),
    },
    "thermal_extractor": {
        "label": "Thermal Extractor",
        "subject": (
            "thermal energy extractor building, industrial pump station with "
            "central turbine ring, thick external pipes, heavy bolted base "
            "plate, dark steel hull with amber accent panels and bright "
            "magenta accent stripes near the base"
        ),
    },
    "mineral_drill": {
        "label": "Mineral Drill",
        "subject": (
            "mining drill rig building, mechanical drilling arm with diamond "
            "bit angled into rock base, reinforced platform, conveyor belt to "
            "ore collection bin, dark heavy industrial metal with bright "
            "magenta accent panels on the platform sides"
        ),
    },
    "habitat_pod": {
        "label": "Habitat Pod",
        "subject": (
            "pressurized habitat dome building, rounded living pod with "
            "reinforced equator ring, six dark round porthole panels, small "
            "antenna on top, side airlock door, white-grey hull with bright "
            "magenta accent ring around the equator"
        ),
    },
    "research_lab": {
        "label": "Research Lab",
        "subject": (
            "research laboratory building, rectangular facility with rooftop "
            "satellite dish, raised platform with hologram projector, side "
            "sensor arrays, data cables along walls, clean blue-grey metallic "
            "with bright magenta accent panels along the roof edge"
        ),
    },
    "warehouse": {
        "label": "Warehouse",
        "subject": (
            "storage warehouse building, wide low-profile cargo structure with "
            "two roll-up bay doors, stacked supply crates outside, loading "
            "crane arm on top, dark metal panels with yellow hazard striping "
            "and bright magenta accent panels above the bay doors"
        ),
    },
    "barracks": {
        "label": "Barracks",
        "subject": (
            "military barracks bunker building, reinforced concrete and metal "
            "bunker, thick armor plating, narrow slit windows, heavy blast "
            "door at front, sandbag barriers at entrance, dark olive and "
            "gunmetal with red warning stripes on the door and bright magenta "
            "accent panels on the upper armor plating"
        ),
    },
    "defense_turret": {
        "label": "Defense Turret",
        "subject": (
            "automated defense turret tower, armored cylindrical base, "
            "rotating turret head with twin cannon barrels, side ammo box, "
            "heavy bolted foundation plate, dark gunmetal with red warning "
            "stripes on the barrels and bright magenta accent panels on the "
            "cylindrical base"
        ),
    },
    "shipyard": {
        "label": "Shipyard",
        "subject": (
            "shipyard hangar building, large rectangular hangar bay with wide "
            "front opening, overhead gantry crane bridge across the top, "
            "raised circular landing pad in front, external bracing struts, "
            "dark industrial steel with bright magenta accent stripes along "
            "the gantry crane"
        ),
    },
    "trade_depot": {
        "label": "Trade Depot",
        "subject": (
            "trade depot platform building, raised square cargo platform with "
            "central circular pad, ring of stacked cargo containers around "
            "the edge, manifest display screen, small control booth on one "
            "side, dark metal hull with bright magenta accent panels on the "
            "platform corners"
        ),
    },
    "shield_gen": {
        "label": "Shield Generator",
        "subject": (
            "planetary shield generator building, cylindrical base with three "
            "angled support struts holding up a large spherical emitter on "
            "top, thick power conduits running into the ground, dark metal "
            "frame with bright magenta accent panels on the support struts"
        ),
    },
    # --- New buildings -----------------------------------------------------
    "power_plant": {
        "label": "Power Plant",
        "subject": (
            "fusion power plant building, blocky rectangular reactor housing "
            "with four heavy cooling vents on the roof, thick power conduits "
            "running out the sides, raised concrete pad foundation, dark "
            "industrial grey with bright magenta accent panels on the cooling "
            "vents"
        ),
    },
    "refinery": {
        "label": "Refinery",
        "subject": (
            "mineral refinery building, blocky industrial smelter with two "
            "tall thick cylindrical processing tanks on top, side conveyor "
            "intake, exhaust stack, riveted steel panels, dark rust-streaked "
            "industrial metal with bright magenta accent stripes on the "
            "processing tanks"
        ),
    },
    "sensor_tower": {
        "label": "Sensor Tower",
        "subject": (
            "long range sensor tower building, square reinforced base with a "
            "tall thick lattice mast holding a wide rotating radar dish on "
            "top, heavy bolted foundation, side equipment housing, dark "
            "gunmetal with bright magenta accent panels on the dish frame"
        ),
    },
    "repair_bay": {
        "label": "Repair Bay",
        "subject": (
            "ship repair bay building, open hangar with overhead gantry "
            "scaffolding, two side service arms with tool clusters, raised "
            "central docking pad, equipment lockers along the back wall, "
            "dark industrial metal with yellow hazard striping and bright "
            "magenta accent panels on the gantry"
        ),
    },
}


# ---------------------------------------------------------------------------
# UNITS
# ---------------------------------------------------------------------------
# Units differ from buildings: smaller scale, simpler silhouette, often need
# to be readable at 1/4 of building screen size. They use PROMPT_TEMPLATE_UNIT
# (defined in pipeline_queue.py) which adds "miniature" / "single object" and
# drops the "fully visible building" framing.
UNIT_PROMPTS = {
    # --- Ships (built at Shipyard, defined in main.js ShipDefs) ---
    "fighter": {
        "label": "Fighter",
        "subject": (
            "small sci-fi fighter spacecraft, single-pilot interceptor with "
            "swept-forward delta wings, two underwing missile pods, twin "
            "engine nacelles at the rear, narrow cockpit canopy, dark "
            "gunmetal hull with bright magenta accent stripes along the "
            "wings"
        ),
    },
    "transport": {
        "label": "Transport",
        "subject": (
            "boxy sci-fi cargo transport spacecraft, blocky rectangular "
            "fuselage with rear cargo ramp, four bulky vectored-thrust "
            "engines, heavy landing skids, side service hatches, dark "
            "industrial steel with yellow hazard striping and bright "
            "magenta accent panels on the engine nacelles"
        ),
    },
    "colony_ship": {
        "label": "Colony Ship",
        "subject": (
            "large sci-fi colony ship spacecraft, elongated cylindrical "
            "main hull with central rotating habitat ring, prominent "
            "engine cluster at the rear, communications array at the "
            "front, side cargo modules, dark industrial steel with "
            "bright magenta accent panels on the habitat ring"
        ),
    },
    # --- Ground units (trained at Barracks) ---
    "marine": {
        "label": "Marine",
        "subject": (
            "sci-fi power-armored marine soldier, bulky shoulder pauldrons, "
            "full helmet with narrow visor slit, chest plate with utility "
            "harness, large sci-fi rifle held in both hands, armored boots, "
            "dark gunmetal armor with bright magenta accent stripes on the "
            "shoulder pauldrons"
        ),
    },
    "heavy_trooper": {
        "label": "Heavy Trooper",
        "subject": (
            "sci-fi heavy power-armor trooper, very bulky exo-suit with "
            "thick armor plates, shoulder-mounted twin rocket pods, large "
            "armored gauntlet on one arm holding a heavy minigun, full "
            "sealed helmet with single visor slit, dark steel armor with "
            "bright magenta accent panels on the chest plate"
        ),
    },
    "engineer_drone": {
        "label": "Engineer Drone",
        "subject": (
            "small sci-fi engineer drone robot, hovering disk-shaped chassis "
            "with two articulated tool arms underneath holding a wrench and "
            "a welder, central sensor lens, side thruster vents, dark "
            "industrial metal with yellow hazard striping and bright magenta "
            "accent panels on the chassis rim"
        ),
    },
    "scout_drone": {
        "label": "Scout Drone",
        "subject": (
            "small sci-fi scout drone aircraft, sleek arrowhead-shaped "
            "fuselage with two slim wing-mounted sensor pods, single rear "
            "thruster, central optical sensor lens at the front, no cockpit, "
            "matte dark grey hull with bright magenta accent stripes on the "
            "wing leading edges"
        ),
    },
}


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# CELESTIAL TEXTURES (planets, sun)
# ---------------------------------------------------------------------------
# These are NOT for the Hunyuan3D mesh pipeline. They are TEXTURE prompts:
# Midjourney -> PNG -> wrapped onto an existing SphereGeometry in main.js
# as a `map:` (planets) or `emissiveMap:` (sun).
#
# Aesthetic target: Spore-style stylized planet illustration -- saturated,
# exaggerated, hand-painted, single orb centered on pure black background.
# No spaceships, no stars, no nebulae in frame. The orb fills ~70% of the
# square so we have room to extract the alpha around the limb.
#
# Per-planet keys MUST match the names in main.js PlanetDefs so the texture
# loader can find the right file: ignisium, crystara, verdania, nethara, sun.
CELESTIAL_PROMPTS = {
    "ignisium": {
        "label": "Ignisium (Volcanic)",
        "subject": (
            "stylized fictional volcanic planet viewed from deep space, "
            "cracked obsidian-black crust webbed with glowing red-orange "
            "magma rivers, bright lava lakes pooled in deep craters, "
            "billowing ash plumes drifting from active volcanoes, dark "
            "rocky highlands, vivid saturated reds and oranges against "
            "black rock"
        ),
    },
    "crystara": {
        "label": "Crystara (Crystal Ice)",
        "subject": (
            "stylized fictional crystal ice planet viewed from deep space, "
            "thick refractive crystalline ice continents, prismatic shards "
            "catching cyan and turquoise light, vast frozen oceans of "
            "pale aquamarine, swirling thin pearl-white cloud bands, "
            "glittering polar ice caps, vivid saturated blues and whites"
        ),
    },
    "verdania": {
        "label": "Verdania (Temperate)",
        "subject": (
            "stylized fictional Earth-like temperate planet viewed from "
            "deep space, lush emerald green continents with golden-yellow "
            "plains and dark forest belts, deep cobalt blue oceans, soft "
            "swirling white cumulus cloud bands, white polar ice caps, "
            "vivid saturated greens and blues, friendly inviting feel"
        ),
    },
    "nethara": {
        "label": "Nethara (Gas Giant)",
        "subject": (
            "stylized fictional gas giant planet viewed from deep space, "
            "massive horizontal swirling atmospheric bands in vivid pink "
            "magenta amber and purple, prominent great storm vortex on "
            "one hemisphere, turbulent eddies between bands, no solid "
            "surface, painterly hand-illustrated bands like a marble"
        ),
    },
    "sun": {
        "label": "Sun (Star)",
        "subject": (
            "stylized fictional yellow-orange G-type star viewed from "
            "space, intense bright golden-white photosphere with darker "
            "convection cell granulation across the surface, several "
            "prominent solar flare arcs curling off the limb, subtle "
            "sunspots, hot intense vivid orange-yellow glow, no rays, "
            "single solid orb"
        ),
    },
}


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------
def get_subject(asset_name: str) -> str:
    """Return the subject text for a given asset name (any category)."""
    info = (BUILDING_PROMPTS.get(asset_name)
            or UNIT_PROMPTS.get(asset_name)
            or CELESTIAL_PROMPTS.get(asset_name))
    return info["subject"] if info else ""


def get_kind(asset_name: str) -> str:
    """Returns 'building', 'unit', 'celestial', or '' if unknown."""
    if asset_name in BUILDING_PROMPTS:
        return "building"
    if asset_name in UNIT_PROMPTS:
        return "unit"
    if asset_name in CELESTIAL_PROMPTS:
        return "celestial"
    return ""


def list_choices():
    """All assets as (label, asset_name, kind) tuples for UI dropdowns."""
    out = [(v["label"], k, "building") for k, v in BUILDING_PROMPTS.items()]
    out += [(v["label"], k, "unit") for k, v in UNIT_PROMPTS.items()]
    out += [(v["label"], k, "celestial") for k, v in CELESTIAL_PROMPTS.items()]
    return out


def list_buildings():
    """Buildings only -- (label, asset_name) tuples."""
    return [(v["label"], k) for k, v in BUILDING_PROMPTS.items()]


def list_units():
    """Units only -- (label, asset_name) tuples."""
    return [(v["label"], k) for k, v in UNIT_PROMPTS.items()]


def list_celestial():
    """Celestial bodies only (planets, sun) -- (label, asset_name) tuples."""
    return [(v["label"], k) for k, v in CELESTIAL_PROMPTS.items()]
