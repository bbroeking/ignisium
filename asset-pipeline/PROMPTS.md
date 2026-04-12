# Ignisium Asset Concept Art Prompts (v3)

Source of truth: `asset-pipeline/prompts.py`. The Pipeline Queue in
the Gradio app reads from that file, NOT this markdown. Edit the dict
and the dropdown updates on next app restart.

## Team-color convention (read this first)

Every per-player tinted region is described as **bright magenta accent panels/stripes**.
The runtime shader (`shaders.js`, `createBuildingShader`) detects pixels close to
pure magenta (1, 0, 1) in the baked PBR texture and substitutes the player team color.

Decorative non-team colors (red warning, yellow hazard, amber accent) stay as-is --
they are outside the magenta hot range and will not be re-tinted.

**Note on existing assets:** the GLBs already in `asset-pipeline/output/` were
generated with the previous *cyan* convention. They keep working in-game with
no errors -- the magenta-mask shader doesn't fire on cyan, so those buildings
render with permanent cyan trim regardless of player. Regenerate them only if
you want them to participate in per-player team tinting.

All prompts follow these rules:
- isometric 3/4 view, centered isolated 3D game asset
- pure white background, no atmosphere, no shadow, no environment
- no emissive lights, no glow (Hunyuan3D bakes those as lump-mesh)
- bright magenta = team-color reservation
- `--ar 1:1 --s 50` (low stylization, MJ v7 compatible)

---

# Buildings

## Command Center  (`command_center`)

**Subject:**

> command center building, fortified bunker base with central domed command tower, four corner pylons, narrow window slits, short antenna mast on top, dark gunmetal with bright magenta accent panels on the corner pylons

**Expanded MJ prompt:**

```
A small sci-fi command center building, fortified bunker base with central domed command tower, four corner pylons, narrow window slits, short antenna mast on top, dark gunmetal with bright magenta accent panels on the corner pylons model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Thermal Extractor  (`thermal_extractor`)

**Subject:**

> thermal energy extractor building, industrial pump station with central turbine ring, thick external pipes, heavy bolted base plate, dark steel hull with amber accent panels and bright magenta accent stripes near the base

**Expanded MJ prompt:**

```
A small sci-fi thermal energy extractor building, industrial pump station with central turbine ring, thick external pipes, heavy bolted base plate, dark steel hull with amber accent panels and bright magenta accent stripes near the base model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Mineral Drill  (`mineral_drill`)

**Subject:**

> mining drill rig building, mechanical drilling arm with diamond bit angled into rock base, reinforced platform, conveyor belt to ore collection bin, dark heavy industrial metal with bright magenta accent panels on the platform sides

**Expanded MJ prompt:**

```
A small sci-fi mining drill rig building, mechanical drilling arm with diamond bit angled into rock base, reinforced platform, conveyor belt to ore collection bin, dark heavy industrial metal with bright magenta accent panels on the platform sides model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Habitat Pod  (`habitat_pod`)

**Subject:**

> pressurized habitat dome building, rounded living pod with reinforced equator ring, six dark round porthole panels, small antenna on top, side airlock door, white-grey hull with bright magenta accent ring around the equator

**Expanded MJ prompt:**

```
A small sci-fi pressurized habitat dome building, rounded living pod with reinforced equator ring, six dark round porthole panels, small antenna on top, side airlock door, white-grey hull with bright magenta accent ring around the equator model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Research Lab  (`research_lab`)

**Subject:**

> research laboratory building, rectangular facility with rooftop satellite dish, raised platform with hologram projector, side sensor arrays, data cables along walls, clean blue-grey metallic with bright magenta accent panels along the roof edge

**Expanded MJ prompt:**

```
A small sci-fi research laboratory building, rectangular facility with rooftop satellite dish, raised platform with hologram projector, side sensor arrays, data cables along walls, clean blue-grey metallic with bright magenta accent panels along the roof edge model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Warehouse  (`warehouse`)

**Subject:**

> storage warehouse building, wide low-profile cargo structure with two roll-up bay doors, stacked supply crates outside, loading crane arm on top, dark metal panels with yellow hazard striping and bright magenta accent panels above the bay doors

**Expanded MJ prompt:**

```
A small sci-fi storage warehouse building, wide low-profile cargo structure with two roll-up bay doors, stacked supply crates outside, loading crane arm on top, dark metal panels with yellow hazard striping and bright magenta accent panels above the bay doors model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Barracks  (`barracks`)

**Subject:**

> military barracks bunker building, reinforced concrete and metal bunker, thick armor plating, narrow slit windows, heavy blast door at front, sandbag barriers at entrance, dark olive and gunmetal with red warning stripes on the door and bright magenta accent panels on the upper armor plating

**Expanded MJ prompt:**

