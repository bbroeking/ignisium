# Ignisium Building Concept Art Prompts (v2)

Source of truth: `asset-pipeline/prompts.py`. The Pipeline Queue in
the Gradio app reads from that file, NOT this markdown. Edit the dict
and the dropdown updates on next app restart.

Each entry below shows the **subject** (short building description, fed
to the prompt generator) and the **expanded MJ prompt** that the
templated PromptGenerator produces from it. You can paste the expanded
prompt directly into Midjourney v7 if you want to bypass the queue.

All prompts follow these rules:
- isometric 3/4 view, centered isolated 3D game asset
- pure white background, no atmosphere, no shadow, no environment
- no emissive lights, no glow (Hunyuan3D bakes those as lump-mesh)
- matte painted PBR with subtle team-color trim
- `--ar 1:1 --s 50` (low stylization, MJ v7 compatible)

---

## Command Center  (`command_center`)

**Subject:**

> command center building, fortified bunker base with central domed command tower, four corner pylons, narrow window slits, short antenna mast on top, dark gunmetal with subtle cyan team-color trim panels

**Expanded MJ prompt:**

```
A small sci-fi command center building, fortified bunker base with central domed command tower, four corner pylons, narrow window slits, short antenna mast on top, dark gunmetal with subtle cyan team-color trim panels model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with subtle cyan team-color trim panels, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Thermal Extractor  (`thermal_extractor`)

**Subject:**

> thermal energy extractor building, industrial pump station with central turbine ring, thick external pipes, heavy bolted base plate, dark steel hull with amber accent panels

**Expanded MJ prompt:**

```
A small sci-fi thermal energy extractor building, industrial pump station with central turbine ring, thick external pipes, heavy bolted base plate, dark steel hull with amber accent panels model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with subtle cyan team-color trim panels, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Mineral Drill  (`mineral_drill`)

**Subject:**

> mining drill rig building, mechanical drilling arm with diamond bit angled into rock base, reinforced platform, conveyor belt to ore collection bin, dark heavy industrial metal

**Expanded MJ prompt:**

```
A small sci-fi mining drill rig building, mechanical drilling arm with diamond bit angled into rock base, reinforced platform, conveyor belt to ore collection bin, dark heavy industrial metal model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with subtle cyan team-color trim panels, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Habitat Pod  (`habitat_pod`)

**Subject:**

> pressurized habitat dome building, rounded living pod with reinforced equator ring, six dark round porthole panels, small antenna on top, side airlock door, white-grey hull with grey trim

**Expanded MJ prompt:**

```
A small sci-fi pressurized habitat dome building, rounded living pod with reinforced equator ring, six dark round porthole panels, small antenna on top, side airlock door, white-grey hull with grey trim model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with subtle cyan team-color trim panels, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Research Lab  (`research_lab`)

**Subject:**

> research laboratory building, rectangular facility with rooftop satellite dish, raised platform with hologram projector, side sensor arrays, data cables along walls, clean blue-grey metallic

**Expanded MJ prompt:**

```
A small sci-fi research laboratory building, rectangular facility with rooftop satellite dish, raised platform with hologram projector, side sensor arrays, data cables along walls, clean blue-grey metallic model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with subtle cyan team-color trim panels, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Warehouse  (`warehouse`)

**Subject:**

> storage warehouse building, wide low-profile cargo structure with two roll-up bay doors, stacked supply crates outside, loading crane arm on top, dark metal panels with yellow hazard striping

**Expanded MJ prompt:**

```
A small sci-fi storage warehouse building, wide low-profile cargo structure with two roll-up bay doors, stacked supply crates outside, loading crane arm on top, dark metal panels with yellow hazard striping model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with subtle cyan team-color trim panels, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Barracks  (`barracks`)

**Subject:**

> military barracks bunker building, reinforced concrete and metal bunker, thick armor plating, narrow slit windows, heavy blast door at front, sandbag barriers at entrance, dark olive and gunmetal with red warning stripes

**Expanded MJ prompt:**

```
A small sci-fi military barracks bunker building, reinforced concrete and metal bunker, thick armor plating, narrow slit windows, heavy blast door at front, sandbag barriers at entrance, dark olive and gunmetal with red warning stripes model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with subtle cyan team-color trim panels, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Defense Turret  (`defense_turret`)

**Subject:**

> automated defense turret tower, armored cylindrical base, rotating turret head with twin cannon barrels, side ammo box, heavy bolted foundation plate, dark gunmetal with red warning stripes and cyan trim panels

**Expanded MJ prompt:**

```
A small sci-fi automated defense turret tower, armored cylindrical base, rotating turret head with twin cannon barrels, side ammo box, heavy bolted foundation plate, dark gunmetal with red warning stripes and cyan trim panels model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with subtle cyan team-color trim panels, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Shipyard  (`shipyard`)

**Subject:**

> shipyard hangar building, large rectangular hangar bay with wide front opening, overhead gantry crane bridge across the top, raised circular landing pad in front, external bracing struts, dark industrial steel with cyan trim stripes

**Expanded MJ prompt:**

```
A small sci-fi shipyard hangar building, large rectangular hangar bay with wide front opening, overhead gantry crane bridge across the top, raised circular landing pad in front, external bracing struts, dark industrial steel with cyan trim stripes model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with subtle cyan team-color trim panels, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Trade Depot  (`trade_depot`)

**Subject:**

> trade depot platform building, raised square cargo platform with central circular pad, ring of stacked cargo containers around the edge, manifest display screen, small control booth on one side, dark metal hull

**Expanded MJ prompt:**

```
A small sci-fi trade depot platform building, raised square cargo platform with central circular pad, ring of stacked cargo containers around the edge, manifest display screen, small control booth on one side, dark metal hull model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with subtle cyan team-color trim panels, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Shield Generator  (`shield_gen`)

**Subject:**

> planetary shield generator building, cylindrical base with three angled support struts holding up a large spherical emitter on top, thick power conduits running into the ground, dark metal frame with cyan trim panels

**Expanded MJ prompt:**

```
A small sci-fi planetary shield generator building, cylindrical base with three angled support struts holding up a large spherical emitter on top, thick power conduits running into the ground, dark metal frame with cyan trim panels model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with subtle cyan team-color trim panels, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```
