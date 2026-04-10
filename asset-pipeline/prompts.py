"""
Source of truth for Ignisium building prompt subjects.

Each entry is the SHORT subject text that gets fed to the PromptGenerator,
which then wraps it in our image-to-3D friendly template (white background,
no atmosphere, no glow, --ar 1:1 --style raw, etc.).

Rules these subjects follow:
  - Concrete geometric description, no fluff
  - No "glowing", "lit", "emissive" — Hunyuan3D bakes those as lump-mesh
  - No environment / atmosphere / smoke / lava / sparks
  - Use "narrow window slits" or "dark window panels" instead of "lit windows"
  - Avoid spires/antennas thinner than a finger (they vanish in mesh extraction)
  - Always describe a complete, isolated, full-body building

The keys MUST match the building type keys in main.js's BUILDING_GLBS so the
auto-installer can copy the GLB into public/assets/models/buildings/<key>.glb.
"""

BUILDING_PROMPTS = {
    "command_center": {
        "label": "Command Center",
        "subject": (
            "command center building, fortified bunker base with central domed "
            "command tower, four corner pylons, narrow window slits, short "
            "antenna mast on top, dark gunmetal with subtle cyan team-color "
            "trim panels"
        ),
    },
    "thermal_extractor": {
        "label": "Thermal Extractor",
        "subject": (
            "thermal energy extractor building, industrial pump station with "
            "central turbine ring, thick external pipes, heavy bolted base "
            "plate, dark steel hull with amber accent panels"
        ),
    },
    "mineral_drill": {
        "label": "Mineral Drill",
        "subject": (
            "mining drill rig building, mechanical drilling arm with diamond "
            "bit angled into rock base, reinforced platform, conveyor belt to "
            "ore collection bin, dark heavy industrial metal"
        ),
    },
    "habitat_pod": {
        "label": "Habitat Pod",
        "subject": (
            "pressurized habitat dome building, rounded living pod with "
            "reinforced equator ring, six dark round porthole panels, small "
            "antenna on top, side airlock door, white-grey hull with grey trim"
        ),
    },
    "research_lab": {
        "label": "Research Lab",
        "subject": (
            "research laboratory building, rectangular facility with rooftop "
            "satellite dish, raised platform with hologram projector, side "
            "sensor arrays, data cables along walls, clean blue-grey metallic"
        ),
    },
    "warehouse": {
        "label": "Warehouse",
        "subject": (
            "storage warehouse building, wide low-profile cargo structure with "
            "two roll-up bay doors, stacked supply crates outside, loading "
            "crane arm on top, dark metal panels with yellow hazard striping"
        ),
    },
    "barracks": {
        "label": "Barracks",
        "subject": (
            "military barracks bunker building, reinforced concrete and metal "
            "bunker, thick armor plating, narrow slit windows, heavy blast "
            "door at front, sandbag barriers at entrance, dark olive and "
            "gunmetal with red warning stripes"
        ),
    },
    "defense_turret": {
        "label": "Defense Turret",
        "subject": (
            "automated defense turret tower, armored cylindrical base, "
            "rotating turret head with twin cannon barrels, side ammo box, "
            "heavy bolted foundation plate, dark gunmetal with red warning "
            "stripes and cyan trim panels"
        ),
    },
    "shipyard": {
        "label": "Shipyard",
        "subject": (
            "shipyard hangar building, large rectangular hangar bay with wide "
            "front opening, overhead gantry crane bridge across the top, "
            "raised circular landing pad in front, external bracing struts, "
            "dark industrial steel with cyan trim stripes"
        ),
    },
    "trade_depot": {
        "label": "Trade Depot",
        "subject": (
            "trade depot platform building, raised square cargo platform with "
            "central circular pad, ring of stacked cargo containers around "
            "the edge, manifest display screen, small control booth on one "
            "side, dark metal hull"
        ),
    },
    "shield_gen": {
        "label": "Shield Generator",
        "subject": (
            "planetary shield generator building, cylindrical base with three "
            "angled support struts holding up a large spherical emitter on "
            "top, thick power conduits running into the ground, dark metal "
            "frame with cyan trim panels"
        ),
    },
}


def get_subject(asset_name: str) -> str:
    """Return the subject text for a given asset name, or empty string."""
    info = BUILDING_PROMPTS.get(asset_name)
    return info["subject"] if info else ""


def list_choices():
    """Returns a list of (label, asset_name) tuples for UI dropdowns."""
    return [(v["label"], k) for k, v in BUILDING_PROMPTS.items()]