```
A small sci-fi military barracks bunker building, reinforced concrete and metal bunker, thick armor plating, narrow slit windows, heavy blast door at front, sandbag barriers at entrance, dark olive and gunmetal with red warning stripes on the door and bright magenta accent panels on the upper armor plating model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Defense Turret  (`defense_turret`)

**Subject:**

> automated defense turret tower, armored cylindrical base, rotating turret head with twin cannon barrels, side ammo box, heavy bolted foundation plate, dark gunmetal with red warning stripes on the barrels and bright magenta accent panels on the cylindrical base

**Expanded MJ prompt:**

```
A small sci-fi automated defense turret tower, armored cylindrical base, rotating turret head with twin cannon barrels, side ammo box, heavy bolted foundation plate, dark gunmetal with red warning stripes on the barrels and bright magenta accent panels on the cylindrical base model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Shipyard  (`shipyard`)

**Subject:**

> shipyard hangar building, large rectangular hangar bay with wide front opening, overhead gantry crane bridge across the top, raised circular landing pad in front, external bracing struts, dark industrial steel with bright magenta accent stripes along the gantry crane

**Expanded MJ prompt:**

```
A small sci-fi shipyard hangar building, large rectangular hangar bay with wide front opening, overhead gantry crane bridge across the top, raised circular landing pad in front, external bracing struts, dark industrial steel with bright magenta accent stripes along the gantry crane model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Trade Depot  (`trade_depot`)

**Subject:**

> trade depot platform building, raised square cargo platform with central circular pad, ring of stacked cargo containers around the edge, manifest display screen, small control booth on one side, dark metal hull with bright magenta accent panels on the platform corners

**Expanded MJ prompt:**

```
A small sci-fi trade depot platform building, raised square cargo platform with central circular pad, ring of stacked cargo containers around the edge, manifest display screen, small control booth on one side, dark metal hull with bright magenta accent panels on the platform corners model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Shield Generator  (`shield_gen`)

**Subject:**

> planetary shield generator building, cylindrical base with three angled support struts holding up a large spherical emitter on top, thick power conduits running into the ground, dark metal frame with bright magenta accent panels on the support struts

**Expanded MJ prompt:**

```
A small sci-fi planetary shield generator building, cylindrical base with three angled support struts holding up a large spherical emitter on top, thick power conduits running into the ground, dark metal frame with bright magenta accent panels on the support struts model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Power Plant  (`power_plant`)

**Subject:**

> fusion power plant building, blocky rectangular reactor housing with four heavy cooling vents on the roof, thick power conduits running out the sides, raised concrete pad foundation, dark industrial grey with bright magenta accent panels on the cooling vents

**Expanded MJ prompt:**

```
A small sci-fi fusion power plant building, blocky rectangular reactor housing with four heavy cooling vents on the roof, thick power conduits running out the sides, raised concrete pad foundation, dark industrial grey with bright magenta accent panels on the cooling vents model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Refinery  (`refinery`)

**Subject:**

> mineral refinery building, blocky industrial smelter with two tall thick cylindrical processing tanks on top, side conveyor intake, exhaust stack, riveted steel panels, dark rust-streaked industrial metal with bright magenta accent stripes on the processing tanks

**Expanded MJ prompt:**

```
A small sci-fi mineral refinery building, blocky industrial smelter with two tall thick cylindrical processing tanks on top, side conveyor intake, exhaust stack, riveted steel panels, dark rust-streaked industrial metal with bright magenta accent stripes on the processing tanks model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Sensor Tower  (`sensor_tower`)

**Subject:**

> long range sensor tower building, square reinforced base with a tall thick lattice mast holding a wide rotating radar dish on top, heavy bolted foundation, side equipment housing, dark gunmetal with bright magenta accent panels on the dish frame

**Expanded MJ prompt:**

```
A small sci-fi long range sensor tower building, square reinforced base with a tall thick lattice mast holding a wide rotating radar dish on top, heavy bolted foundation, side equipment housing, dark gunmetal with bright magenta accent panels on the dish frame model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Repair Bay  (`repair_bay`)

**Subject:**

> ship repair bay building, open hangar with overhead gantry scaffolding, two side service arms with tool clusters, raised central docking pad, equipment lockers along the back wall, dark industrial metal with yellow hazard striping and bright magenta accent panels on the gantry

**Expanded MJ prompt:**

```
A small sci-fi ship repair bay building, open hangar with overhead gantry scaffolding, two side service arms with tool clusters, raised central docking pad, equipment lockers along the back wall, dark industrial metal with yellow hazard striping and bright magenta accent panels on the gantry model, isometric 3/4 view, centered isolated 3D game asset, hard surface design, sharp clean geometry, strong silhouette, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, fully visible, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

---

# Units

## Fighter  (`fighter`)

**Subject:**

> small sci-fi fighter spacecraft, single-pilot interceptor with swept-forward delta wings, two underwing missile pods, twin engine nacelles at the rear, narrow cockpit canopy, dark gunmetal hull with bright magenta accent stripes along the wings

**Expanded MJ prompt:**

```
A small sci-fi fighter spacecraft, single-pilot interceptor with swept-forward delta wings, two underwing missile pods, twin engine nacelles at the rear, narrow cockpit canopy, dark gunmetal hull with bright magenta accent stripes along the wings, isometric 3/4 view, centered isolated 3D game asset miniature, single character or vehicle, simple recognizable silhouette, hard surface design, sharp clean geometry, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, no display base, no platform, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Transport  (`transport`)

**Subject:**

> boxy sci-fi cargo transport spacecraft, blocky rectangular fuselage with rear cargo ramp, four bulky vectored-thrust engines, heavy landing skids, side service hatches, dark industrial steel with yellow hazard striping and bright magenta accent panels on the engine nacelles

**Expanded MJ prompt:**

```
A boxy sci-fi cargo transport spacecraft, blocky rectangular fuselage with rear cargo ramp, four bulky vectored-thrust engines, heavy landing skids, side service hatches, dark industrial steel with yellow hazard striping and bright magenta accent panels on the engine nacelles, isometric 3/4 view, centered isolated 3D game asset miniature, single character or vehicle, simple recognizable silhouette, hard surface design, sharp clean geometry, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, no display base, no platform, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Colony Ship  (`colony_ship`)

**Subject:**

> large sci-fi colony ship spacecraft, elongated cylindrical main hull with central rotating habitat ring, prominent engine cluster at the rear, communications array at the front, side cargo modules, dark industrial steel with bright magenta accent panels on the habitat ring

**Expanded MJ prompt:**

```
A large sci-fi colony ship spacecraft, elongated cylindrical main hull with central rotating habitat ring, prominent engine cluster at the rear, communications array at the front, side cargo modules, dark industrial steel with bright magenta accent panels on the habitat ring, isometric 3/4 view, centered isolated 3D game asset miniature, single character or vehicle, simple recognizable silhouette, hard surface design, sharp clean geometry, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, no display base, no platform, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Marine  (`marine`)

**Subject:**

> sci-fi power-armored marine soldier, bulky shoulder pauldrons, full helmet with narrow visor slit, chest plate with utility harness, large sci-fi rifle held in both hands, armored boots, dark gunmetal armor with bright magenta accent stripes on the shoulder pauldrons

**Expanded MJ prompt:**

```
A sci-fi power-armored marine soldier, bulky shoulder pauldrons, full helmet with narrow visor slit, chest plate with utility harness, large sci-fi rifle held in both hands, armored boots, dark gunmetal armor with bright magenta accent stripes on the shoulder pauldrons, isometric 3/4 view, centered isolated 3D game asset miniature, single character or vehicle, simple recognizable silhouette, hard surface design, sharp clean geometry, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, no display base, no platform, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Heavy Trooper  (`heavy_trooper`)

**Subject:**

> sci-fi heavy power-armor trooper, very bulky exo-suit with thick armor plates, shoulder-mounted twin rocket pods, large armored gauntlet on one arm holding a heavy minigun, full sealed helmet with single visor slit, dark steel armor with bright magenta accent panels on the chest plate

**Expanded MJ prompt:**

```
A sci-fi heavy power-armor trooper, very bulky exo-suit with thick armor plates, shoulder-mounted twin rocket pods, large armored gauntlet on one arm holding a heavy minigun, full sealed helmet with single visor slit, dark steel armor with bright magenta accent panels on the chest plate, isometric 3/4 view, centered isolated 3D game asset miniature, single character or vehicle, simple recognizable silhouette, hard surface design, sharp clean geometry, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, no display base, no platform, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Engineer Drone  (`engineer_drone`)

**Subject:**

> small sci-fi engineer drone robot, hovering disk-shaped chassis with two articulated tool arms underneath holding a wrench and a welder, central sensor lens, side thruster vents, dark industrial metal with yellow hazard striping and bright magenta accent panels on the chassis rim

**Expanded MJ prompt:**

```
A small sci-fi engineer drone robot, hovering disk-shaped chassis with two articulated tool arms underneath holding a wrench and a welder, central sensor lens, side thruster vents, dark industrial metal with yellow hazard striping and bright magenta accent panels on the chassis rim, isometric 3/4 view, centered isolated 3D game asset miniature, single character or vehicle, simple recognizable silhouette, hard surface design, sharp clean geometry, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, no display base, no platform, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

## Scout Drone  (`scout_drone`)

**Subject:**

> small sci-fi scout drone aircraft, sleek arrowhead-shaped fuselage with two slim wing-mounted sensor pods, single rear thruster, central optical sensor lens at the front, no cockpit, matte dark grey hull with bright magenta accent stripes on the wing leading edges

**Expanded MJ prompt:**

```
A small sci-fi scout drone aircraft, sleek arrowhead-shaped fuselage with two slim wing-mounted sensor pods, single rear thruster, central optical sensor lens at the front, no cockpit, matte dark grey hull with bright magenta accent stripes on the wing leading edges, isometric 3/4 view, centered isolated 3D game asset miniature, single character or vehicle, simple recognizable silhouette, hard surface design, sharp clean geometry, studio product render, even softbox lighting, no harsh shadows, no rim light, matte painted dark gunmetal grey with bright magenta accent panels reserved for team color, painted PBR, no emissive lights, no glow, plain pure white background, single object centered in frame, no display base, no platform, no text, no logo, no watermark, no environment, no atmosphere, no smoke, no particles, no ground plane, no shadow --ar 1:1 --s 50
```

